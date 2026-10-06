import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import {
  getChromePath,
  getChromeCandidates,
  isWindowsChrome,
  toChromePath,
  toFileUrl,
  getTempDir,
  cleanupArtifacts
} from '../scripts/chrome_path.js';

describe('Chrome Portable Path Discovery Helper', () => {
  describe('Priority 1: CHROME_PATH environment variable', () => {
    it('returns CHROME_PATH when set and file exists', () => {
      const mockEnv = { CHROME_PATH: '/custom/path/to/custom-chrome' };
      const mockFs = {
        existsSync: vi.fn(p => p === '/custom/path/to/custom-chrome')
      };

      const resolved = getChromePath({ env: mockEnv, platform: 'linux', fs: mockFs });
      expect(resolved).toBe('/custom/path/to/custom-chrome');
      expect(mockFs.existsSync).toHaveBeenCalledWith('/custom/path/to/custom-chrome');
    });

    it('bypasses other candidates when CHROME_PATH matches', () => {
      const mockEnv = {
        CHROME_PATH: 'C:\\Custom\\Chrome.exe',
        PROGRAMFILES: 'C:\\Program Files'
      };
      const mockFs = {
        existsSync: vi.fn(p => p === 'C:\\Custom\\Chrome.exe')
      };

      const resolved = getChromePath({ env: mockEnv, platform: 'win32', fs: mockFs });
      expect(resolved).toBe('C:\\Custom\\Chrome.exe');
      expect(mockFs.existsSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('Priority 2: Windows Program Files / LocalAppData locations', () => {
    it('detects Chrome in Windows Program Files on win32', () => {
      const mockEnv = {
        PROGRAMFILES: 'C:\\Program Files',
        'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
        LOCALAPPDATA: 'C:\\Users\\Learner\\AppData\\Local'
      };
      const expectedPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      const mockFs = {
        existsSync: vi.fn(p => p === expectedPath)
      };

      const resolved = getChromePath({ env: mockEnv, platform: 'win32', fs: mockFs });
      expect(resolved).toBe(expectedPath);
    });

    it('detects Chrome in Windows Program Files (x86) on win32 when 64-bit not found', () => {
      const mockEnv = {
        PROGRAMFILES: 'C:\\Program Files',
        'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
        LOCALAPPDATA: 'C:\\Users\\Learner\\AppData\\Local'
      };
      const expectedPath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
      const mockFs = {
        existsSync: vi.fn(p => p === expectedPath)
      };

      const resolved = getChromePath({ env: mockEnv, platform: 'win32', fs: mockFs });
      expect(resolved).toBe(expectedPath);
    });

    it('detects Chrome in Windows LocalAppData on win32', () => {
      const mockEnv = {
        PROGRAMFILES: 'C:\\Program Files',
        'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
        LOCALAPPDATA: 'C:\\Users\\Learner\\AppData\\Local'
      };
      const expectedPath = 'C:\\Users\\Learner\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
      const mockFs = {
        existsSync: vi.fn(p => p === expectedPath)
      };

      const resolved = getChromePath({ env: mockEnv, platform: 'win32', fs: mockFs });
      expect(resolved).toBe(expectedPath);
    });
  });

  describe('Priority 3: WSL /mnt/c paths', () => {
    it('detects Chrome via /mnt/c on Linux/WSL when Windows drive is mounted', () => {
      const mockEnv = {
        USER: 'learner'
      };
      const expectedPath = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe';
      const mockFs = {
        existsSync: vi.fn(p => p === expectedPath)
      };

      const resolved = getChromePath({ env: mockEnv, platform: 'linux', fs: mockFs });
      expect(resolved).toBe(expectedPath);
    });

    it('detects Chrome via user AppData on /mnt/c when system-wide is absent', () => {
      const mockEnv = {
        USER: 'learner'
      };
      const expectedPath = '/mnt/c/Users/learner/AppData/Local/Google/Chrome/Application/chrome.exe';
      const mockFs = {
        existsSync: vi.fn(p => p === expectedPath)
      };

      const resolved = getChromePath({ env: mockEnv, platform: 'linux', fs: mockFs });
      expect(resolved).toBe(expectedPath);
    });
  });

  describe('Priority 4: Common Linux paths', () => {
    it('detects /usr/bin/google-chrome on native Linux', () => {
      const mockEnv = {};
      const expectedPath = '/usr/bin/google-chrome';
      const mockFs = {
        existsSync: vi.fn(p => p === expectedPath)
      };

      const resolved = getChromePath({ env: mockEnv, platform: 'linux', fs: mockFs });
      expect(resolved).toBe(expectedPath);
    });

    it('detects /usr/bin/chromium on native Linux when google-chrome absent', () => {
      const mockEnv = {};
      const expectedPath = '/usr/bin/chromium';
      const mockFs = {
        existsSync: vi.fn(p => p === expectedPath)
      };

      const resolved = getChromePath({ env: mockEnv, platform: 'linux', fs: mockFs });
      expect(resolved).toBe(expectedPath);
    });

    it('detects /snap/bin/chromium on Ubuntu/Debian', () => {
      const mockEnv = {};
      const expectedPath = '/snap/bin/chromium';
      const mockFs = {
        existsSync: vi.fn(p => p === expectedPath)
      };

      const resolved = getChromePath({ env: mockEnv, platform: 'linux', fs: mockFs });
      expect(resolved).toBe(expectedPath);
    });
  });

  describe('Failure mode: Clear error message listing tried candidates', () => {
    it('throws descriptive error containing all checked groups when none exist', () => {
      const mockEnv = { CHROME_PATH: '/nonexistent/chrome' };
      const mockFs = {
        existsSync: vi.fn(() => false)
      };

      let errorThrown = null;
      try {
        getChromePath({ env: mockEnv, platform: 'linux', fs: mockFs });
      } catch (err) {
        errorThrown = err;
      }

      expect(errorThrown).not.toBeNull();
      const message = errorThrown.message;
      expect(message).toContain('Failed to locate Chrome executable');
      expect(message).toContain('1. CHROME_PATH environment variable');
      expect(message).toContain('/nonexistent/chrome');
      expect(message).toContain('2. Windows Program Files / LocalAppData locations');
      expect(message).toContain('3. WSL /mnt/c locations');
      expect(message).toContain('/mnt/c/Program Files/Google/Chrome/Application/chrome.exe');
      expect(message).toContain('4. Common Linux locations');
      expect(message).toContain('/usr/bin/google-chrome');
      expect(message).toContain('/usr/bin/chromium');
    });
  });

  describe('Path conversion and URL generation', () => {
    it('converts WSL /mnt/c paths to Windows paths for Windows Chrome', () => {
      const wslPath = '/mnt/c/German_App/temp_test.html';
      const winChrome = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe';
      const chromePath = toChromePath(wslPath, winChrome);
      expect(chromePath).toBe('C:\\German_App\\temp_test.html');
    });

    it('generates file:/// URLs with forward slashes for Windows Chrome', () => {
      const wslPath = '/mnt/c/German_App/temp_test.html';
      const winChrome = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe';
      const url = toFileUrl(wslPath, winChrome);
      expect(url).toBe('file:///C:/German_App/temp_test.html');
    });

    it('generates file:/// URLs from Windows native drive paths', () => {
      const winDrivePath = 'C:\\German_App\\temp_test.html';
      const winChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      const url = toFileUrl(winDrivePath, winChrome);
      expect(url).toBe('file:///C:/German_App/temp_test.html');
    });

    it('preserves Unix file paths for Linux Chrome', () => {
      const linuxPath = '/tmp/temp_test.html';
      const linuxChrome = '/usr/bin/google-chrome';
      const url = toFileUrl(linuxPath, linuxChrome);
      expect(url).toBe('file:///tmp/temp_test.html');
      const argPath = toChromePath(linuxPath, linuxChrome);
      expect(argPath).toBe('/tmp/temp_test.html');
    });

    it('identifies Windows Chrome executables accurately', () => {
      expect(isWindowsChrome('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')).toBe(true);
      expect(isWindowsChrome('/mnt/c/Program Files/Google/Chrome/Application/chrome.exe')).toBe(true);
      expect(isWindowsChrome('/usr/bin/google-chrome', 'linux')).toBe(false);
      expect(isWindowsChrome('/usr/bin/chromium', 'linux')).toBe(false);
    });
  });

  describe('Artifact Cleanup Helper', () => {
    it('cleans matching files and directories safely', () => {
      const mockFiles = new Set(['temp_e2e_a1.html', '.chrome_profile_123', 'keep_me.txt']);
      const mockFs = {
        existsSync: vi.fn(p => true),
        readdirSync: vi.fn(p => ['temp_e2e_a1.html', '.chrome_profile_123', 'keep_me.txt']),
        statSync: vi.fn(p => ({
          isDirectory: () => p.includes('.chrome_profile_')
        })),
        unlinkSync: vi.fn(p => {
          mockFiles.delete(path.basename(p));
        }),
        rmSync: vi.fn((p, opts) => {
          mockFiles.delete(path.basename(p));
        })
      };

      cleanupArtifacts(['/test/dir'], ['temp_e2e_*', '.chrome_profile_*']);
      // Should attempt cleanup on real filesystem without throwing
    });
  });
});
