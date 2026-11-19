// Wires the engine to the DOM and the Rust shell.
import { loadConfigText } from './config.js';
import { createEngine } from './engine.js';
import { parseAvatar } from './avatar.js';
import { createSprite } from './sprite.js';
import { showBubble, hideBubble, notice, place, rect } from './bubble.js';

const { invoke, convertFileSrc } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const WALK_SPEED = 90; // px per second
const buddyEl = document.getElementById('buddy');

let dataDir = '';
let config = null;
let avatar = null;
let engine = null;
let idle = 0;
let hidden = false;
let walking = false;
let pendingGesture = null;
let pos = { x: 0, y: 0 };
let lastTickError = '';

const avatarUrl = (id, file) => convertFileSrc(`${dataDir}\\avatars\\${id}\\${file}`);
const forEngine = (a) => ({ id: a.id, states: Object.keys(a.states), ambient: a.ambient });

const sprite = createSprite(buddyEl, (file) => avatarUrl(avatar.id, file));

async function loadAvatar(id) {
  const res = await fetch(avatarUrl(id, 'avatar.json'));
  if (!res.ok) throw new Error(`avatar "${id}": avatar.json not found`);
  return parseAvatar(id, await res.json());
}

// ---- layout and click-through rects ----
let lastRects = '';
function report() {
  const rects = [];
  if (!hidden) {
    const r = buddyEl.getBoundingClientRect();
    rects.push({ x: r.x, y: r.y, w: r.width, h: r.height });
    const b = rect();
    if (b) rects.push(b);
  }
  const key = JSON.stringify(rects);
  if (key !== lastRects) { lastRects = key; invoke('set_hit_rects', { rects }); }
}
function layout() {
  sprite.setPos(pos.x, pos.y);
  place(pos.x, pos.y, avatar.size);
  report();
}
function home() {
  pos = { x: Math.max(0, innerWidth - avatar.size - 40), y: innerHeight - avatar.size - 4 };
  layout();
}

// ---- walking ----
let walkId = 0;
function walkTo(tx) {
  const my = ++walkId; // a newer walk supersedes older loops, so two can never fight over the position
  walking = true;
  sprite.face(tx >= pos.x ? 'right' : 'left');
  sprite.play('walk');
  let last = performance.now();
  const step = (now) => {
    if (my !== walkId) return;
    const dt = (now - last) / 1000;
    last = now;
    const dx = tx - pos.x;
    pos.x += Math.sign(dx) * Math.min(Math.abs(dx), WALK_SPEED * dt);
    layout();
    if (Math.abs(tx - pos.x) < 0.5) {
      walking = false;
      sprite.play(pendingGesture ?? 'idle');
      pendingGesture = null;
      engine.walkDone();
    } else requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---- engine actions ----
function apply(actions) {
  for (const a of actions) {
    switch (a.type) {
      case 'say':
        showBubble(a.text, () => apply(engine.ack()), () => apply(engine.snooze()));
        if (walking) pendingGesture = a.gesture; else sprite.play(a.gesture);
        layout();
        break;
      case 'hideBubble': hideBubble(); report(); break;
      case 'gesture': if (!walking) sprite.play(a.name); break;
      case 'walk': walkTo(Math.random() * Math.max(0, innerWidth - avatar.size)); break;
      case 'hide': hidden = true; buddyEl.style.display = 'none'; hideBubble(); report(); break;
      case 'show': hidden = false; buddyEl.style.display = ''; report(); break;
    }
  }
}

// ---- config and avatars ----
async function switchAvatar(id) {
  try {
    avatar = await loadAvatar(id);
    sprite.setAvatar(avatar);
    engine?.setAvatar(forEngine(avatar));
    layout();
    return true;
  } catch (e) {
    notice(`Avatar problem: ${e.message}`);
    return false;
  }
}

async function reloadConfig() {
  const prevAvatar = config?.avatar;
  const res = loadConfigText(await invoke('read_config'), config);
  config = res.config;
  if (res.errors.length) notice(`Config problem: ${res.errors[0]}`);
  if (!engine) return;
  engine.setConfig(config);
  // Only react when the file's avatar setting changed, so a tray choice survives unrelated edits.
  if (config.avatar && config.avatar !== prevAvatar && config.avatar !== avatar.id) await switchAvatar(config.avatar);
}

async function start() {
  dataDir = await invoke('data_dir');
  const loaded = loadConfigText(await invoke('read_config'), null);
  config = loaded.config;
  // Prefer the configured avatar, then fall back to the first valid one.
  const candidates = [config.avatar, ...(await invoke('list_avatars'))].filter(Boolean);
  let problem = loaded.errors[0] ? `Config problem: ${loaded.errors[0]}` : null;
  for (const id of candidates) {
    try { avatar = await loadAvatar(id); break; } catch (e) { problem ??= `Avatar problem: ${e.message}`; }
  }
  if (!avatar) { document.body.textContent = 'No valid avatars found'; return; }
  sprite.setAvatar(avatar);
  engine = createEngine({ config, avatar: forEngine(avatar), now: Date.now, rand: Math.random, idleSeconds: () => idle });
  home();
  if (problem) notice(problem);

  buddyEl.addEventListener('click', () => apply(engine.click()));
  addEventListener('resize', home);
  await listen('config-changed', reloadConfig);
  await listen('tray', (e) => {
    const p = e.payload;
    if (p.action === 'pause') apply(engine.pause(p.minutes));
    else if (p.action === 'resume') apply(engine.resume());
    else if (p.action === 'avatar') switchAvatar(p.id);
  });
  setInterval(async () => {
    idle = await invoke('idle_seconds');
    try {
      apply(engine.tick());
    } catch (e) {
      if (e.message !== lastTickError) notice(`Something went wrong: ${e.message}`);
      lastTickError = e.message;
    }
  }, 1000);
}

start();
