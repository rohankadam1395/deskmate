# Desktop buddy implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Tauri 2 Windows desktop companion (animated, swappable avatar) that wanders over other windows, plays cat-like gestures, and delivers configurable, escalating health reminders in a friend's voice.

**Architecture:** A thin Rust shell owns the transparent overlay window, cursor hit-testing for click-through, tray, idle time, config watching, and autostart. All behavior lives in a pure JS engine (`renderer/engine.js`, injected clock, RNG, and idle function) that returns action objects. A renderer applies those actions (sprite, bubble, movement).

**Tech stack:** Tauri 2 (Rust), plain JS ES modules with no bundler (`withGlobalTauri: true`), `node --test` for engine tests, `cargo test` for Rust logic, SVG avatar frames.

**Spec:** `docs/superpowers/specs/2026-11-19-desktop-buddy-design.md`

## Global constraints

- Windows 11, personal machine, one user. No installer, auto-update, cloud sync, accounts, or telemetry.
- Tauri 2 with a thin Rust shell. Frontend and engine are plain JavaScript, with no framework and no bundler.
- Needs the Rust toolchain (rustup), MSVC Build Tools, and WebView2. Node is only for engine tests. Verify all before Task 1.
- One transparent, frameless, always-on-top, skip-taskbar, non-focusable window covering the primary display's work area. Primary display only in v1.
- Buddy never steals focus or blocks clicks on other windows. Near-zero CPU while sleeping.
- No GUI settings editor, avatar editor, or fullscreen-app detection in v1.
- Starter avatars (black cat, round fluffy forest spirit) are original art. Never copy official art.
- Avatar required states: `idle`, `walk`. Optional: `sleep`, `yawn`, `groom`, `smirk`, `ignore`, `play`, `demand`, `talk`, `happy`. Missing state falls back to `idle`. Frames face right and are mirrored when walking left.
- Defaults: `politeIdleSeconds` 5, `politeMaxWaitSeconds` 120, `idleResetMinutes` 5, `snoozeMinutes` 10, escalate `{afterSeconds: 60, giveUpAfterSeconds: 180}`. `escalate: false` disables escalation.
- Pause (tray): 30 min, 1 hour, or until resumed. Hides buddy, freezes timers, and does not survive restart. Quiet hours drop due reminders, restart timers at the end, and stop ambient wandering.
- Autostart on by default via `tauri-plugin-autostart`, with a tray toggle.
- Bubble controls: "Done" (ack, timer restarts) and "Later" (snooze). Clicking the buddy counts as "Done". Snooze is allowed during escalation.
- User-facing copy: sentence case; no spaces around dashes or slashes.

## Plan decisions that refine the spec (flag if wrong)

- **Data location:** `config.json` and `avatars/` live in `%APPDATA%\desktop-buddy\`, seeded from the repo's `defaults/` on first run. A built exe can't read avatars from a project folder, and this keeps "drop a folder in, no code edits" true. The spec's project-root layout is a dev-time source only.
- **Rust to JS contract:** JS polls `idle_seconds` once per second; Rust emits `config-changed` and `tray` events; Rust exposes commands `read_config`, `list_avatars`, `set_hit_rects`.
- **Engine ticks at 1 Hz.** Ambient pauses are 8 to 25 s random, and the builder may tune them.

## Review focus

Inputs the spec implies but doesn't test; each is pinned by a test in its owning task.

1. **Invalid `config.json` on hot reload** (bad JSON, empty `messages`, unknown avatar): keep the last good config, don't crash (Task 2).
2. **Several reminders due at once, or a long gap** (lid closed for hours): at most one fires per reminder, one at a time with the rest queued, never a burst (Task 3).
3. **Quiet hours that cross midnight** (20:00 to 08:00) and a clock inside the window at launch: no reminder fires, no wandering (Task 3).
4. **DPI scaling above 100%**: the cursor's physical pixels must map to the frontend's CSS pixel rectangles, or click-through lands on the wrong spot (Task 1).
5. **Avatar missing optional states or an unknown gesture name in config**: falls back to idle, never throws (Task 5).

---

### Task 1: Scaffold and click-through spike

Do this first. It de-risks the whole design. The deliverable is a working transparent overlay that is clickable only over the sprite.

**Files:**
- Create: `src-tauri/` (via `cargo tauri init`), `src-tauri/src/hit.rs`, `renderer/index.html`, `package.json` (`{"type":"module","scripts":{"test":"node --test"}}`), `.gitignore`
- Modify: `src-tauri/tauri.conf.json`, `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `pub struct Rect { pub x: f64, pub y: f64, pub w: f64, pub h: f64 }` and `pub fn cursor_over(rects: &[Rect], cursor_x: f64, cursor_y: f64, scale: f64) -> bool` (rects in CSS px, cursor in physical px relative to the window; `scale` is the window scale factor); Tauri command `set_hit_rects(rects: Vec<Rect>)` storing rects in app state.

