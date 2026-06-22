import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { validate } from './app.config';

const base = { REDIS_URL: 'redis://localhost:6379', DATABASE_URL: 'postgres://x/y' };
const strongSecret = 'x'.repeat(32);

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
