//! Cursor hit-testing for click-through. Rects are CSS px; the cursor is physical px
//! relative to the window; `scale` is the window scale factor (1.5 at 150% DPI).

#[derive(Clone, Copy, Debug, serde::Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// True when the cursor is over any rect (edges inclusive).
pub fn cursor_over(rects: &[Rect], cursor_x: f64, cursor_y: f64, scale: f64) -> bool {
    let (x, y) = (cursor_x / scale, cursor_y / scale);
    rects.iter().any(|r| x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
}

#[cfg(test)]
mod tests {
    use super::*;
    const R: Rect = Rect { x: 10.0, y: 10.0, w: 50.0, h: 50.0 };

    #[test]
    fn over_rect_at_100_percent() {
        assert!(cursor_over(&[R], 30.0, 30.0, 1.0));
    }
    #[test]
    fn outside_rect() {
        assert!(!cursor_over(&[R], 80.0, 80.0, 1.0));
    }
    #[test]
    fn dpi_150_maps_physical_to_css() {
        assert!(cursor_over(&[R], 45.0, 45.0, 1.5)); // 30,30 CSS
    }
    #[test]
    fn dpi_150_outside() {
        assert!(!cursor_over(&[R], 100.0, 100.0, 1.5)); // 66,66 CSS
    }
    #[test]
    fn empty_rects_is_false() {
        assert!(!cursor_over(&[], 30.0, 30.0, 1.0));
    }
}
