// Avatar parsing: pure, no DOM.

export function parseAvatar(id, json) {
  const states = {};
  for (const [name, s] of Object.entries(json?.states ?? {})) {
    if (!Array.isArray(s?.frames) || s.frames.length === 0) {
      if (name === 'idle' || name === 'walk') throw new Error(`avatar "${id}": state "${name}" has no frames`);
      continue; // optional state with no frames is ignored; engine falls back to idle
    }
    states[name] = { frames: s.frames, fps: s.fps ?? 4, loop: s.loop ?? true };
  }
  for (const req of ['idle', 'walk']) {
    if (!states[req]) throw new Error(`avatar "${id}": required state "${req}" is missing`);
  }
  return { id, name: json.name ?? id, size: json.size ?? 96, states, ambient: json.ambient ?? {} };
}
