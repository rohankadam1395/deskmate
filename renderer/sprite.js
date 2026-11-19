// DOM sprite: an <img> whose src is swapped at the state's fps.
// Single-frame states run no timer, so a sleeping buddy costs ~no CPU.

export function createSprite(el, srcFor) {
  const img = document.createElement('img');
  img.draggable = false;
  img.style.display = 'block';
  img.style.userSelect = 'none';
  el.appendChild(img);

  let avatar = null;
  let timer = null;
  let token = 0;
  let pos = { x: 0, y: 0 };
  let dir = 'right';

  const render = () => {
    el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    img.style.transform = dir === 'left' ? 'scaleX(-1)' : '';
  };

  function stop() { if (timer) clearInterval(timer); timer = null; }

  function play(name, { once = false } = {}) {
    stop();
    const my = ++token;
    const state = avatar.states[name] ?? avatar.states.idle;
    const frames = state.frames;
    let i = 0;
    img.src = srcFor(frames[0]);
    const finite = once || !state.loop;
    if (frames.length === 1 && !finite) return Promise.resolve();
    return new Promise((resolve) => {
      timer = setInterval(() => {
        if (my !== token) { resolve(); return; } // superseded by a newer play()
        i++;
        if (i >= frames.length) {
          if (!finite) { i = 0; } else {
            stop();
            resolve();
            if (my === token && state !== avatar.states.idle) play('idle');
            return;
          }
        }
        img.src = srcFor(frames[i]);
      }, 1000 / state.fps);
    });
  }

  return {
    setAvatar(a) {
      avatar = a;
      img.width = a.size;
      img.height = a.size;
      play('idle');
    },
    play,
    face(d) { dir = d; render(); },
    setPos(x, y) { pos = { x, y }; render(); },
  };
}