- [ ] **Step 1:** Verify `rustc --version`, `cargo --version`, and the MSVC build tools; install the Tauri CLI (`cargo install tauri-cli --version "^2"`). Run `git init`.
- [ ] **Step 2: Write failing tests in `hit.rs`:** `over_rect_at_100_percent` (rect 10,10,50,50; cursor 30,30; scale 1.0; true), `outside_rect` (cursor 80,80; false), `dpi_150_maps_physical_to_css` (same rect; cursor 45,45 physical at scale 1.5 is 30,30 CSS; true), and `dpi_150_outside` (cursor 100,100 at 1.5 is 66,66 CSS; false), and `empty_rects_is_false`.
- [ ] **Step 3:** Run `cargo test --manifest-path src-tauri/Cargo.toml hit` and see it fail.
- [ ] **Step 4:** Implement `cursor_over` (divide cursor by `scale`, then test against each rect, edges inclusive).
- [ ] **Step 5:** Run the tests and see them pass.
- [ ] **Step 6: Overlay window.** In `tauri.conf.json` set `transparent: true`, `decorations: false`, `alwaysOnTop: true`, `skipTaskbar: true`, `focus: false`, `shadow: false`, `app.withGlobalTauri: true`, `frontendDist: "../renderer"`. In `lib.rs` setup, size and position the window to the primary monitor's work area and call `set_ignore_cursor_events(true)`.
- [ ] **Step 7: Hit-test loop.** In `lib.rs` spawn a thread at about 30 Hz: read the global cursor position, subtract the window origin, call `cursor_over` with the stored rects and the window scale factor, and call `set_ignore_cursor_events(!over)` only when the state changes.
- [ ] **Step 8: Spike page.** `renderer/index.html`: a 96px colored square moved by CSS transform back and forth; on every move or resize call `invoke('set_hit_rects', {rects:[{x,y,w,h}]})` using `getBoundingClientRect`.
- [ ] **Step 9: Manual verification** with `cargo tauri dev`: (a) clicks and typing in other apps work everywhere except directly on the square; (b) clicking the square gets the page's click handler and doesn't focus the window; (c) repeat at 150% display scaling if available. If (a) or (b) fails, stop and report; the design's fallback is Electron.
- [ ] **Step 10: Commit** `feat: tauri overlay with cursor hit-test click-through`.

### Task 2: Config normalization and message picking

**Files:**
- Create: `renderer/config.js`, `test/config.test.js`

