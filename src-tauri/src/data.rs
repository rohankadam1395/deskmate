//! Data directory (%APPDATA%\deskmate): config.json and avatars/, seeded from defaults/.

use std::{fs, io, path::Path};

/// Copy files from `defaults` into `data` that don't exist yet. Never overwrites.
pub fn seed_defaults(defaults: &Path, data: &Path) -> io::Result<()> {
    fs::create_dir_all(data)?;
    for entry in fs::read_dir(defaults)? {
        let entry = entry?;
        let target = data.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            seed_defaults(&entry.path(), &target)?;
        } else if !target.exists() {
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// Move the pre-rename data dir to its new name. Returns true if it moved.
/// Does nothing when the new dir already exists (never merges or overwrites).
pub fn migrate_legacy(old: &Path, new: &Path) -> io::Result<bool> {
    if old.exists() && !new.exists() {
        fs::rename(old, new)?;
        return Ok(true);
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("buddy-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn seed_creates_missing_files_and_never_overwrites() {
        let (defaults, data) = (tmp("defaults"), tmp("data"));
        fs::create_dir_all(defaults.join("avatars/cat")).unwrap();
        fs::write(defaults.join("config.json"), "{\"avatar\":\"cat\"}").unwrap();
        fs::write(defaults.join("avatars/cat/avatar.json"), "{}").unwrap();

        seed_defaults(&defaults, &data).unwrap();
        assert_eq!(fs::read_to_string(data.join("config.json")).unwrap(), "{\"avatar\":\"cat\"}");
        assert!(data.join("avatars/cat/avatar.json").exists());

        fs::write(data.join("config.json"), "edited").unwrap();
        seed_defaults(&defaults, &data).unwrap();
        assert_eq!(fs::read_to_string(data.join("config.json")).unwrap(), "edited");
    }

    #[test]
    fn migrate_moves_old_dir_only_when_new_is_missing() {
        let root = tmp("migrate");
        let (old, new) = (root.join("desktop-buddy"), root.join("deskmate"));
        fs::create_dir_all(&old).unwrap();
        fs::write(old.join("config.json"), "mine").unwrap();

        assert!(migrate_legacy(&old, &new).unwrap());
        assert_eq!(fs::read_to_string(new.join("config.json")).unwrap(), "mine");
        assert!(!old.exists());

        // new already exists: leave an old dir alone, never merge or overwrite
        fs::create_dir_all(&old).unwrap();
        fs::write(old.join("config.json"), "stale").unwrap();
        assert!(!migrate_legacy(&old, &new).unwrap());
        assert_eq!(fs::read_to_string(new.join("config.json")).unwrap(), "mine");
        assert!(old.exists());
        // nothing to migrate
        assert!(!migrate_legacy(&root.join("nope"), &root.join("other")).unwrap());
    }
}
