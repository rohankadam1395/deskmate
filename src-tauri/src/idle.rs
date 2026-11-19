//! System idle time (seconds since last keyboard or mouse input).
use windows::Win32::System::SystemInformation::GetTickCount;
use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

/// Tick counts wrap every ~49.7 days; wrapping_sub keeps the difference right.
fn idle_ms(now: u32, last: u32) -> u32 {
    now.wrapping_sub(last)
}

pub fn idle_seconds() -> f64 {
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    // SAFETY: info is a valid, correctly sized LASTINPUTINFO.
    let ok = unsafe { GetLastInputInfo(&mut info) }.as_bool();
    if !ok {
        return 0.0;
    }
    idle_ms(unsafe { GetTickCount() }, info.dwTime) as f64 / 1000.0
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn idle_ms_survives_tick_wraparound() {
        assert_eq!(idle_ms(5_000, 1_000), 4_000);
        assert_eq!(idle_ms(1_000, u32::MAX - 2_999), 4_000);
    }
}