**Interfaces:**
- Produces:
  - `normalizeConfig(raw: object) -> {config: object, errors: string[]}`. Fills the Global constraint defaults. Reminders with empty or missing `messages`, missing `id`, or `everyMinutes <= 0` are dropped, each adding an entry to `errors`. `escalate: false` becomes `null`. `escalate` missing becomes `{afterSeconds: 60, gestures: [reminder.gesture], giveUpAfterSeconds: 180}`. Throws only for non-objects.
  - `pickMessage(reminder: object, avatarId: string, rand: () => number) -> string`. `messages` is an array, or an object with `[avatarId]` falling back to `default`.
  - `inQuietHours(quiet: {from:"HH:MM",to:"HH:MM"}|undefined, date: Date) -> boolean`. Handles ranges crossing midnight; `from === to` means never quiet.
  - `loadConfigText(text: string, previous: object|null) -> {config: object, errors: string[]}`. On JSON parse failure, returns `previous` (or normalized `{}` if null) with an error.

- [ ] **Step 1: Write failing tests:** defaults filled; escalate false gives null; empty messages dropped with error; `pickMessage` with array and with per-avatar object plus default fallback; `inQuietHours` for 20:00 to 08:00 at 23:00 (true), 07:59 (true), 08:00 (false), 12:00 (false); `from === to` is false; `loadConfigText("{bad", previous)` returns previous plus one error (**Review focus 1**).
- [ ] **Step 2:** Run `node --test test/config.test.js` and see it fail.
- [ ] **Step 3:** Implement the four functions in `renderer/config.js`.
- [ ] **Step 4:** Run the tests and see them pass.
- [ ] **Step 5: Commit** `feat: config normalization`.

### Task 3: Engine reminder scheduling

**Files:**
- Create: `renderer/engine.js`, `test/engine.reminders.test.js`

**Interfaces:**
- Consumes: Task 2's `inQuietHours`, `pickMessage`.
- Produces:
  - `createEngine({config, avatar, now, rand, idleSeconds}) -> Engine`, where `now: () => number` (ms epoch), `rand: () => number`, `idleSeconds: () => number`, and `avatar: {id: string, states: string[], ambient: {[gesture]: number}}`.
  - `Engine.tick() -> Action[]`, called every second.
  - `Action` is one of `{type:'say', reminderId, text, gesture}`, `{type:'gesture', name}`, `{type:'walk'}`, `{type:'hideBubble'}`, `{type:'hide'}`, `{type:'show'}`.
  - `resolveGesture(avatar, name) -> string`, which returns `name` if it is in `avatar.states`, else `'idle'`.
  - Methods `setConfig(config)` and `setAvatar(avatar)` (setConfig keeps in-flight timers for reminders whose `id` survives).

Behavior to implement: each reminder has `nextDue = start + everyMinutes`. When due and not in quiet hours, it becomes *pending*. Pending waits until `idleSeconds() >= politeIdleSeconds` or `politeMaxWaitSeconds` has elapsed since becoming pending, then emits `say` (preceded by `walk`). Only one reminder is active at a time; others stay pending and queue in due order. A reminder that has been due for several multiples of its interval fires once, then reschedules from now. With `resetOnIdle: true`, if `idleSeconds() >= idleResetMinutes*60` the reminder's timer restarts. In quiet hours, due reminders are dropped and rescheduled to the quiet-hours end.

- [ ] **Step 1: Write failing tests** with a fake clock, fake idle, and seeded rand: fires at exactly `everyMinutes`; waits while `idleSeconds` is 0 and fires at 5 s idle; fires anyway at 120 s with no idle; two reminders due together emit one `say` now and the second after the first resolves (not in one tick); a 3-hour clock jump yields one `say` per reminder total (**Review focus 2**); `resetOnIdle` restarts the timer after 5 min idle; due at 23:00 with quiet hours 20:00 to 08:00 emits nothing, and the next fire is `everyMinutes` after 08:00 (**Review focus 3**).
- [ ] **Step 2:** Run `node --test test/engine.reminders.test.js` and see it fail.
- [ ] **Step 3:** Implement `createEngine` scheduling and `resolveGesture` in `renderer/engine.js`.
- [ ] **Step 4:** Run the tests and see them pass.
- [ ] **Step 5: Commit** `feat: engine reminder scheduling`.

### Task 4: Engine reminder flow, pause, and clicks

