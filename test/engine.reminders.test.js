import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, says, rem } from './helpers.js';
import { normalizeConfig } from '../renderer/config.js';

const MIN = 60;

test('fires at exactly everyMinutes, preceded by walk', () => {
  const h = setup({ reminders: [rem()] }, { idle: 10, autoWalk: true });
  assert.equal(says(h.run(45 * MIN - 1)).length, 0);
  const actions = h.run(1);
  assert.deepEqual(actions.map((a) => a.type), ['walk', 'say']);
  assert.deepEqual(says(actions)[0], { type: 'say', reminderId: 'water', text: 'hi', gesture: 'demand' });
});

test('waits while user is typing, fires at politeIdleSeconds idle', () => {
  const h = setup({ reminders: [rem()] }, { idle: 0 });
  assert.equal(says(h.run(45 * MIN + 30)).length, 0);
  h.setIdle(5);
  assert.equal(says(h.run(1)).length, 1);
});

test('fires anyway after politeMaxWaitSeconds with no idle gap', () => {
  const h = setup({ reminders: [rem()] }, { idle: 0 });
  h.run(45 * MIN); // becomes pending on the tick it is due
  assert.equal(says(h.run(118)).length, 0);
  assert.equal(says(h.run(3)).length, 1);
});

test('two reminders due together fire one at a time', () => {
  const h = setup({ reminders: [rem({ id: 'a' }), rem({ id: 'b' })] }, { idle: 10 });
  const first = says(h.run(45 * MIN));
  assert.deepEqual(first.map((s) => s.reminderId), ['a']);
  assert.equal(says(h.run(5)).length, 0); // b waits while a is active (escalate is off in test cfg below)
  h.engine.ack();
  assert.deepEqual(says(h.run(60)).map((s) => s.reminderId), ['b']); // after the reminder gap
});

test('a 3-hour clock jump fires each reminder at most once', () => {
  const h = setup({ reminders: [rem({ id: 'a' }), rem({ id: 'b', everyMinutes: 50 })] }, { idle: 10 });
  h.advance(3 * 3600 * 1000);
  const all = [];
  all.push(...h.engine.tick());
  assert.equal(says(all).length, 1);
  h.engine.ack();
  all.push(...h.run(60));
  assert.equal(says(all).length, 2);
  h.engine.ack();
  assert.equal(says(h.run(10 * MIN)).length, 0);
});

test('resetOnIdle restarts the timer after idleResetMinutes of idle', () => {
  const h = setup({ idleResetMinutes: 5, reminders: [rem({ resetOnIdle: true })] }, { idle: 0 });
  h.run(44 * MIN);
  h.setIdle(300);
  h.run(1); // away: timer restarts here (45 min from now)
  h.setIdle(10);
  assert.equal(says(h.run(44 * MIN)).length, 0);
  assert.equal(says(h.run(2 * MIN)).length, 1);
});

test('reminder due in quiet hours (crossing midnight) is dropped and restarts after quiet ends', () => {
  const h = setup(
    { quietHours: { from: '20:00', to: '08:00' }, reminders: [rem()] },
    { start: new Date(2026, 0, 1, 22, 0), idle: 10 },
  );
  assert.equal(says(h.run(10 * 3600)).length, 0); // until 08:00
  assert.equal(says(h.run(44 * MIN)).length, 0);
  assert.equal(says(h.run(2 * MIN)).length, 1); // 08:45
});

// Review fixes
test('a reminder due during an ambient walk does not start a second walk', () => {
  const h = setup({ reminders: [rem({ everyMinutes: 1 })] }, { idle: 10 });
  const first = h.run(20); // ambient picks a walk; renderer has not called walkDone yet
  assert.equal(first.filter((a) => a.type === 'walk').length, 1);
  const due = h.run(60);
  assert.equal(says(due).length, 1);
  assert.equal(due.filter((a) => a.type === 'walk').length, 0);
});

test('reminders are spaced by reminderGapSeconds after one resolves', () => {
  const h = setup({ reminders: [rem({ id: 'a' }), rem({ id: 'b' })] }, { idle: 10 });
  h.run(45 * MIN); // a is showing, b is pending
  h.engine.ack();
  assert.equal(says(h.run(59)).length, 0);
  assert.deepEqual(says(h.run(1)).map((s) => s.reminderId), ['b']);
});

test('a waiting reminder gets its polite wait again after the active one clears', () => {
  const h = setup({ reminders: [rem({ id: 'a' }), rem({ id: 'b' })] }, { idle: 10 });
  h.run(45 * MIN);
  h.engine.ack();
  h.setIdle(0); // typing
  assert.equal(says(h.run(119)).length, 0); // max wait restarts at ack, not at original due time
  assert.equal(says(h.run(2)).length, 1);
});

const cfgOf = (reminders) => normalizeConfig({ reminders }).config;

test('removing a showing reminder: next tick emits hideBubble', () => {
  const h = setup({ reminders: [rem({ id: 'a' })] }, { idle: 10 });
  h.run(45 * MIN);
  h.engine.setConfig(cfgOf([]));
  assert.ok(h.run(1).some((a) => a.type === 'hideBubble'));
});

test('ack, snooze and pause right after the showing reminder is removed do not throw', () => {
  for (const act of ['ack', 'snooze', 'click']) {
    const h = setup({ reminders: [rem({ id: 'a' })] }, { idle: 10 });
    h.run(45 * MIN);
    h.engine.setConfig(cfgOf([rem({ id: 'b' })]));
    assert.doesNotThrow(() => h.engine[act]());
  }
  const h = setup({ reminders: [rem({ id: 'a' })] }, { idle: 10 });
  h.run(45 * MIN);
  h.engine.setConfig(cfgOf([rem({ id: 'b' })]));
  assert.doesNotThrow(() => h.engine.pause(1));
});
