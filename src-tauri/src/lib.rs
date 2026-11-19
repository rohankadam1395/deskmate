mod data;
mod hit;
mod idle;
mod tray;

use hit::{cursor_over, Rect};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

struct DataDir(PathBuf);

#[tauri::command]
fn data_dir(d: tauri::State<DataDir>) -> String {
    d.0.to_string_lossy().into_owned()
}

#[tauri::command]
fn read_config(d: tauri::State<DataDir>) -> Result<String, String> {
    std::fs::read_to_string(d.0.join("config.json")).map_err(|e| e.to_string())
}

/// Avatar folder names (folders under avatars/ that contain avatar.json).
#[tauri::command]
fn list_avatars(d: tauri::State<DataDir>) -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(d.0.join("avatars"))
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().join("avatar.json").exists())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    v.sort();
    v
}

#[tauri::command]
fn idle_seconds() -> f64 {
    idle::idle_seconds()
}

#[derive(Default)]
struct HitRects(Mutex<Vec<Rect>>);

#[tauri::command]
fn set_hit_rects(state: tauri::State<HitRects>, rects: Vec<Rect>) {
    *state.0.lock().unwrap() = rects;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(HitRects::default())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .invoke_handler(tauri::generate_handler![set_hit_rects, data_dir, read_config, list_avatars, idle_seconds])
        .setup(|app| {
            // Data dir: %APPDATA%\desktop-buddy, seeded from bundled defaults/ (never overwritten).
            let data = app.path().data_dir()?.join("desktop-buddy");
            let first_run = !data.join("config.json").exists();
            let defaults = app
                .path()
                .resource_dir()
                .ok()
                .map(|d| d.join("defaults"))
                .filter(|d| d.exists())
                .unwrap_or_else(|| PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../defaults")));
            data::seed_defaults(&defaults, &data)?;
            app.manage(DataDir(data.clone()));
            // Autostart is on by default, but only for real builds: a dev build would register target/debug.
            if first_run && !cfg!(debug_assertions) {
                let _ = app.autolaunch().enable();
            }

            // Config hot reload: poll the file's mtime (simple, no extra crate).
            let handle = app.handle().clone();
            let cfg_path = data.join("config.json");
            std::thread::spawn(move || {
                let mtime = || std::fs::metadata(&cfg_path).and_then(|m| m.modified()).ok();
                let mut last = mtime();
                loop {
                    std::thread::sleep(Duration::from_millis(700));
                    let now = mtime();
                    if now != last {
                        last = now;
                        let _ = handle.emit("config-changed", ());
                    }
                }
            });

            let avatars = list_avatars(app.state::<DataDir>());
            tray::build(app.handle(), &avatars, data.join("config.json"))?;

            let win = app.get_webview_window("main").expect("main window");

            // Cover the primary display's work area (taskbar excluded).
            if let Some(m) = app.primary_monitor()? {
                let wa = m.work_area();
                win.set_position(PhysicalPosition::new(wa.position.x, wa.position.y))?;
                win.set_size(PhysicalSize::new(wa.size.width, wa.size.height))?;
            }
            win.set_ignore_cursor_events(true)?;
            win.show()?;

            // Click-through hit test (~30 Hz): the window only takes the mouse while the
            // cursor is over a reported sprite/bubble rect.
            let w = win.clone();
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut ignoring = true;
                loop {
                    std::thread::sleep(Duration::from_millis(33));
                    let (Ok(cur), Ok(origin)) = (w.cursor_position(), w.inner_position()) else { continue };
                    let scale = w.scale_factor().unwrap_or(1.0);
                    let rects = handle.state::<HitRects>().0.lock().unwrap().clone();
                    let over = cursor_over(&rects, cur.x - origin.x as f64, cur.y - origin.y as f64, scale);
                    if over == ignoring {
                        ignoring = !over;
                        let _ = w.set_ignore_cursor_events(ignoring);
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running desktop buddy");
}
