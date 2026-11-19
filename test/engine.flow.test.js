import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, says, rem } from './helpers.js';

const MIN = 60;
const ESC = { afterSeconds: 60, gestures: ['demand', 'play'], giveUpAfterSeconds: 180 };
const fired = (cfgReminder = {}) => {
  const h = setup({ reminders: [rem({ escalate: ESC, ...cfgReminder })] }, { idle: 10 });
  h.run(45 * MIN); // reminder is now active
  return h;
};
const types = (a) => a.map((x) => x.type);

test('ack hides bubble, plays happy, restarts the timer', () => {
  const h = fired();
  h.run(10);
  const a = h.engine.ack();
  assert.deepEqual(a, [{ type: 'hideBubble' }, { type: 'gesture', name: 'happy' }]);
  assert.equal(says(h.run(45 * MIN - 1)).length, 0);
  assert.equal(says(h.run(1)).length, 1);
});

test('snooze re-fires after snoozeMinutes', () => {
  const h = fired();
  h.run(5);
  assert.deepEqual(h.engine.snooze(), [{ type: 'hideBubble' }]);
  assert.equal(says(h.run(10 * MIN - 1)).length, 0);
  assert.equal(says(h.run(1)).length, 1);
});

test('snooze works during escalation', () => {
  const h = fired();
  assert.equal(says(h.run(70)).length, 1); // escalated once
  h.engine.snooze();
  assert.equal(says(h.run(10 * MIN)).length, 1);
});

test('escalates every afterSeconds cycling gestures, then gives up and sleeps', () => {
  const h = fired();
  assert.equal(says(h.run(59)).length, 0);
  assert.deepEqual(says(h.run(1)).map((s) => s.gesture), ['demand']);
  assert.equal(says(h.run(59)).length, 0);
  assert.deepEqual(says(h.run(1)).map((s) => s.gesture), ['play']);
  h.run(59);
  const giveUp = h.run(1);
  assert.deepEqual(giveUp, [{ type: 'hideBubble' }, { type: 'gesture', name: 'sleep' }]);
  assert.equal(says(h.run(45 * MIN - 2)).length, 0); // timer restarted at give-up
});

test('escalate false never re-says, but still hides the bubble at 180 s without sleeping', () => {
  const h = fired({ escalate: false });
  assert.equal(says(h.run(170)).length, 0);
  const rest = h.run(10);
  assert.deepEqual(types(rest.filter((a) => a.type !== 'gesture')), ['hideBubble']);
  assert.equal(rest.filter((a) => a.type === 'gesture' && a.name === 'sleep').length, 0);
});

test('click during an active reminder equals ack', () => {
  const h = fired();
  assert.deepEqual(h.engine.click(), [{ type: 'hideBubble' }, { type: 'gesture', name: 'happy' }]);
});

test('click with nothing due is one reaction gesture and no say', () => {
  const h = setup({ reminders: [rem()] }, { idle: 10 });
  const a = h.engine.click();
  assert.equal(a.length, 1);
  assert.equal(a[0].type, 'gesture');
});

test('pause(30) hides, freezes timers, then shows; timers do not accrue while paused', () => {
  const h = setup({ reminders: [rem()] }, { idle: 10 });
  h.run(10 * MIN);
  assert.deepEqual(h.engine.pause(30), [{ type: 'hide' }]);
  const during = h.run(30 * MIN - 1);
  assert.equal(during.length, 0);
  assert.deepEqual(h.run(1), [{ type: 'show' }]);
  // due 35 min after resume (45 - 10), not 45 - 40
  assert.equal(says(h.run(34 * MIN)).length, 0);
  assert.equal(says(h.run(2 * MIN)).length, 1);
});

test('pause(null) stays hidden until resume()', () => {
  const h = setup({ reminders: [rem()] }, { idle: 10 });
  h.engine.pause(null);
  assert.equal(h.run(5 * 3600).length, 0);
  assert.deepEqual(h.engine.resume(), [{ type: 'show' }]);
});
