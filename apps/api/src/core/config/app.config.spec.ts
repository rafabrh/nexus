import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { validate } from './app.config';

const base = { REDIS_URL: 'redis://localhost:6379', DATABASE_URL: 'postgres://x/y' };
const strongSecret = 'x'.repeat(32);
const validBase = { ...base, JWT_SECRET: strongSecret };

describe('AppConfig validate — security invariants', () => {
  it('accepts a strong JWT_SECRET (>= 32 chars)', () => {
    expect(() => validate({ ...base, JWT_SECRET: strongSecret })).not.toThrow();
  });

  it('REJECTS a short JWT_SECRET (< 32) — weak HS256 key', () => {
    expect(() => validate({ ...base, JWT_SECRET: 'too-short' })).toThrow(/JWT_SECRET/);
  });

  it('REJECTS a missing JWT_SECRET', () => {
    expect(() => validate({ ...base })).toThrow();
  });

  it('REJECTS a missing DATABASE_URL', () => {
    expect(() =>
      validate({ REDIS_URL: 'redis://localhost:6379', JWT_SECRET: strongSecret }),
    ).toThrow();
  });

  it('REJECTS a missing REDIS_URL', () => {
    expect(() =>
      validate({ DATABASE_URL: 'postgres://x/y', JWT_SECRET: strongSecret }),
    ).toThrow();
  });
});

describe('AppConfig validate — media config defaults', () => {
  it('MEDIA_ROOT defaults to /data/media when not set', () => {
    const cfg = validate(validBase);
    expect(cfg.MEDIA_ROOT).toBe('/data/media');
  });

  it('MEDIA_ROOT accepts a custom path', () => {
    const cfg = validate({ ...validBase, MEDIA_ROOT: '/custom/media' });
    expect(cfg.MEDIA_ROOT).toBe('/custom/media');
  });

  it('QR_MEDIA_MAX_BYTES defaults to 67108864 (64 MB) as a number', () => {
    const cfg = validate(validBase);
    expect(cfg.QR_MEDIA_MAX_BYTES).toBe(67108864);
    expect(typeof cfg.QR_MEDIA_MAX_BYTES).toBe('number');
  });

  it('QR_MEDIA_MAX_BYTES accepts a numeric env string and coerces to number', () => {
    const cfg = validate({ ...validBase, QR_MEDIA_MAX_BYTES: '10485760' });
    expect(cfg.QR_MEDIA_MAX_BYTES).toBe(10485760);
  });

  it('MEDIA_SIGN_SECRET is undefined when not set', () => {
    const cfg = validate(validBase);
    expect(cfg.MEDIA_SIGN_SECRET).toBeUndefined();
  });

  it('MEDIA_SIGN_SECRET accepts a string value', () => {
    const cfg = validate({ ...validBase, MEDIA_SIGN_SECRET: 'my-secret-key' });
    expect(cfg.MEDIA_SIGN_SECRET).toBe('my-secret-key');
  });
});
