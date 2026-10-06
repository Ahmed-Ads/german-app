/**
 * scripts/chrome_path.js
 * Cross-platform Chrome binary resolution and file path utility for tests and runners.
 *
 * Resolves Chrome in the following priority order:
 * 1. CHROME_PATH environment variable
 * 2. Windows Program Files / LocalAppData locations
 * 3. WSL /mnt/c paths
 * 4. Common Linux paths (google-chrome, chromium)
 *
 * Provides helpers for converting paths to Chrome command-line arguments and file:// URLs,
 * resolving temporary directories across Windows, WSL, and Linux, and cleaning up test artifacts.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Generates the prioritized candidate list for Chrome binary discovery.
 *
 * @param {Object} [env=process.env]
 * @param {string} [platform=process.platform]
 * @returns {{ candidates: Array<{type: string, path: string}>, tried: {env: string[], windows: string[], wsl: string[], linux: string[]} }}
 */
function getChromeCandidates(env = process.env, platform = process.platform) {
  const candidates = [];
  const tried = {
    env: [],
    windows: [],
    wsl: [],
    linux: []
  };

  // 1. CHROME_PATH env var
  if (env.CHROME_PATH && env.CHROME_PATH.trim() !== '') {
    const p = env.CHROME_PATH.trim();
    candidates.push({ type: 'env', path: p });
    tried.env.push(p);
  }

  // 2. Windows Program Files / LocalAppData locations
  const progFiles = env.PROGRAMFILES || 'C:\\Program Files';
  const progFilesX86 = env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const localAppData = env.LOCALAPPDATA || 'C:\\Users\\Default\\AppData\\Local';
  const progW6432 = env.ProgramW6432;

  const winPaths = [
    path.win32.join(progFiles, 'Google\\Chrome\\Application\\chrome.exe'),
    path.win32.join(progFilesX86, 'Google\\Chrome\\Application\\chrome.exe'),
    path.win32.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
    path.win32.join(progFiles, 'Chromium\\Application\\chrome.exe'),
    path.win32.join(progFilesX86, 'Chromium\\Application\\chrome.exe'),
    path.win32.join(localAppData, 'Chromium\\Application\\chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];
  if (progW6432) {
    winPaths.unshift(path.win32.join(progW6432, 'Google\\Chrome\\Application\\chrome.exe'));
  }

  for (const wp of [...new Set(winPaths)]) {
    candidates.push({ type: 'windows', path: wp });
    tried.windows.push(wp);
  }

  // 3. WSL /mnt/c paths
  const wslPaths = [
    '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/mnt/c/Program Files/Chromium/Application/chrome.exe',
    '/mnt/c/Program Files (x86)/Chromium/Application/chrome.exe'
  ];
  if (env.USER) {
    wslPaths.push(`/mnt/c/Users/${env.USER}/AppData/Local/Google/Chrome/Application/chrome.exe`);
    wslPaths.push(`/mnt/c/Users/${env.USER}/AppData/Local/Chromium/Application/chrome.exe`);
  }
  wslPaths.push('/mnt/c/Users/lenovo/AppData/Local/Google/Chrome/Application/chrome.exe');
  wslPaths.push('/mnt/c/Users/Default/AppData/Local/Google/Chrome/Application/chrome.exe');

  for (const wsp of [...new Set(wslPaths)]) {
    candidates.push({ type: 'wsl', path: wsp });
    tried.wsl.push(wsp);
  }

  // 4. Common Linux paths (google-chrome, chromium)
  const linuxPaths = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/local/bin/google-chrome',
    '/usr/local/bin/chromium'
  ];

  // Also check PATH entries if available
  if (env.PATH) {
    const delimiter = platform === 'win32' ? ';' : ':';
    const dirs = env.PATH.split(delimiter);
    const binaries = platform === 'win32'
      ? ['chrome.exe', 'chromium.exe']
      : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];

    for (const b of binaries) {
      for (const d of dirs) {
        if (!d) continue;
        const candidate = path.join(d, b);
        if (!linuxPaths.includes(candidate) && !winPaths.includes(candidate)) {
          if (platform === 'win32') {
            winPaths.push(candidate);
            tried.windows.push(candidate);
            candidates.push({ type: 'windows', path: candidate });
          } else {
            linuxPaths.push(candidate);
            tried.linux.push(candidate);
            candidates.push({ type: 'linux', path: candidate });
          }
        }
      }
    }
  }

  for (const lp of [...new Set(linuxPaths)]) {
    if (!candidates.some(c => c.path === lp)) {
      candidates.push({ type: 'linux', path: lp });
    }
    if (!tried.linux.includes(lp)) {
      tried.linux.push(lp);
    }
  }

  return { candidates, tried };
}

/**
 * Resolves the Chrome executable path.
 *
 * @param {Object} [options={}]
 * @param {Object} [options.env=process.env]
 * @param {string} [options.platform=process.platform]
 * @param {Object} [options.fs=fs]
 * @returns {string} Absolute path to resolved Chrome executable.
 * @throws {Error} Detailed error listing all checked candidates if none found.
 */
