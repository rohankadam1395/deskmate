import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAvatar } from '../renderer/avatar.js';

const good = () => ({
  name: 'Cat',
  size: 96,
  states: {
    idle: { frames: ['i1.svg', 'i2.svg'], fps: 2, loop: true },
    walk: { frames: ['w1.svg'], fps: 6 },
  },
  ambient: { sleep: 3, flip: 1 },
});

test('valid avatar parses with defaults and keeps unknown ambient keys', () => {
  const a = parseAvatar('cat', good());
  assert.equal(a.id, 'cat');
  assert.equal(a.size, 96);
  assert.deepEqual(a.states.walk, { frames: ['w1.svg'], fps: 6, loop: true });
  assert.deepEqual(a.ambient, { sleep: 3, flip: 1 });
});

test('missing walk throws', () => {
  const j = good();
  delete j.states.walk;
  assert.throws(() => parseAvatar('cat', j), /walk/);
});

test('empty frames throws', () => {
  const j = good();
  j.states.idle.frames = [];
  assert.throws(() => parseAvatar('cat', j), /idle/);
});

// Shipped starter avatars
import { readFileSync, existsSync } from 'node:fs';
import { normalizeConfig } from '../renderer/config.js';

for (const id of ['cat', 'spirit']) {
  test(`shipped avatar "${id}" parses, frames exist, ambient keys are states`, () => {
    const dir = `defaults/avatars/${id}`;
    const json = JSON.parse(readFileSync(`${dir}/avatar.json`, 'utf8'));
    const a = parseAvatar(id, json);
    for (const s of Object.values(a.states)) for (const f of s.frames) assert.ok(existsSync(`${dir}/${f}`), `${dir}/${f}`);
    for (const k of Object.keys(a.ambient)) assert.ok(a.states[k], `ambient "${k}" is not a state`);
  });
}

test('shipped default config normalizes with no errors', () => {
  const { config, errors } = normalizeConfig(JSON.parse(readFileSync('defaults/config.json', 'utf8')));
  assert.deepEqual(errors, []);
  assert.deepEqual(config.reminders.map((r) => r.id), ['water', 'move', 'blink', 'lookaway']);
});
