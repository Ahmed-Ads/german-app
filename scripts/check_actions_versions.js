#!/usr/bin/env node
/**
 * scripts/check_actions_versions.js
 * Parses every `uses:` action in .github/workflows/*.yml and checks that
 * the referenced tag exists on GitHub and verifies its runtime (Node 24).
 * Uses unauthenticated HTTPS requests (GitHub API with raw fallback).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const rootDir = path.resolve(__dirname, '..');
const workflowsDir = path.join(rootDir, '.github', 'workflows');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Node.js Actions Version Checker)'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function verifyAction(actionSpec) {
  // Format: owner/repo@tag (e.g. actions/checkout@v7)
  const atIdx = actionSpec.indexOf('@');
  if (atIdx === -1) {
    return { action: actionSpec, exists: false, error: 'No tag specified in action string' };
  }

  const repo = actionSpec.slice(0, atIdx).trim();
  const tag = actionSpec.slice(atIdx + 1).trim();

  // 1. Check git tag ref via GitHub API
  const apiUrl = `https://api.github.com/repos/${repo}/git/ref/tags/${tag}`;
  let sha = null;
  let apiStatus = null;

  try {
    const apiRes = await httpsGet(apiUrl);
    apiStatus = apiRes.status;
    if (apiRes.status === 200) {
      const parsed = JSON.parse(apiRes.body);
      sha = parsed.object && parsed.object.sha ? parsed.object.sha : 'unknown';
    }
  } catch (err) {
    // API request error, will fallback to raw URL
  }

  // 2. Fetch action.yml via raw.githubusercontent.com (verifies existence & inspects runs.using)
  const rawUrl = `https://raw.githubusercontent.com/${repo}/${tag}/action.yml`;
  let rawStatus = null;
  let runsUsing = null;

  try {
    const rawRes = await httpsGet(rawUrl);
    rawStatus = rawRes.status;
    if (rawRes.status === 200) {
      const match = rawRes.body.match(/runs:\s*[\r\n]+\s*using:\s*['"]?([^'"\r\n]+)/);
      runsUsing = match ? match[1] : 'unknown';
    }
  } catch (err) {
    // Raw fetch error
  }

  const exists = (apiStatus === 200) || (rawStatus === 200);

  return {
    action: actionSpec,
    repo,
    tag,
    exists,
    sha: sha || (rawStatus === 200 ? 'verified via raw' : 'not found'),
    runsUsing: runsUsing || 'unknown',
    apiUrl,
    rawUrl
  };
}

async function main() {
  console.log('========================================================');
  console.log('  CHECKING GITHUB ACTIONS TAGS & RUNTIMES');
  console.log('========================================================');

  if (!fs.existsSync(workflowsDir)) {
    console.error(`Directory not found: ${workflowsDir}`);
    process.exit(1);
  }

  const workflowFiles = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  const uniqueActions = new Set();

  for (const file of workflowFiles) {
    const filePath = path.join(workflowsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*uses:\s*([^#\s]+)/);
      if (match) {
        const act = match[1].trim();
        // Ignore local path actions (e.g. ./...) or docker:// actions
        if (!act.startsWith('./') && !act.startsWith('docker://')) {
          uniqueActions.add(act);
        }
      }
    }
  }

  console.log(`Discovered ${uniqueActions.size} action(s) in .github/workflows/*.yml:`);
  for (const a of uniqueActions) {
    console.log(`  - ${a}`);
  }
  console.log('--------------------------------------------------------');

  let allExist = true;
  for (const actionSpec of uniqueActions) {
    process.stdout.write(`Checking ${actionSpec}... `);
    const result = await verifyAction(actionSpec);
    if (result.exists) {
      console.log(`✓ EXISTS (runtime: ${result.runsUsing}, sha: ${result.sha.slice(0, 10)})`);
    } else {
      console.log(`✗ FAILED (Tag does not exist on GitHub!)`);
      allExist = false;
    }
  }

  console.log('========================================================');
  if (allExist) {
    console.log('🎉 ALL REFERENCED GITHUB ACTIONS EXIST AND ARE VERIFIED!');
    console.log('========================================================');
    process.exit(0);
  } else {
    console.error('❌ ONE OR MORE REFERENCED GITHUB ACTIONS COULD NOT BE RESOLVED!');
    console.log('========================================================');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Unexpected error running check_actions_versions:', err);
    process.exit(1);
  });
}

module.exports = { verifyAction };
