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
