import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { verifySecret } from '../src/deploy/secrets/index.js';
import { parseDotenv } from '../src/deploy/secrets/env.js';
import { makeTmpDir, cleanup } from './helpers.js';

let dir: string;
beforeEach(() => {
  dir = makeTmpDir();
});
afterEach(() => {
  cleanup(dir);
  delete process.env['SFW_TEST_SECRET'];
});

describe('env:// provider', () => {
  it('resolves from process env', () => {
    process.env['SFW_TEST_SECRET'] = 'value';
    expect(verifySecret('env://SFW_TEST_SECRET', dir).ok).toBe(true);
  });
  it('resolves from .env at project root', () => {
    writeFileSync(path.join(dir, '.env'), '# comment\nSFW_DOTENV_ONLY="quoted value"\n');
    expect(verifySecret('env://SFW_DOTENV_ONLY', dir).ok).toBe(true);
  });
  it('fails with a fix hint when unset', () => {
    const res = verifySecret('env://SFW_TEST_MISSING', dir);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('SFW_TEST_MISSING');
    expect(res.reason).toContain('.env');
  });
  it('rejects invalid variable names', () => {
    expect(verifySecret('env://not a var', dir).ok).toBe(false);
  });
});

describe('file:// provider', () => {
  it.skipIf(process.platform === 'win32')('accepts a 0600 file', () => {
    const secret = path.join(dir, 'token.txt');
    writeFileSync(secret, 'shh');
    chmodSync(secret, 0o600);
    expect(verifySecret('file://./token.txt', dir).ok).toBe(true);
  });
  it.skipIf(process.platform === 'win32')('rejects wider-than-0600 permissions', () => {
    const secret = path.join(dir, 'token.txt');
    writeFileSync(secret, 'shh');
    chmodSync(secret, 0o644);
    const res = verifySecret('file://./token.txt', dir);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('chmod 600');
  });
  it('rejects missing files', () => {
    const res = verifySecret('file://./nope.txt', dir);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('not found');
  });
});

describe('sf:// reserved scheme', () => {
  it('parses but errors with the cloud message', () => {
    const res = verifySecret('sf://org/key', dir);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('Skill Framework Cloud');
  });
});

describe('unknown schemes', () => {
  it('lists available providers', () => {
    const res = verifySecret('vault://kv/secret', dir);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('env://');
  });
  it('rejects non-URI values', () => {
    expect(verifySecret('justastring', dir).ok).toBe(false);
  });
});

describe('parseDotenv', () => {
  it('handles comments, quotes, and blank lines', () => {
    const file = path.join(dir, '.env');
    writeFileSync(file, `# c\n\nA=1\nB='two'\nC="three"\nBROKEN\n=nokey\n`);
    expect(parseDotenv(file)).toEqual({ A: '1', B: 'two', C: 'three' });
  });
  it('returns empty for a missing file', () => {
    expect(parseDotenv(path.join(dir, 'none'))).toEqual({});
  });
});
