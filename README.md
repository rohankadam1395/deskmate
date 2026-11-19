# Deskmate

A small animated companion that wanders over your Windows desktop and nudges you to drink water, move, blink and look away from the screen.

## Run and build

Needs Rust (rustup), the MSVC Build Tools and the Tauri CLI (`cargo install tauri-cli --version "^2"`).

```
cargo tauri dev      # run
cargo tauri build    # build an installer-free exe under src-tauri/target/release
npm test             # engine and avatar tests (Node)
cargo test --manifest-path src-tauri/Cargo.toml --lib   # Rust tests
```

## Where your files live

`%APPDATA%\deskmate\` holds `config.json` and `avatars/`. They are copied from `defaults/` on first run and never overwritten, so edit them there. Saving `config.json` reloads it within a second. The tray menu has Open config, Reload config, pause, avatar switching and a Start at login toggle.

## Config

```json
{
  "avatar": "cat",
  "quietHours": { "from": "20:00", "to": "08:00" },
  "idleResetMinutes": 5,
  "politeIdleSeconds": 5,
  "politeMaxWaitSeconds": 120,
  "reminders": [
    {
      "id": "water",
      "everyMinutes": 45,
      "gesture": "demand",
      "snoozeMinutes": 10,
      "resetOnIdle": false,
      "messages": { "cat": ["Oi. Water. Now."], "default": ["Time to drink some water."] },
      "escalate": { "afterSeconds": 60, "gestures": ["demand", "play"], "giveUpAfterSeconds": 240 }
    }
  ]
}
```

- `messages` is a list, or an object keyed by avatar id with a `default`.
- `escalate: false` turns off re-prompting (the bubble still hides after 3 minutes). Omit it for the default (re-show after 60 s, give up at 180 s).
- `resetOnIdle: true` restarts the timer after `idleResetMinutes` away from the PC.
- A due reminder waits for `politeIdleSeconds` without keyboard or mouse input, and shows anyway after `politeMaxWaitSeconds`.
- A bad `config.json` never crashes him: he keeps the last good config and shows a "Config problem" bubble.

## Avatars

A folder in `avatars/` with an `avatar.json` and image frames (SVG or PNG):

```json
{
  "name": "My cat",
  "size": 96,
  "states": {
    "idle": { "frames": ["idle1.svg", "idle2.svg"], "fps": 1, "loop": true },
    "walk": { "frames": ["walk1.svg", "walk2.svg"], "fps": 6, "loop": true },
    "yawn": { "frames": ["yawn1.svg", "yawn2.svg"], "fps": 2, "loop": false }
  },
  "ambient": { "yawn": 2 }
}
```

`idle` and `walk` are required. Optional states are `sleep`, `yawn`, `groom`, `smirk`, `ignore`, `play`, `demand`, `talk` and `happy`; any state an avatar lacks falls back to `idle`. Frames face right and are mirrored when he walks left. `ambient` is the weighted list of gestures he picks from when nothing is due. A new avatar appears in the tray after a restart.
