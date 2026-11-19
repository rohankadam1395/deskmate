# Desktop buddy: design

Date: 2026-11-19. Status: draft for approval.

## Intent and why

A small animated companion that lives on a Windows desktop, wanders over other windows, and acts like a mischievous, funny, caring friend. It delivers health reminders (drink water, get moving after sitting, blink, look away from the screen) as a friend would, not as a system alert. Personal use only: one user, one machine, no distribution.

## Goals

- Buddy walks around the screen on top of other windows, with gestures and speech bubbles.
- Avatars are swappable. Ship two starters: a black cat and a round fluffy forest spirit, both original art in the spirit of famous anime and film characters.
- Messages, reminder timing, gestures, and the active avatar are all configurable in plain files.
- Cat-like ambient life: wander, sleep, yawn, groom, smirk, ignore you, play, demand attention.
- Reminders escalate when ignored (the "demanding attention" behavior), then give up gracefully.

## Non-goals

- No installer, auto-update, cloud sync, accounts, or telemetry.
- No GUI settings editor in v1. Config is JSON edited by hand.
- No avatar editor or marketplace. A new avatar is a folder dropped into `avatars/`.
- No fullscreen-app detection in v1 (see "Left to the builder").
- No official or copyrighted character art. Starters are original.

## Anti-goals (failure even if it technically works)

- Buddy steals focus, blocks clicks on other windows, or interrupts typing.
- Reminders feel like nagging: too frequent, no snooze, no way to shut him up.
- High CPU while idle. He should be near zero when sleeping.
- Adding an avatar or editing a message requires touching code.

## Constraints

- Windows 11, personal machine. Needs the Rust toolchain (rustup), MSVC Build Tools, and WebView2 (preinstalled on Windows 11). Node.js is only needed to run the engine tests. The builder verifies all of this first.
- Tauri 2 with a thin Rust shell. The frontend and behavior engine are plain JavaScript, with no framework and no bundler.
- Avatar art must be authored by the builder (SVG or PNG frames). Do not copy official art.

## Approaches considered

| Option | Trade-off |
|---|---|
| **A. Tauri 2** (chosen) | Small and light on RAM, with a transparent always-on-top window, tray, and autostart plugin. Needs a Rust toolchain. Click-through needs a workaround (see Window). |
| B. Electron | Click-through with mouse forwarding is built in and it is the least code, but it uses about 100 MB RAM. Was the first proposal. |
| C. Python + PySide6 | Lighter than Electron, but click-through on a transparent window is fiddlier, and it needs Python installed. |

Tauri was chosen by the user, who switched from Electron.

## Design

### Window (Claude's call)

One transparent, frameless, always-on-top, skip-taskbar, non-focusable Tauri window covering the primary display's work area. The sprite and speech bubble are moved with CSS transforms inside it, which is smoother than repositioning a small window every frame.

Click-through: the window starts with `set_ignore_cursor_events(true)`. Tauri has no "forward mouse moves" option, and an ignoring window gets no mouse events at all. So the frontend reports the sprite and bubble rectangles to Rust whenever they change. A Rust loop (about 30 Hz, only while the buddy is awake) reads the global cursor position and turns `ignore_cursor_events` off while the cursor is over a rectangle, and on again when it leaves. This is a Claude call and the riskiest part of the build. The builder should prove it first with a throwaway spike.

Multi-monitor: stay on the primary display in v1.

Rust shell responsibilities (keep it thin): window setup, tray menu, cursor hit-test loop, system idle time (Windows `GetLastInputInfo`), reading and watching `config.json`, and autostart (`tauri-plugin-autostart`). All behavior lives in the JS engine.

### Avatar format

`avatars/<id>/avatar.json` plus image files.

```json
{
  "name": "Black cat",
  "size": 96,
  "states": {
    "idle":   { "frames": ["idle1.svg", "idle2.svg"], "fps": 2, "loop": true },
    "walk":   { "frames": ["walk1.svg", "walk2.svg"], "fps": 6, "loop": true },
    "sleep":  { "frames": ["sleep1.svg", "sleep2.svg"], "fps": 1, "loop": true }
  },
  "ambient": { "sleep": 3, "yawn": 2, "groom": 2, "smirk": 1, "ignore": 2, "play": 2 }
}
```

- Required states: `idle`, `walk`. Optional: `sleep`, `yawn`, `groom`, `smirk`, `ignore`, `play`, `demand` (attention seeking), `talk`, `happy`.
- Any state a config or behavior asks for that the avatar lacks falls back to `idle`.
- `ambient` is the weighted list of gestures the avatar picks from when nothing is due. Walking is handled by the engine, not weighted here.
- Facing: frames face right; the renderer mirrors them when walking left.

### Config

`config.json` at the project root, hot-reloaded on save.