function getChromePath(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const fileSys = options.fs || fs;

  const { candidates, tried } = getChromeCandidates(env, platform);

  for (const item of candidates) {
    try {
      if (fileSys.existsSync(item.path)) {
        return item.path;
      }
    } catch (_) {}
  }

  const msg = [
    'Failed to locate Chrome executable. The following candidate paths were tried in order:',
    `1. CHROME_PATH environment variable: ${tried.env.length > 0 ? tried.env.join(', ') : '(not set)'}`,
    '2. Windows Program Files / LocalAppData locations:',
    ...tried.windows.map(p => `   - ${p}`),
    '3. WSL /mnt/c locations:',
    ...tried.wsl.map(p => `   - ${p}`),
    '4. Common Linux locations:',
    ...tried.linux.map(p => `   - ${p}`),
    'Please ensure Chrome is installed or set the CHROME_PATH environment variable to your Chrome binary.'
  ].join('\n');

  throw new Error(msg);
}

/**
 * Checks whether the resolved Chrome executable runs as a Windows process.
 *
 * @param {string} [chromeExecutable]
 * @param {string} [platform=process.platform]
 * @returns {boolean}
 */
function isWindowsChrome(chromeExecutable = null, platform = process.platform) {
  if (platform === 'win32') return true;
  if (!chromeExecutable) {
    try {
      chromeExecutable = getChromePath();
    } catch (_) {
      return false;
    }
  }
  return chromeExecutable.toLowerCase().endsWith('.exe') || chromeExecutable.startsWith('/mnt/');
}

/**
 * Converts a filesystem path to the appropriate path format expected by the Chrome process.
 * Handles WSL /mnt/c paths -> C:\... when targeting Windows Chrome.
 *
 * @param {string} localPath
 * @param {string} [chromeExecutable]
 * @returns {string}
 */
function toChromePath(localPath, chromeExecutable = null) {
  // Windows drive path already (e.g., C:\... or C:/...)
  if (/^[a-zA-Z]:[\\\/]/.test(localPath)) {
    return localPath.replace(/\//g, '\\');
  }

  const absPath = path.resolve(localPath);
  const win = isWindowsChrome(chromeExecutable);
  if (!win) {
    return absPath;
  }

  // WSL mount path (/mnt/c/...)
  const m = absPath.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (m) {
    const drive = m[1].toUpperCase();
    const rest = m[2].replace(/\//g, '\\');
    return `${drive}:\\${rest}`;
  }

  return absPath;
}

/**
 * Converts a filesystem path to a file:// URL that the Chrome process can access.
 * Handles Windows drive paths and WSL /mnt/<drive> paths -> file:///C:/...
 *
 * @param {string} localPath
 * @param {string} [chromeExecutable]
 * @returns {string}
 */
function toFileUrl(localPath, chromeExecutable = null) {
  // Windows drive path already (e.g. C:\... or C:/...)
  const mWin = localPath.match(/^([a-zA-Z]):[\\\/](.*)$/);
  if (mWin) {
    const drive = mWin[1].toUpperCase();
    const rest = mWin[2].replace(/\\/g, '/');
    return `file:///${drive}:/${rest}`;
  }

  const absPath = path.resolve(localPath);
  const win = isWindowsChrome(chromeExecutable);
  if (win) {
    // WSL /mnt/<drive>/...
    const m = absPath.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
    if (m) {
      const drive = m[1].toUpperCase();
      const rest = m[2].replace(/\\/g, '/');
      return `file:///${drive}:/${rest}`;
    }
  }

  const unixPath = absPath.replace(/\\/g, '/');
  return `file://${unixPath.startsWith('/') ? unixPath : '/' + unixPath}`;
}

/**
 * Resolves a temporary directory for test harnesses and user data profiles.
 * On Windows: returns os.tmpdir() (e.g. C:\Users\...\AppData\Local\Temp).
 * On WSL with Windows Chrome: returns a local Windows Temp directory (e.g. /mnt/c/Users/.../AppData/Local/Temp)
 * so Windows Chrome can lock profile SQLite databases without failing on network shares (\\wsl.localhost).
 * Also updates process.env.TMPDIR so standard os.tmpdir() calls route to this directory.
 * On native Linux: returns os.tmpdir() (/tmp).
 *
 * @param {string} [chromeExecutable]
 * @returns {string}
 */
function getTempDir(chromeExecutable = null) {
  if (process.platform === 'win32') {
    return os.tmpdir();
  }

  if (isWindowsChrome(chromeExecutable)) {
    const candidateDirs = [
      process.env.TEMP,
      process.env.TMP,
      process.env.USER ? `/mnt/c/Users/${process.env.USER}/AppData/Local/Temp` : null,
      '/mnt/c/Users/lenovo/AppData/Local/Temp',
      '/mnt/c/Windows/Temp'
    ].filter(Boolean);

    for (const cd of candidateDirs) {
      try {
        if (fs.existsSync(cd)) {
          process.env.TMPDIR = cd;
          return cd;
        }
      } catch (_) {}
    }
  }

  return os.tmpdir();
}

/**
 * Helper to delete temporary files and profile directories from one or more parent directories.
 *
 * @param {string[]} dirs
 * @param {string[]} namePrefixesOrPatterns
 */
function cleanupArtifacts(dirs = [], namePrefixesOrPatterns = []) {
  for (const d of dirs) {
    if (!d || !fs.existsSync(d)) continue;
    try {
      const entries = fs.readdirSync(d);
      for (const entry of entries) {
        const matches = namePrefixesOrPatterns.some(pattern => {
          if (pattern.includes('*')) {
            const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
            return regex.test(entry);
          }
          return entry === pattern || entry.startsWith(pattern);
        });

        if (matches) {
          const fullPath = path.join(d, entry);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              fs.rmSync(fullPath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(fullPath);
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  }
}

module.exports = {
  getChromeCandidates,
  getChromePath,
  isWindowsChrome,
  toChromePath,
  toFileUrl,
  getTempDir,
  cleanupArtifacts
};
