import { normalizeConfig } from '../renderer/config.js';
import { createEngine } from '../renderer/engine.js';

export const rem = (o = {}) => ({ id: 'water', everyMinutes: 45, gesture: 'demand', messages: ['hi'], escalate: false, ...o });

export const AVATAR = {
  id: 'cat',
  states: ['idle', 'walk', 'demand', 'sleep', 'happy', 'smirk', 'yawn', 'play'],
  ambient: {},
};

// Fake-clock engine. rand is constant 0 unless overridden.
export function setup(rawConfig, { start = new Date(2026, 0, 1, 12, 0), idle = 0, rand = () => 0, avatar = AVATAR } = {}) {
  let t = start.getTime();
  let idleS = idle;
  const { config } = normalizeConfig(rawConfig);
  const engine = createEngine({ config, avatar, now: () => t, rand, idleSeconds: () => idleS });
  const h = {
    engine,
    now: () => t,
    advance(ms) { t += ms; },
    setIdle(s) { idleS = s; },
    // advance `sec` seconds one tick at a time, collecting every action
    run(sec) {
      const out = [];
      for (let i = 0; i < sec; i++) { t += 1000; out.push(...engine.tick()); }
      return out;
    },
  };
  return h;
}

export const says = (actions) => actions.filter((a) => a.type === 'say');
