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
  let active = null; // { id, shownAt, escCount }
  let paused = null; // { since: ms, until: ms|null }

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
        active = { id, shownAt: t, escCount: 0 };
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

  function tickActive(t, actions) {
    const r = reminder(active.id);
    if (!r) { active = null; return; } // removed from config while showing
    const dt = t - active.shownAt;
    // escalate: null (escalate:false) never re-says, but still gives up at the default 180 s
    const esc = r.escalate ?? { afterSeconds: Infinity, gestures: [], giveUpAfterSeconds: 180 };
    if (dt >= esc.giveUpAfterSeconds * 1000) {
      timers.set(r.id, schedule(r, t));
      active = null;
      actions.push({ type: 'hideBubble' });
      if (r.escalate) actions.push({ type: 'gesture', name: resolveGesture(av, 'sleep') });
      return;
    }
    const n = Math.floor(dt / (esc.afterSeconds * 1000));
    if (n > active.escCount) {
      active.escCount = n;
      const g = esc.gestures[(n - 1) % esc.gestures.length] ?? r.gesture;
      actions.push({ type: 'say', reminderId: r.id, text: pickMessage(r, av.id, rand), gesture: resolveGesture(av, g) });
    }
  }

  function resume() {
    const t = now();
    const d = t - paused.since;
    for (const s of timers.values()) {
      s.nextDue += d;
      s.dueAt += d;
      if (s.pendingSince !== null) s.pendingSince += d;
    }
    paused = null;
    return [{ type: 'show' }];
  }

  const ack = () => {
    if (!active) return [];
    const r = reminder(active.id);
    timers.set(r.id, schedule(r, now()));
    active = null;
    return [{ type: 'hideBubble' }, { type: 'gesture', name: resolveGesture(av, 'happy') }];
  };

  return {
    tick() {
      const t = now();
      if (paused) return paused.until !== null && t >= paused.until ? resume() : [];
      const actions = [];
      if (active) tickActive(t, actions);
      tickReminders(t, actions);
      return actions;
    },
    ack,
    snooze() {
      if (!active) return [];
      const r = reminder(active.id);
      const s = schedule(r, now());
      s.nextDue = now() + r.snoozeMinutes * MIN;
      timers.set(r.id, s);
      active = null;
      return [{ type: 'hideBubble' }];
    },
    click() {
      if (active) return ack();
      const pool = ['smirk', 'happy'].filter((g) => av.states.includes(g));
      const name = pool.length ? pool[Math.floor(rand() * pool.length)] : 'idle';
      return [{ type: 'gesture', name }];
    },
    pause(minutes) {
      if (paused) return [];
      const t = now();
      paused = { since: t, until: minutes === null ? null : t + minutes * MIN };
      const out = [{ type: 'hide' }];
      if (active) { // drop the shown reminder; it restarts a full interval after resume
        timers.set(active.id, schedule(reminder(active.id), t));
        active = null;
        out.unshift({ type: 'hideBubble' });
      }
      return out;
    },
    resume() { return paused ? resume() : []; },
    setConfig(c) { cfg = c; syncTimers(now()); },
    setAvatar(a) { av = a; },
  };
}
