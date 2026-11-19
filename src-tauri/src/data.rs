//! Data directory (%APPDATA%\desktop-buddy): config.json and avatars/, seeded from defaults/.

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
}
