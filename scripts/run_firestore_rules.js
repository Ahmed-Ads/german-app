#!/usr/bin/env node
/**
 * scripts/run_firestore_rules.js
 * Runner for Firestore Security Rules verification.
 *
 * Requirements:
 * - Detects whether Java (Java 21+) and the Firestore emulator are available.
 * - If Java / emulator is not available (such as in standard WSL without OpenJDK),
 *   it prints "NOT MEASURED" and exits with status 3 (never passes or silently skips).
 * - If Java is available, it runs the Firestore emulator and vitest suite.
 */

const { spawnSync } = require('child_process');

function checkJavaVersion() {
  try {
    const res = spawnSync('java', ['-version'], { stdio: 'pipe' });
    if (res.status !== 0) {
      return { ok: false, reason: 'Java command exited with non-zero status or not found' };
    }
    const text = (res.stderr ? res.stderr.toString() : '') + (res.stdout ? res.stdout.toString() : '');
    const m = text.match(/version\s+"(?:1\.)?(\d+)/i);
    if (!m) {
      return { ok: false, reason: `Could not parse Java version from output: ${text.trim()}` };
    }
    const major = parseInt(m[1], 10);
    if (isNaN(major) || major < 21) {
      return { ok: false, major, reason: `Java major version is ${major}, but Java 21+ is required for the Firestore emulator` };
    }
    return { ok: true, major };
  } catch (e) {
    return { ok: false, reason: e.message || 'Java is not installed or not in PATH' };
  }
}

console.log('========================================================');
console.log('  FIRESTORE SECURITY RULES VERIFICATION');
console.log('========================================================');

const javaCheck = checkJavaVersion();
const hostEnv = process.env.FIRESTORE_EMULATOR_HOST;

if (!javaCheck.ok && !hostEnv) {
  console.log('Java 21+ is required to run the local Firestore emulator.');
  console.log(javaCheck.reason);
  console.log('Status: NOT MEASURED');
  console.log('========================================================');
  console.log('NOT MEASURED');
  process.exit(3);
}

console.log('Java 21+ detected or FIRESTORE_EMULATOR_HOST set. Launching rules tests...');

const vitestCmd = 'vitest run tests/firestore_rules.test.js';

if (hostEnv) {
  const result = spawnSync('npx', ['vitest', 'run', 'tests/firestore_rules.test.js'], {
    stdio: 'inherit',
    env: { ...process.env, REQUIRE_EMULATOR: '1' }
  });
  process.exit(result.status ?? 1);
} else {
  const result = spawnSync('npx', [
    '-y',
    'firebase-tools@15.33.0',
    'emulators:exec',
    '--only',
    'firestore',
    '--project',
    'demo-german-app',
    vitestCmd
  ], {
    stdio: 'inherit',
    env: { ...process.env, REQUIRE_EMULATOR: '1' }
  });
  process.exit(result.status ?? 1);
}
