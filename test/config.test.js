import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, pickMessage, inQuietHours, loadConfigText } from '../renderer/config.js';

const rem = (o = {}) => ({ id: 'water', everyMinutes: 45, gesture: 'demand', messages: ['hi'], ...o });

test('defaults are filled', () => {
  const { config, errors } = normalizeConfig({ reminders: [rem()] });
  assert.deepEqual(errors, []);
  assert.equal(config.politeIdleSeconds, 5);
  assert.equal(config.politeMaxWaitSeconds, 120);
  assert.equal(config.idleResetMinutes, 5);
  const r = config.reminders[0];
  assert.equal(r.snoozeMinutes, 10);
  assert.deepEqual(r.escalate, { afterSeconds: 60, gestures: ['demand'], giveUpAfterSeconds: 180 });
});

test('escalate false becomes null', () => {
  const { config } = normalizeConfig({ reminders: [rem({ escalate: false })] });
  assert.equal(config.reminders[0].escalate, null);
});

test('reminders with empty messages, no id, or bad interval are dropped with errors', () => {
  const { config, errors } = normalizeConfig({
    reminders: [rem({ messages: [] }), rem({ id: undefined }), rem({ everyMinutes: 0 }), rem({ id: 'ok' })],
  });
  assert.deepEqual(config.reminders.map((r) => r.id), ['ok']);
  assert.equal(errors.length, 3);
});

test('normalizeConfig throws for non-objects', () => {
  assert.throws(() => normalizeConfig(null));
  assert.throws(() => normalizeConfig('x'));
});

test('pickMessage handles array and per-avatar object with default fallback', () => {
  assert.equal(pickMessage({ messages: ['a', 'b'] }, 'cat', () => 0.99), 'b');
  const r = { messages: { cat: ['meow'], default: ['hello'] } };
  assert.equal(pickMessage(r, 'cat', () => 0), 'meow');
  assert.equal(pickMessage(r, 'spirit', () => 0), 'hello');
});

test('inQuietHours crosses midnight', () => {
  const q = { from: '20:00', to: '08:00' };
  const at = (h, m) => new Date(2026, 0, 1, h, m);
  assert.equal(inQuietHours(q, at(23, 0)), true);
  assert.equal(inQuietHours(q, at(7, 59)), true);
  assert.equal(inQuietHours(q, at(8, 0)), false);
  assert.equal(inQuietHours(q, at(12, 0)), false);
  assert.equal(inQuietHours({ from: '09:00', to: '09:00' }, at(9, 0)), false);
  assert.equal(inQuietHours(undefined, at(23, 0)), false);
});

test('loadConfigText keeps previous config on bad JSON', () => {
  const previous = normalizeConfig({ reminders: [rem()] }).config;
  const res = loadConfigText('{bad', previous);
  assert.equal(res.config, previous);
  assert.equal(res.errors.length, 1);
  assert.equal(loadConfigText('{bad', null).config.reminders.length, 0);
});

// Review fixes
test('malformed quietHours is dropped with an error instead of breaking every tick', () => {
  for (const q of [{ from: '20:00' }, '20:00-08:00', { from: 'x', to: 'y' }]) {
    const { config, errors } = normalizeConfig({ quietHours: q, reminders: [] });
    assert.equal(config.quietHours, null);
    assert.equal(errors.length, 1);
  }
  assert.deepEqual(normalizeConfig({ quietHours: { from: '9:00', to: '17:30' }, reminders: [] }).errors, []);
});

test('reminderGapSeconds defaults to 60', () => {
  assert.equal(normalizeConfig({}).config.reminderGapSeconds, 60);
});

test('pickMessage falls back to any non-empty list when the avatar has none and there is no default', () => {
  assert.equal(pickMessage({ messages: { cat: ['meow'] } }, 'spirit', () => 0), 'meow');
});
