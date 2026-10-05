// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { createPagesEmulatorServer } = require('../scripts/serve_pages_emulator.js');

/**
 * Playwright E2E Suite: Cross-Device Multi-Context Sync Simulation
 * Tests 2 independent browser contexts (Device A and Device B) using a shared Fake Cloud Server:
 * 1. Progress mastered on A appears on B after sync.
 * 2. Offline independent edits on both sides merge deterministically on reconnect.
 * 3. Sign-out clears auth session but keeps all local progress intact.
 * 4. "Delete my cloud data" cleans remote store while preserving local device data.
 * 5. Cloud backend downtime/errors do not interrupt app usage or lose progress.
 */

test.describe('Cross-Device Progress Sync: Two-Context E2E Verification', () => {
  let appServer = null;
  let appUrl = '';
  let cloudServer = null;
  let cloudUrl = '';

  const siteDir = path.resolve(__dirname, '..', 'site');
  const cloudStore = new Map();
  let simulateCloudError = false;

  test.beforeAll(async () => {
    // 1. Build distribution
    const { buildSite } = require('../scripts/build_site.js');
    buildSite();

    // 2. Start app static server
    appServer = createPagesEmulatorServer(0, siteDir);
    await new Promise(resolve => appServer.listen(0, '127.0.0.1', resolve));
    const appPort = appServer.address().port;
    appUrl = `http://127.0.0.1:${appPort}/`;

    // 3. Start fake cloud HTTP server
    cloudServer = http.createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (simulateCloudError) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Simulated Cloud Outage' }));
        return;
      }

      const match = req.url ? req.url.match(/^\/cloud\/users\/([^/?]+)/) : null;
      if (!match) {
        res.writeHead(404);
        res.end();
        return;
      }

      const uid = match[1];

      if (req.method === 'GET') {
        if (!cloudStore.has(uid)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'User document not found' }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ data: cloudStore.get(uid) }));
        }
      } else if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            cloudStore.set(uid, parsed.data);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
      } else if (req.method === 'DELETE') {
        cloudStore.delete(uid);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      }
    });

    await new Promise(resolve => cloudServer.listen(0, '127.0.0.1', resolve));
    const cloudPort = cloudServer.address().port;
    cloudUrl = `http://127.0.0.1:${cloudPort}`;

    console.log(`[Sync-E2E] App Server: ${appUrl}`);
    console.log(`[Sync-E2E] Fake Cloud Server: ${cloudUrl}`);
  });

  test.afterAll(async () => {
    if (appServer) await new Promise(resolve => appServer.close(resolve));
    if (cloudServer) await new Promise(resolve => cloudServer.close(resolve));
  });

  test('Cross-device sync workflow: Device A -> Cloud -> Device B with conflict resolution', async ({ browser }) => {
    // Client-side adapter injection helper
    const setupAdapterInPage = async (page) => {
      await page.evaluate((backendUrl) => {
        class HttpCloudAdapter {
          constructor(url) {
            this.url = url;
            this.currentUser = null;
            this.listeners = new Set();
          }
          isConfigured() { return true; }
          async signIn(user = { uid: 'user_e2e_999', email: 'e2e@example.com', displayName: 'E2E Learner' }) {
            this.currentUser = user;
            for (const cb of this.listeners) cb(this.currentUser);
            return this.currentUser;
          }
          async signOut() {
            this.currentUser = null;
            for (const cb of this.listeners) cb(null);
          }
          onAuthChange(cb) {
            this.listeners.add(cb);
            return () => this.listeners.delete(cb);
          }
          async load(uid) {
            const res = await fetch(`${this.url}/cloud/users/${uid}`);
            if (res.status === 404) return null;
            if (!res.ok) throw new Error(`Cloud error ${res.status}`);
            const json = await res.json();
            return json.data;
          }
          async save(uid, data) {
            const res = await fetch(`${this.url}/cloud/users/${uid}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data })
            });
            if (!res.ok) throw new Error(`Cloud save error ${res.status}`);
          }
          async deleteData(uid) {
            const res = await fetch(`${this.url}/cloud/users/${uid}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(`Cloud delete error ${res.status}`);
          }
        }

        window.testHttpAdapter = new HttpCloudAdapter(backendUrl);
        window.syncManager.setAdapter(window.testHttpAdapter);
      }, cloudUrl);
    };

    // 1. Create two isolated browser contexts
    const contextA = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const contextB = await browser.newContext({ viewport: { width: 390, height: 844 } });

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // 2. Load app on Device A
    await pageA.goto(appUrl, { waitUntil: 'domcontentloaded' });
    await setupAdapterInPage(pageA);

    // Device A signs in
    await pageA.evaluate(async () => {
      await window.syncManager.signIn();
    });

    // Device A masters word index 0 in obst (mcq and listen)
    await pageA.evaluate(() => {
      window.applyResult('obst', 'mcq', 0, true);
      window.applyResult('obst', 'mcq', 0, true);
      window.applyResult('obst', 'listen', 0, true);
    });

    // Device A flushes save to cloud
    await pageA.evaluate(async () => {
      await window.syncManager.flushSave();
    });

    // Assert cloud store received Device A's progress
    expect(cloudStore.has('user_e2e_999')).toBe(true);
    const cloudDoc = cloudStore.get('user_e2e_999');
    expect(cloudDoc.progress.obst.mcq.counts['0']).toBeGreaterThanOrEqual(2);

    // 3. Load app on Device B
    await pageB.goto(appUrl, { waitUntil: 'domcontentloaded' });
    await setupAdapterInPage(pageB);

    // Device B signs in as the same user
    await pageB.evaluate(async () => {
      await window.syncManager.signIn();
    });

    // Assert Device B received Device A's progress from cloud!
    const progB = await pageB.evaluate(() => window.progress.obst);
    expect(progB.mcq.counts['0']).toBeGreaterThanOrEqual(2);
    expect(progB.listen.counts['0']).toBeGreaterThanOrEqual(1);

    // 4. Test Offline Conflict Resolution (Concurrent Studying)
    // Device A studies word 1 while isolated
    await pageA.evaluate(() => {
      window.applyResult('obst', 'mcq', 1, true);
      window.applyResult('obst', 'mcq', 1, true);
    });

    // Device B studies word 2 while isolated
    await pageB.evaluate(() => {
      window.applyResult('obst', 'mcq', 2, true);
      window.applyResult('obst', 'mcq', 2, true);
    });

    // Both devices flush saves sequentially (simulating reconnect)
    await pageA.evaluate(async () => {
      await window.syncManager.flushSave();
    });

    await pageB.evaluate(async () => {
      await window.syncManager.syncOnSignIn(); // triggers merge with cloud
    });

    // Now Device A also syncs to pick up B's additions
    await pageA.evaluate(async () => {
      await window.syncManager.syncOnSignIn();
    });

    // Both devices should now have both word 1 and word 2 mastered!
    const finalProgA = await pageA.evaluate(() => window.progress.obst.mcq.counts);
    const finalProgB = await pageB.evaluate(() => window.progress.obst.mcq.counts);

    expect(finalProgA['1']).toBeGreaterThanOrEqual(2);
    expect(finalProgA['2']).toBeGreaterThanOrEqual(2);
    expect(finalProgB['1']).toBeGreaterThanOrEqual(2);
    expect(finalProgB['2']).toBeGreaterThanOrEqual(2);

    // 5. Test Sign-Out on Device A
    await pageA.evaluate(async () => {
      await window.syncManager.signOut();
    });

    // Verify local data on A remains completely intact
    const localProgAfterSignOut = await pageA.evaluate(() => window.progress.obst.mcq.counts);
    expect(localProgAfterSignOut['0']).toBeGreaterThanOrEqual(2);
    expect(localProgAfterSignOut['1']).toBeGreaterThanOrEqual(2);

    // 6. Test Delete Cloud Data from Device B
    await pageB.evaluate(async () => {
      await window.syncManager.deleteCloudData();
    });

    expect(cloudStore.has('user_e2e_999')).toBe(false);

    // Verify local data on B remains intact
    const localProgOnBAfterDelete = await pageB.evaluate(() => window.progress.obst.mcq.counts);
    expect(localProgOnBAfterDelete['2']).toBeGreaterThanOrEqual(2);

    // 7. Test Backend Outage Resilience
    simulateCloudError = true;
    const errorResult = await pageB.evaluate(async () => {
      try {
        window.applyResult('obst', 'mcq', 3, true);
        await window.syncManager.flushSave();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });

    // Local learning succeeded without throwing crash
    const word3Count = await pageB.evaluate(() => window.progress.obst.mcq.counts['3']);
    expect(word3Count).toBeGreaterThanOrEqual(1);

    // Cleanup contexts
    await contextA.close();
    await contextB.close();
  });
});
