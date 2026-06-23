import assert from 'node:assert';
import { resolveTheme } from './theme.ts';
assert.equal(resolveTheme('light', true), 'light');
assert.equal(resolveTheme('dark', false), 'dark');
assert.equal(resolveTheme('system', true), 'dark');
assert.equal(resolveTheme('system', false), 'light');
console.log('theme.test: OK');
