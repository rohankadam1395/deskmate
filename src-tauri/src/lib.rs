mod hit;

use hit::{cursor_over, Rect};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, PhysicalPosition, PhysicalSize};

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
        .invoke_handler(tauri::generate_handler![set_hit_rects])
        .setup(|app| {
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