**Files:**
- Modify: `renderer/engine.js`
- Create: `test/engine.flow.test.js`

**Interfaces:**
- Consumes: Task 3's `createEngine`, `Action`.
- Produces on `Engine`: `ack() -> Action[]`, `snooze() -> Action[]`, `click() -> Action[]`, `pause(minutes: number|null) -> Action[]`, `resume() -> Action[]`, `walkDone() -> void`.

Behavior: `ack` hides the bubble, plays `happy` (if present), and restarts that reminder's timer. `snooze` hides the bubble and re-fires after `snoozeMinutes`. With no response, after `escalate.afterSeconds` it emits `say` again cycling `escalate.gestures`; after `giveUpAfterSeconds` it emits `hideBubble` plus a `sleep` gesture and restarts the timer. `escalate: null` skips both. `click()` during an active reminder behaves as `ack`; with none active it emits a quick reaction gesture (`smirk`, `happy`, or `idle`). `pause(minutes)` emits `hide` and freezes all timers (null means until `resume`); the elapsed pause auto-resumes with `show`. Pause state is in memory only.

- [ ] **Step 1: Write failing tests:** ack restarts timer; snooze re-fires at 10 min and also while escalating; escalation re-emits `say` at 60 s and gives up at 180 s with `hideBubble` plus `sleep`; `escalate: false` never re-emits; click during active equals ack; click when idle emits one gesture and no `say`; `pause(30)` emits `hide`, nothing fires for 30 min, then `show`, and timers did not accrue during the pause; `pause(null)` stays hidden until `resume()`.
- [ ] **Step 2:** Run `node --test test/engine.flow.test.js` and see it fail.
- [ ] **Step 3:** Implement the methods.
- [ ] **Step 4:** Run all tests (`npm test`) and see them pass.
- [ ] **Step 5: Commit** `feat: engine reminder flow and pause`.

### Task 5: Engine ambient behavior

**Files:**
- Modify: `renderer/engine.js`
- Create: `test/engine.ambient.test.js`

**Interfaces:**
- Consumes: `resolveGesture`, `walk`/`walkDone` from Tasks 3 and 4.

Behavior: when no reminder is active, not paused, and not in quiet hours, after a random 8 to 25 s pause pick a weighted gesture from `avatar.ambient`, or `walk` (weight 4 internal). Never pick the same gesture twice in a row. Emit `{type:'gesture', name}` using `resolveGesture`. While walking, no new ambient pick until `walkDone()`. In quiet hours, emit `sleep` once and nothing else (the renderer may hide him). A due reminder pre-empts ambient; ambient never interrupts an active reminder.

- [ ] **Step 1: Write failing tests:** weighted pick respects weights with a seeded rand; no immediate repeat; unknown gesture in avatar `ambient` or config resolves to `idle` without throwing (**Review focus 5**); no ambient while a reminder is active; quiet hours yield one `sleep` and silence; `walk` blocks further picks until `walkDone()`.
- [ ] **Step 2:** Run it and see it fail.
- [ ] **Step 3:** Implement ambient picking.
- [ ] **Step 4:** Run `npm test` and see all pass.
- [ ] **Step 5: Commit** `feat: engine ambient behavior`.

### Task 6: Avatar loader and sprite renderer

**Files:**
- Create: `renderer/avatar.js`, `renderer/sprite.js`, `test/avatar.test.js`

**Interfaces:**
- Produces:
  - `parseAvatar(id: string, json: object) -> {id, name, size, states: {[name]: {frames: string[], fps: number, loop: boolean}}, ambient: {[gesture]: number}}`. Throws a clear error if `idle` or `walk` is missing or has no frames.
  - `createSprite(el: HTMLElement, srcFor: (file: string) => string) -> {setAvatar(av), play(name: string, opts?: {once?: boolean}) -> Promise<void>, face(dir: 'left'|'right'), setPos(x: number, y: number)}`. `play` of an unknown state plays `idle`. Non-loop states resolve at the end and return to `idle`.

