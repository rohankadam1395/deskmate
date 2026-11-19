// Speech bubble: one shared element, positioned above the sprite.
let el = null;
let textEl = null;
let buttonsEl = null;
let noticeTimer = null;
let isReminder = false;

function ensure() {
  if (el) return;
  el = document.createElement('div');
  el.id = 'bubble';
  textEl = document.createElement('div');
  buttonsEl = document.createElement('div');
  buttonsEl.className = 'buttons';
  el.append(textEl, buttonsEl);
  el.style.display = 'none';
  document.body.appendChild(el);
}

const btn = (label, fn) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', fn);
  return b;
};

/** Reminder bubble with Done and Later controls. Safe to call again to replace the text. */
export function showBubble(text, onDone, onLater) {
  ensure();
  clearTimeout(noticeTimer);
  isReminder = true;
  textEl.textContent = text;
  buttonsEl.replaceChildren(btn('Done', onDone), btn('Later', onLater));
  el.style.display = 'block';
}

/** Short info bubble (config problems). Never replaces a reminder bubble. */
export function notice(text, ms = 6000) {
  ensure();
  if (isReminder) return;
  clearTimeout(noticeTimer);
  textEl.textContent = text;
  buttonsEl.replaceChildren();
  el.style.display = 'block';
  noticeTimer = setTimeout(hideBubble, ms);
}

export function hideBubble() {
  ensure();
  clearTimeout(noticeTimer);
  isReminder = false;
  el.style.display = 'none';
}

/** Put the bubble above the sprite, kept inside the screen. */
export function place(x, y, size) {
  if (!el || el.style.display === 'none') return;
  const w = el.offsetWidth, h = el.offsetHeight;
  const left = Math.min(Math.max(4, x + size / 2 - w / 2), innerWidth - w - 4);
  el.style.left = `${left}px`;
  el.style.top = `${Math.max(4, y - h - 8)}px`;
}

export function rect() {
  if (!el || el.style.display === 'none') return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}
