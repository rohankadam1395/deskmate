// Config normalization: pure, no DOM or Tauri.

export function normalizeConfig(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('config must be an object');
  }
  const errors = [];
  const reminders = [];
  for (const r of raw.reminders ?? []) {
    const id = r?.id;
    if (!id) { errors.push('reminder without id dropped'); continue; }
    const msgs = r.messages;
    const hasMsgs = Array.isArray(msgs)
      ? msgs.length > 0
      : msgs && typeof msgs === 'object' && Object.values(msgs).some((a) => Array.isArray(a) && a.length > 0);
    if (!hasMsgs) { errors.push(`reminder "${id}" dropped: no messages`); continue; }
    if (!(r.everyMinutes > 0)) { errors.push(`reminder "${id}" dropped: everyMinutes must be > 0`); continue; }
    const gesture = r.gesture ?? 'idle';
    let escalate;
    if (r.escalate === false) escalate = null;
    else escalate = { afterSeconds: 60, gestures: [gesture], giveUpAfterSeconds: 180, ...(r.escalate ?? {}) };
    reminders.push({ ...r, gesture, snoozeMinutes: r.snoozeMinutes ?? 10, escalate });
  }
  const hhmm = /^\d{1,2}:\d{2}$/;
  let quietHours = raw.quietHours;
  if (quietHours !== undefined && !(hhmm.test(quietHours?.from) && hhmm.test(quietHours?.to))) {
    errors.push('quietHours ignored: expected {"from": "HH:MM", "to": "HH:MM"}');
    quietHours = null;
  }
  const config = {
    ...raw,
    quietHours,
    reminderGapSeconds: raw.reminderGapSeconds ?? 60,
    politeIdleSeconds: raw.politeIdleSeconds ?? 5,
    politeMaxWaitSeconds: raw.politeMaxWaitSeconds ?? 120,
    idleResetMinutes: raw.idleResetMinutes ?? 5,
    reminders,
  };
  return { config, errors };
}

export function pickMessage(reminder, avatarId, rand) {
  const m = reminder.messages;
  const list = Array.isArray(m)
    ? m
    : (m[avatarId]?.length ? m[avatarId] : m.default?.length ? m.default : Object.values(m).find((a) => a?.length) ?? []);
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}

const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

export function inQuietHours(quiet, date) {
  if (!quiet) return false;
  const from = toMin(quiet.from), to = toMin(quiet.to);
  if (from === to) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  return from < to ? now >= from && now < to : now >= from || now < to;
}

export function loadConfigText(text, previous) {
  let raw;
  try { raw = JSON.parse(text); } catch (e) {
    return { config: previous ?? normalizeConfig({}).config, errors: [`invalid JSON: ${e.message}`] };
  }
  try { return normalizeConfig(raw); } catch (e) {
    return { config: previous ?? normalizeConfig({}).config, errors: [e.message] };
  }
}
