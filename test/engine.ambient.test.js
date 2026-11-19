import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, says, rem, AVATAR } from './helpers.js';

const lcg = (seed = 1) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const av = (ambient) => ({ ...AVATAR, ambient });
const name = (a) => (a.type === 'walk' ? 'walk' : a.name);

// Collect n ambient picks, acknowledging walks so the engine keeps going.
function picks(h, n) {
  const out = [];
  for (let i = 0; i < 20000 && out.length < n; i++) {
    for (const a of h.run(1)) {
      if (a.type !== 'walk' && a.type !== 'gesture') continue;
      out.push(name(a));
      if (a.type === 'walk') h.engine.walkDone();
    }
  }
  return out;
}

test('weighted pick respects weights', () => {
  const h = setup({ reminders: [] }, { rand: lcg(7), avatar: av({ sleep: 30, yawn: 1 }) });
  const p = picks(h, 400);
  const count = (n) => p.filter((x) => x === n).length;
  assert.ok(count('sleep') > count('yawn') * 3, `sleep ${count('sleep')} vs yawn ${count('yawn')}`);
  assert.ok(count('walk') > 0);
});

test('never picks the same gesture twice in a row', () => {
  const h = setup({ reminders: [] }, { rand: lcg(3), avatar: av({ sleep: 3, yawn: 2, play: 2 }) });
  const p = picks(h, 300);
  for (let i = 1; i < p.length; i++) assert.notEqual(p[i], p[i - 1]);
});

test('unknown gesture in avatar ambient resolves to idle without throwing', () => {
  const h = setup({ reminders: [] }, { rand: lcg(5), avatar: av({ flip: 100 }) });
  const p = picks(h, 50);
  assert.ok(p.includes('idle'));
  assert.ok(!p.includes('flip'));
});

test('no ambient while a reminder is active', () => {
  const h = setup({ reminders: [rem()] }, { idle: 10, rand: lcg(2), avatar: av({ sleep: 3 }) });
  h.run(45 * 60); // reminder fires
  const during = h.run(100);
  assert.equal(during.filter((a) => a.type === 'walk' || a.type === 'gesture').length, 0);
});

test('quiet hours: one sleep, then silence', () => {
  const h = setup(
    { quietHours: { from: '20:00', to: '08:00' }, reminders: [] },
    { start: new Date(2026, 0, 1, 22, 0), rand: lcg(4), avatar: av({ yawn: 3 }) },
  );
  assert.deepEqual(h.run(1), [{ type: 'gesture', name: 'sleep' }]);
  assert.equal(h.run(600).length, 0);
});

test('walk blocks further picks until walkDone()', () => {
  const h = setup({ reminders: [] }, { rand: () => 0, avatar: av({}) }); // only walk is possible
  const first = h.run(60);
  assert.equal(first.filter((a) => a.type === 'walk').length, 1);
  assert.equal(h.run(120).length, 0);
  h.engine.walkDone();
  assert.equal(h.run(60).filter((a) => a.type === 'walk').length, 1);
});
