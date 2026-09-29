# Releases

## v0.4.0 (Upcoming)

### New Features

- **Generated responsive layouts**: Below the width a layout was arranged at, tiles now wrap onto new lines once they would shrink below half their authored size (`wrap_shrink`), `min_col_width` or their own `min_width`, instead of shrinking proportionally. Works with or without `breakpoints`. The new `reference_width` parameter records the authoring width, and `responsive_mode="scale"` restores the previous behavior.
- The breakpoint toolbar marks the base band and bands with custom layouts, and a Reset button discards a band's custom layout. `TileGrid.reset_responsive_layout()` does the same from Python.

### Behavior Changes

- `responsive_layouts` now only holds layouts created by editing a band other than the base band. Previously every edit in AUTO mode, and every switch between bands, copied the displayed layout into the current band.
- Editing a band preview no longer overwrites `layout`.
- A band without a custom layout is generated from `layout` rather than copied from the next larger band.

---

## v0.3.0 (Upcoming)

### New Features

- **Responsive breakpoint layouts**: Define `breakpoints` (e.g. `[768, 1200]`) to author per-breakpoint tile arrangements. A toolbar appears in edit mode to switch between breakpoint views, and layouts are stored in the new `responsive_layouts` parameter. ([#278adf3](https://github.com/panel-extensions/panel-tiles/commit/278adf3))

### Bug Fixes

- Fixed tile opacity not being restored correctly after an error during drag/resize. ([#8](https://github.com/panel-extensions/panel-tiles/pull/8))

---

## v0.2.0 (2026-06-14)

### New Features

- **`min_col_width` parameter**: Set a minimum tile width in pixels. When the container is too narrow for a tile at its authored percentage, the tile responsively widens to prevent overflow without modifying the persisted layout. ([#5](https://github.com/panel-extensions/panel-tiles/pull/5))

---

## v0.1.0 (2026-06-04)

Initial release of panel-tiles, providing `TileGrid`, a draggable and resizable grid layout for Panel apps powered by Muuri and interact.js.

### Features

- Drag-and-drop tile reordering
- Resize tiles from the corner handle
- Configurable layout with percentage-based widths and pixel heights
- Close buttons with `hide` or `remove` behavior via the `close_action` parameter
- Persist user layouts to browser localStorage with `local_save`
- Read-only mode (`editable=False`) for fixed dashboards
- Dynamic add/remove of tiles at runtime
- Card-style tile appearance with configurable `elevation`
- Gap-filling layout algorithm (`fill_gaps`)