- [ ] **Step 1: Write failing tests** for `parseAvatar` only (the DOM sprite is checked manually): valid avatar parses; missing `walk` throws; empty frames throws; unknown ambient keys are kept as-is (the engine resolves them).
- [ ] **Step 2:** Run `node --test test/avatar.test.js` and see it fail.
- [ ] **Step 3:** Implement `parseAvatar` and `createSprite` (an `<img>` swapped by a timer at `fps`; `face('left')` applies `scaleX(-1)`; timer paused while the tab/window is hidden and while only `sleep`-like single-frame states play, to keep idle CPU near zero).
- [ ] **Step 4:** Run the tests and see them pass.
- [ ] **Step 5: Commit** `feat: avatar parsing and sprite renderer`.

### Task 7: Rust shell services

**Files:**
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/data.rs`, `src-tauri/src/idle.rs`, `src-tauri/src/tray.rs`, `defaults/config.json`, `defaults/avatars/.gitkeep`

**Interfaces:**
- Produces Tauri commands: `read_config() -> String`, `list_avatars() -> Vec<String>` (folder names under `avatars/`), `idle_seconds() -> f64`, `set_hit_rects` (Task 1). Events emitted to the frontend: `config-changed` (no payload), `tray` with payload `{action: 'pause', minutes: number|null} | {action: 'resume'} | {action: 'avatar', id: string}`. The asset protocol is enabled and scoped to the data dir so the frontend can use `convertFileSrc` for avatar images.
- Pure function in `data.rs`: `pub fn seed_defaults(defaults: &Path, data: &Path) -> io::Result<()>` copies files that don't yet exist and never overwrites.

- [ ] **Step 1: Write failing test** in `data.rs`: `seed_defaults` into an empty temp dir creates `config.json`; running it again after the temp copy has been edited leaves the edit intact.
- [ ] **Step 2:** Run `cargo test --manifest-path src-tauri/Cargo.toml data` and see it fail.
- [ ] **Step 3:** Implement `seed_defaults`, then `data_dir()` (`%APPDATA%\desktop-buddy`) and the first-run seed from bundled `defaults/` (add `defaults/**` to bundle resources).
- [ ] **Step 4:** Run the test and see it pass.
- [ ] **Step 5:** Implement `idle.rs` with `GetLastInputInfo` (the `windows` crate), `idle_seconds` computed with `GetTickCount`.
- [ ] **Step 6:** Implement the `notify` watcher on the data dir's `config.json` (debounce about 300 ms) emitting `config-changed`, plus `read_config` and `list_avatars`.
- [ ] **Step 7:** Implement `tray.rs`: menu items Pause 30 min, Pause 1 hour, Pause until resumed, Resume, Avatar submenu (one item per avatar), Open config (opens the data dir's `config.json` with the default app), Reload config (emits `config-changed`), "Start at login" check item (`tauri-plugin-autostart`, enabled on first run), Quit.
- [ ] **Step 8: Manual verification:** run the app; tray appears; each item works; editing `config.json` in the data dir emits the event (log it); the autostart toggle adds and removes the login entry.
- [ ] **Step 9: Commit** `feat: rust shell services`.

### Task 8: Wire the renderer

**Files:**
- Create: `renderer/main.js`, `renderer/bubble.js`
- Modify: `renderer/index.html`

**Interfaces:**
- Consumes: `createEngine`, `normalizeConfig`/`loadConfigText`, `parseAvatar`, `createSprite`, the Task 7 commands and events, and `set_hit_rects`.

Behavior:
- On start, load config with `loadConfigText(await invoke('read_config'), null)` and the avatar named in `config.avatar`. If the avatar is missing or invalid, fall back to the first valid avatar in `list_avatars()` and show a bubble naming the problem.
- On `config-changed`, call `loadConfigText` with the previous good config; on errors keep running and show one short bubble (`"Config problem: <first error>"`).
- Run `engine.tick()` every second with `idleSeconds = cached value` updated from `invoke('idle_seconds')` every second.
- Apply actions: `say` shows the bubble (text plus Done and Later buttons, calling `engine.ack()` or `engine.snooze()`) and plays `gesture`; `gesture` calls `sprite.play`; `walk` picks a random target on screen, animates with CSS transition, calls `face()`, then `engine.walkDone()`; `hide` and `show` toggle visibility; clicking the sprite calls `engine.click()`.
- After any layout change report sprite and visible bubble rectangles through `set_hit_rects` (empty list while hidden).
- Handle `tray` events: pause, resume, avatar (`engine.setAvatar` plus sprite swap).

- [ ] **Step 1:** Implement `bubble.js` (`showBubble(text, onDone, onLater)`, `hideBubble()`, `rect() -> Rect|null`) and `main.js` as above.
- [ ] **Step 2: Manual verification with a throwaway avatar** (copy the spike square into two states): a reminder with `everyMinutes: 0.2` shows a bubble, Done and Later work, escalation re-shows, giving up sleeps; clicking the sprite works; clicks everywhere else still reach other apps; bad JSON in `config.json` shows the config-problem bubble and the buddy keeps running; deleting the active avatar folder falls back with a bubble.
- [ ] **Step 3: Commit** `feat: wire renderer to engine and shell`.

### Task 9: Starter avatars

**Files:**
- Create: `defaults/avatars/cat/avatar.json` plus SVG frames, `defaults/avatars/spirit/avatar.json` plus SVG frames
- Modify: `defaults/config.json` (sample reminders from the spec: water, move, blink, lookaway, with messages in the buddy's voice; `avatar: "cat"`)

Content: both original characters. **Cat** (black, sassy): states `idle`, `walk`, `sleep`, `yawn`, `groom`, `smirk`, `ignore`, `play`, `demand`, `happy`; ambient weights `{sleep:3, yawn:2, groom:2, smirk:1, ignore:2, play:2}`. **Spirit** (round, fluffy, forest-creature feel): states `idle`, `walk`, `sleep`, `yawn`, `happy`, `play`, `demand`; ambient `{sleep:3, yawn:2, play:2}`. Two or three frames per state is enough; `size` 96. Per-avatar message lists for at least `water` and `move` so the two feel different.

- [ ] **Step 1: Write a failing test** in `test/avatar.test.js`: both shipped `avatar.json` files parse with `parseAvatar`, every listed frame file exists on disk, and every `ambient` key is a defined state.
- [ ] **Step 2:** Run it and see it fail.
- [ ] **Step 3:** Draw the SVG frames and write both `avatar.json` files and the sample `config.json`. Verify with `normalizeConfig` that it returns no errors.
- [ ] **Step 4:** Run `npm test` and see all pass.
- [ ] **Step 5: Manual verification:** run the app with each avatar; every gesture displays; switching from the tray works.
- [ ] **Step 6: Commit** `feat: cat and spirit starter avatars`.

### Task 10: Final checks and README

**Files:**
- Create: `README.md`

- [ ] **Step 1:** Write `README.md`: how to run (`cargo tauri dev`), build (`cargo tauri build`), where `config.json` and `avatars/` live (`%APPDATA%\desktop-buddy\`), the config fields and the avatar folder format, with one short example of each.
- [ ] **Step 2: Run the full manual checklist from the spec:** click-through over other apps; no focus steal while typing; tray; hot reload; dismiss and snooze; reminder waits for a typing gap and shows after 2 min; autostart toggle; pause 30 min; quiet hours; idle CPU near zero while he sleeps (Task Manager, under about 1%).
- [ ] **Step 3:** Run `npm test` and `cargo test --manifest-path src-tauri/Cargo.toml`; all pass.
- [ ] **Step 4: Commit** `docs: readme and final verification`.
