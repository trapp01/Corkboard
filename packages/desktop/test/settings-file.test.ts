import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { expectServerLink, loadSettings, NO_SETTINGS, saveSettings } from '../src/settings-file.js';

function settingsFile(): string {
  return join(mkdtempSync(join(tmpdir(), 'corkboard-settings-')), 'settings.json');
}

describe('settings file', () => {
  it('starts with no linked servers when there is no file', () => {
    expect(loadSettings(settingsFile())).toEqual(NO_SETTINGS);
  });

  it('round-trips both links and the fallback port', () => {
    const file = settingsFile();
    const settings = {
      upstream: { url: 'http://nas:8422', token: 'upstream-token' },
      looseleaf: { url: 'http://127.0.0.1:8421', token: 'looseleaf-token' },
      fallbackPort: 50123,
    };
    saveSettings(file, settings);
    expect(loadSettings(file)).toEqual(settings);
    expect(readFileSync(file, 'utf8').endsWith('\n')).toBe(true);
  });

  it.skipIf(process.platform === 'win32')('is readable by this user only, also when it replaces an older file', () => {
    const file = settingsFile();
    writeFileSync(file, '{}', { mode: 0o644 });
    saveSettings(file, { ...NO_SETTINGS, upstream: { url: 'http://nas:8422', token: 'secret' } });
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('treats a damaged file as no settings and says so without printing it', () => {
    const file = settingsFile();
    writeFileSync(file, '{"upstream": {"url": "http://nas:8422", "token": "secret"');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(loadSettings(file)).toEqual(NO_SETTINGS);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('is not valid JSON'));
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
    warn.mockRestore();
  });

  it('drops fields that are not valid and keeps the rest', () => {
    const file = settingsFile();
    writeFileSync(
      file,
      JSON.stringify({ upstream: { url: 'ftp://nas', token: 'x' }, looseleaf: { url: 'http://ll:8421/', token: ' t ' }, fallbackPort: 'soon' }),
    );
    expect(loadSettings(file)).toEqual({ upstream: null, looseleaf: { url: 'http://ll:8421', token: 't' }, fallbackPort: null });
  });
});

describe('expectServerLink', () => {
  it('normalizes the address and trims the token', () => {
    expect(expectServerLink({ url: ' http://nas:8422/ ', token: ' abc ' }, 'link')).toEqual({ url: 'http://nas:8422', token: 'abc' });
  });

  it('refuses anything else with a message naming the problem', () => {
    expect(() => expectServerLink('http://nas:8422', 'link')).toThrow(/link must be an object/);
    expect(() => expectServerLink({ url: 'http://nas:8422' }, 'link')).toThrow(/link.token must be/);
    expect(() => expectServerLink({ url: '', token: 'x' }, 'link')).toThrow(/link.url must be/);
    expect(() => expectServerLink({ url: 'x'.repeat(3000), token: 'x' }, 'link')).toThrow(/link.url must be 1 to 2048/);
    expect(() => expectServerLink({ url: 'file:///etc', token: 'x' }, 'link')).toThrow(/starts with http:\/\/ or https:\/\//);
    expect(() => expectServerLink({ url: 'http://nas', token: 'x', extra: 1 }, 'link')).toThrow(/unexpected fields: extra/);
  });
});