```json
{
  "avatar": "cat",
  "quietHours": { "from": "20:00", "to": "08:00" },
  "idleResetMinutes": 5,
  "reminders": [
    {
      "id": "water",
      "everyMinutes": 45,
      "gesture": "demand",
      "messages": ["Oi. Water. Now.", "Your plant drinks more than you do."],
      "snoozeMinutes": 10,
      "escalate": { "afterSeconds": 60, "gestures": ["demand", "play"], "giveUpAfterSeconds": 240 },
      "resetOnIdle": false
    },
    {
      "id": "move",
      "everyMinutes": 50,
      "gesture": "yawn",
      "messages": ["You've been sat there ages. Stretch. Walk. Go."],
      "resetOnIdle": true
    },
    { "id": "blink", "everyMinutes": 20, "gesture": "smirk", "messages": ["Blink. I'm watching."] },
    { "id": "lookaway", "everyMinutes": 20, "gesture": "ignore", "messages": ["Look away for 20 seconds. Pick something far."] }
  ]
}
```

- `messages` may also be an object keyed by avatar id with a `default` list, so each avatar can keep its own voice.
- `resetOnIdle: true` restarts the timer when the system idle time exceeds `idleResetMinutes` (system idle time supplied by the Rust shell). Away from the PC means no nagging when you return.
- Reminders are suppressed during `quietHours`.

### Behavior engine

A pure module (no Tauri or DOM imports, injected clock and RNG) so it is testable.

- **Priority:** a due reminder pre-empts ambient behavior; ambient never interrupts an active reminder.
- **Ambient loop:** idle pause, then pick weighted from the avatar's `ambient` or walk to a random spot. Cooldown prevents the same gesture twice in a row. Sleeping lowers animation work to near zero.
- **Reminder flow:** due, then walk toward a visible spot, play `gesture`, show a random message in a bubble. Then:
  - Click bubble or buddy: acknowledged, he reacts (`happy` if available), and the timer restarts.
  - Snooze control on the bubble: re-fires after `snoozeMinutes`.
  - No response: after `escalate.afterSeconds`, cycle `escalate.gestures` with a re-shown message. After `giveUpAfterSeconds` he sleeps, and the timer restarts.
- **Clicking him with nothing due:** a small reaction (smirk, purr, or happy) and an occasional quip.
- **Tray menu:** pause/resume, switch avatar, open config, reload config, quit.

### Layout

```
src-tauri/       Rust shell: window, tray, cursor hit-test, idle time, config watch, autostart
renderer/        index.html (the frontend), engine.js (pure behavior engine: state machine, timers, weighted picks), sprite and bubble rendering
avatars/cat/     avatar.json + SVG frames (original art)
avatars/spirit/  avatar.json + SVG frames (original art)
config.json
test/engine.test.js   small node:test file for the engine
```

## Testing

- `node --test` file for the engine using a fake clock: reminder fires on schedule, snooze re-fires, escalation then give-up, `resetOnIdle` resets, quiet hours suppress, missing-state fallback.
- Manual checklist for the window: click-through works over other apps, no focus steal while typing, tray works, hot reload works, dismiss and snooze work.

## Left to the builder

- Drawing the two avatars and their frames. A few frames per state is enough.
- Exact walking speeds, ambient pause lengths, bubble styling, and message wording beyond the samples.
- Handling for fullscreen apps and games (v1 may simply let him show on top; revisit if annoying).
- Multi-monitor roaming (later).

## Review decisions (Claude's calls)

- **Pause (tray):** pauses everything. Buddy hides, timers freeze, nothing fires. Options: 30 minutes, 1 hour, until resumed. Pause does not survive a restart (he comes back awake).
- **Default escalation:** every reminder gets a default `escalate` of one re-shown message after 60s, then give up and sleep at 180s. A reminder's own `escalate` block overrides it. `escalate: false` disables it.
- **Snooze and dismiss:** every reminder gets a snooze (default 10 min), set per reminder via `snoozeMinutes`. The bubble has two controls: "Done" (acknowledge, timer restarts) and "Later" (snooze). Clicking the buddy also counts as "Done". Snooze is allowed during escalation.
- **Quiet hours:** reminders due in quiet hours are dropped, with the timer restarting at the end of quiet hours, so there is no burst at 08:00. Ambient wandering also stops (he sleeps or hides).

## Decided by the user

- **Polite timing:** a due reminder waits for about 5 seconds of no keyboard or mouse input (system idle time from the Rust shell), then shows. If no gap comes within 2 minutes, it shows anyway. Both values are configurable (`politeIdleSeconds`, `politeMaxWaitSeconds`). The engine needs a "deferred" state for this, with fake-clock tests.
- **Autostart:** he starts when Windows logs in (`tauri-plugin-autostart`). The tray has a toggle to turn this off. It is on by default.

## Claude's calls (flag if wrong)

Tauri 2 with a thin Rust shell and JS engine; single full-work-area overlay window with Rust-side cursor hit-testing for click-through; JSON config hot-reload; optional per-avatar message lists; idle-reset via system idle time; escalate-then-sleep behavior; original starter art; engine as a pure testable module.
