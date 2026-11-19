// Pure behavior engine: no DOM, no Tauri. Time, randomness and idle time are injected.
import { inQuietHours, pickMessage } from './config.js';

const MIN = 60_000;

export function resolveGesture(avatar, name) {
  return avatar.states.includes(name) ? name : 'idle';
}

function quietEnd(quiet, t) {
  const [h, m] = quiet.to.split(':').map(Number);
  const d = new Date(t);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= t) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function createEngine({ config, avatar, now, rand, idleSeconds }) {
  let cfg = config;
  let av = avatar;
  // id -> { nextDue: ms, pendingSince: ms|null, dueAt: ms }
  const timers = new Map();
  let active = null; // { id }

  const schedule = (r, from) => ({ nextDue: from + r.everyMinutes * MIN, pendingSince: null, dueAt: 0 });
  const syncTimers = (t) => {
    const ids = new Set(cfg.reminders.map((r) => r.id));
    for (const id of [...timers.keys()]) if (!ids.has(id)) timers.delete(id);
    for (const r of cfg.reminders) if (!timers.has(r.id)) timers.set(r.id, schedule(r, t));
  };
  syncTimers(now());

  const reminder = (id) => cfg.reminders.find((r) => r.id === id);

  function tickReminders(t, actions) {
    const quiet = inQuietHours(cfg.quietHours, new Date(t));
    const idle = idleSeconds();
    for (const r of cfg.reminders) {
      const s = timers.get(r.id);
      if (active?.id === r.id) continue;
      if (quiet) {
        if (s.nextDue <= t || s.pendingSince !== null) {
          timers.set(r.id, schedule(r, quietEnd(cfg.quietHours, t)));
        }
        continue;
      }
      if (r.resetOnIdle && idle >= cfg.idleResetMinutes * 60) {
        timers.set(r.id, schedule(r, t));
        continue;
      }
      if (s.nextDue <= t && s.pendingSince === null) {
        s.pendingSince = t;
        s.dueAt = s.nextDue;
      }
    }
    if (active || quiet) return;
    const pending = [...timers.entries()]
      .filter(([, s]) => s.pendingSince !== null)
      .sort((a, b) => a[1].dueAt - b[1].dueAt);
    for (const [id, s] of pending) {
      if (idle >= cfg.politeIdleSeconds || t - s.pendingSince >= cfg.politeMaxWaitSeconds * 1000) {
        const r = reminder(id);
        s.pendingSince = null;
        s.nextDue = t + r.everyMinutes * MIN; // restarted again by ack/snooze
        active = { id };
        actions.push({ type: 'walk' });
        actions.push({
          type: 'say',
          reminderId: id,
          text: pickMessage(r, av.id, rand),
          gesture: resolveGesture(av, r.gesture),
        });
        return;
      }
    }
  }

  return {
    tick() {
      const actions = [];
      tickReminders(now(), actions);
      return actions;
    },
    // Minimal ack (completed in Task 4): resolves the active reminder and restarts its timer.
    ack() {
      if (!active) return [];
      const r = reminder(active.id);
      timers.set(r.id, schedule(r, now()));
      active = null;
      return [{ type: 'hideBubble' }];
    },
    setConfig(c) { cfg = c; syncTimers(now()); },
    setAvatar(a) { av = a; },
  };
}
