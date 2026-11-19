//! Tray icon and menu. Menu actions are forwarded to the frontend as `tray` events.
use serde_json::json;
use tauri::menu::{CheckMenuItem, MenuBuilder, MenuItem, SubmenuBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter};
use tauri_plugin_autostart::ManagerExt;

pub fn build(app: &AppHandle, avatars: &[String], config_path: std::path::PathBuf) -> tauri::Result<()> {
    let item = |id: &str, label: &str| MenuItem::with_id(app, id, label, true, None::<&str>);
    let mut avatar_menu = SubmenuBuilder::new(app, "Avatar");
    for a in avatars {
        avatar_menu = avatar_menu.item(&item(&format!("avatar:{a}"), a)?);
    }
    let autostart = CheckMenuItem::with_id(
        app, "autostart", "Start at login", true, app.autolaunch().is_enabled().unwrap_or(false), None::<&str>,
    )?;
    let menu = MenuBuilder::new(app)
        .item(&item("pause30", "Pause 30 minutes")?)
        .item(&item("pause60", "Pause 1 hour")?)
        .item(&item("pauseinf", "Pause until resumed")?)
        .item(&item("resume", "Resume")?)
        .separator()
        .item(&avatar_menu.build()?)
        .item(&item("open_config", "Open config")?)
        .item(&item("reload", "Reload config")?)
        .item(&autostart)
        .separator()
        .item(&item("quit", "Quit")?)
        .build()?;

    let autostart_item = autostart.clone();
    TrayIconBuilder::new()
        .icon(app.default_window_icon().cloned().expect("window icon"))
        .tooltip("Deskmate")
        .menu(&menu)
        .on_menu_event(move |app, event| {
            let id = event.id.as_ref();
            let tray = |v| { let _ = app.emit("tray", v); };
            match id {
                "pause30" => tray(json!({"action": "pause", "minutes": 30})),
                "pause60" => tray(json!({"action": "pause", "minutes": 60})),
                "pauseinf" => tray(json!({"action": "pause", "minutes": null})),
                "resume" => tray(json!({"action": "resume"})),
                "reload" => { let _ = app.emit("config-changed", ()); }
                "open_config" => { let _ = std::process::Command::new("explorer").arg(&config_path).spawn(); }
                "autostart" => {
                    let al = app.autolaunch();
                    let on = al.is_enabled().unwrap_or(false);
                    let _ = if on { al.disable() } else { al.enable() };
                    let _ = autostart_item.set_checked(al.is_enabled().unwrap_or(false));
                }
                "quit" => app.exit(0),
                other => if let Some(a) = other.strip_prefix("avatar:") {
                    tray(json!({"action": "avatar", "id": a}));
                },
            }
        })
        .build(app)?;
    Ok(())
}
