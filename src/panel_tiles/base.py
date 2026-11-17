import hashlib
import os
from pathlib import Path
from typing import Literal

import param
from bokeh.embed.bundle import extension_dirs
from panel.custom import Children, JSComponent
from panel.io import state
from panel.layout.base import ListLike
from panel.util import classproperty

BASE_PATH = Path(__file__).parent
DIST_PATH = BASE_PATH / "dist"

extension_dirs["panel-tiles"] = DIST_PATH


class _TileIndex(param.Integer):
    """An index into the owner's `objects`, rejected when out of range."""

    def __set__(self, obj, val):
        if val is not None and obj is not None and not isinstance(obj, type) and obj._param__private.initialized:
            _check_tile_index(obj, val)
        super().__set__(obj, val)


def _check_tile_index(obj, index):
    if not 0 <= index < len(obj.objects):
        raise ValueError(f"{type(obj).__name__}.selected must be None or an index into objects (0 to {len(obj.objects) - 1}), got {index}.")


def _band_labels(breakpoints):
    """Band labels in the order grid.js assigns them to `breakpoints`."""
    if not breakpoints:
        return []
    names = ["xs", "sm", "md", "lg", "xl", "xxl"]
    return [names[i] if i < len(names) else f"bp{i}" for i in range(len(breakpoints) + 1)]


class TileGrid(JSComponent, ListLike):
    """
    A drag+resize grid wrapper around Muuri + interactjs.
    """

    card = param.Boolean(
        default=True,
        doc="""
        Whether to display tiles with a card-like appearance including
        box-shadow, background color, and padding.""",
    )

    close_action = param.Selector(default=None, objects=[None, "hide", "remove"])

    editable = param.Boolean(
        default=True,
        doc="""
        Whether to show drag, resize, and close handles and allow
        interactive rearrangement of tiles.""",
    )

    elevation = param.Integer(default=3, bounds=(0, 20))

    fill_gaps = param.Boolean(
        default=True,
        doc="""
        Whether later tiles may fill gaps left anywhere above them when
        `layout_mode="masonry"`. Has no effect in "rows" mode.""",
    )

    layout_mode = param.Selector(
        default="masonry",
        objects=["masonry", "rows"],
        doc="""
        How tiles are packed. "masonry" places each tile in the top-left-most
        free slot, so later tiles backfill gaps anywhere in the grid (see
        `fill_gaps`). "rows" fills rows left to right in order: each row is as
        tall as its tallest tile and the next row starts below it. Shorter
        tiles may stack in the space beside a taller tile within the same row
        but never move into an earlier row, and dragging inserts a tile
        before or after the tile under the pointer.""",
    )

    columns = param.Integer(
        default=None,
        bounds=(1, None),
        doc="""
        Number of columns resized tile edges snap to, e.g. 12. Widths are
        still stored as percentages. When unset, tiles only snap to the
        edges of other tiles and the end of their row.""",
    )

    row_height = param.Integer(
        default=None,
        bounds=(1, None),
        doc="""
        Pixel step resized tile heights snap to, including the tile's
        margins, so a tile two steps tall lines up with two stacked tiles one
        step tall. When unset, heights only snap to the edges of other
        tiles.""",
    )

    breakpoints = param.List(
        default=[],
        doc="""
        List of pixel-width thresholds that define responsive breakpoint
        bands, e.g. [768, 1200] yields three bands: xs (<768), sm (768-1200),
        md (>1200). When set, a toolbar appears in edit mode to preview each
        band and optionally author a custom layout for it.""",
    )

    preview_band = param.Selector(
        default=None,
        objects=[None],
        doc="""
        Label of the breakpoint band (e.g. "xs") the grid previews and edits,
        or None to follow the container width. Edits made while the band
        containing `reference_width` is previewed update `layout`, edits to
        any other band update `responsive_layouts`. Clicking a toolbar chip
        updates it.""",
    )

    show_breakpoint_toolbar = param.Boolean(
        default=True,
        doc="""
        Whether to show the toolbar of breakpoint chips in edit mode. Hide
        it to switch bands with `preview_band` from your own controls.""",
    )

    overflow_tolerance = param.Integer(
        default=56,
        bounds=(0, None),
        doc="""
        How far in pixels a tile may be dragged past the end of its row
        while resizing before the row reflows. Within this distance the
        tile snaps to fill the remaining row space exactly.""",
    )

    min_col_width = param.Integer(
        default=None,
        bounds=(50, None),
        doc="""
        Minimum tile width in pixels. When the container is too narrow
        for a tile at its authored percentage, the tile is responsively
        widened to prevent overflow. The persisted layout is unaffected.""",
    )

    layout = param.List(
        default=[],
        doc="""
        The authored layout, one dict per tile with `index`, `width` (percent),
        `height` (px) and `visible`. Narrower containers derive their layout
        from it (see `responsive_mode`); it is only modified by edits made
        while the authored layout itself is displayed.""",
    )

    local_save = param.Boolean(default=False)

    reference_width = param.Integer(
        default=None,
        bounds=(1, None),
        doc="""
        Container width in pixels at which `layout` was last edited. Tiles
        keep their authored size relative to this width when the container
        narrows. Set automatically on edit; when unset the largest breakpoint
        (or 1200px) is assumed.""",
    )

    responsive_layouts = param.Dict(
        default={},
        doc="""
        Custom layouts keyed by breakpoint label (e.g. "xs", "sm"), created
        by editing a band other than the one containing `reference_width`.
        Bands without an entry use a layout generated from `layout`.""",
    )

    responsive_mode = param.Selector(
        default="wrap",
        objects=["wrap", "scale"],
        doc="""
        How to adapt `layout` below `reference_width`. "wrap" moves tiles onto
        new lines once they would shrink below `wrap_shrink` of their authored
        width (or below `min_col_width`); "scale" keeps authored percentages.""",
    )

    wrap_shrink = param.Number(
        default=0.5,
        bounds=(0, 1),
        doc="""
        Fraction of its authored pixel width a tile may shrink to before it
        wraps onto a new line when `responsive_mode="wrap"`.""",
    )

    selected = _TileIndex(
        default=None,
        allow_None=True,
        doc="""
        Index into `objects` of the tile last clicked, focused, dragged or
        resized, or None. Setting it highlights that tile. It follows its
        tile when tiles are added or removed before it and resets to None
        when its tile is removed or closed.""",
    )

    name = param.String(default="")

    objects = Children(doc="Items in the grid.")

    _bundle = DIST_PATH / "panel-tiles.bundle.js"
    _esm = BASE_PATH / "models" / "grid.js"
    _esm_shared = {"responsive": BASE_PATH / "models" / "responsive.js"}
    _stylesheets = [DIST_PATH / "css" / "grid.css"]
    _render_policy = "manual"

    @classmethod
    def _esm_path(cls, compiled: bool | Literal["compiling"] = True) -> os.PathLike | None:
        return super()._esm_path(compiled or True)

    @classmethod
    def _render_esm(cls, compiled: bool | Literal["compiling"] = True, server: bool = False):
        esm_path = cls._esm_path(compiled=compiled)
        if compiled != "compiling" and server:
            # Generate relative path to handle apps served on subpaths
            esm = ("" if state.rel_path else "./") + cls._component_resource_path(esm_path, compiled)
            # The bundle is served without cache headers, so a versioned URL is
            # what stops browsers reusing the bundle of an older release.
            modified = hashlib.sha256(str(esm_path.stat().st_mtime).encode("utf-8")).hexdigest()
            esm += f"?{modified}"
        else:
            esm = esm_path.read_text(encoding="utf-8")
        return esm

    @classproperty
    def _bundle_path(cls) -> os.PathLike | None:
        return cls._bundle

    def __init__(self, *args, **kwargs):
        # Valid bands depend on `breakpoints`, which may be set in the same call.
        preview_band = kwargs.pop("preview_band", None)
        super().__init__(*args, **kwargs)
        if self.selected is not None:
            _check_tile_index(self, self.selected)
        self.param.watch(self._track_selected, "objects")
        self._update_bands()
        self.preview_band = preview_band
        if self.local_save and not self.name:
            import warnings

            warnings.warn(
                "TileGrid has local_save=True but no name set. " "Provide a unique name to avoid collisions when " "multiple grids exist on the same page.",
                UserWarning,
                stacklevel=2,
            )

    def _track_selected(self, event):
        if self.selected is None:
            return
        old = event.old or []
        tile = old[self.selected] if self.selected < len(old) else None
        self.selected = next((i for i, obj in enumerate(event.new) if obj is tile), None)

    @param.depends("breakpoints", watch=True)
    def _update_bands(self):
        self.param.preview_band.objects = [None, *_band_labels(self.breakpoints)]
        if self.preview_band not in self.param.preview_band.objects:
            self.preview_band = None

    def clear_local_save(self):
        """Clear the saved layout from the browser's localStorage."""
        self._send_msg({"action": "clear_local_save"})

    def reset_responsive_layout(self, band: str | None = None):
        """
        Discard the custom layout for `band`, or all custom layouts if no
        band is given, so the affected bands use generated layouts again.
        """
        if band is None:
            self.responsive_layouts = {}
        elif band in self.responsive_layouts:
            self.responsive_layouts = {k: v for k, v in self.responsive_layouts.items() if k != band}

    def _handle_msg(self, msg):
        action = msg.get("action")
        if action == "update_responsive_layout":
            band = msg.get("band")
            layout = msg.get("layout")
            if band and layout is not None:
                layouts = dict(self.responsive_layouts)
                layouts[band] = layout
                self.responsive_layouts = layouts
            return
        if action == "delete_responsive_layout":
            self.reset_responsive_layout(msg.get("band"))
            return
        index = msg.get("index")
        if index is None or index < 0 or index >= len(self.objects):
            return
        if action == "remove":
            self.pop(index)


__all__ = ["TileGrid"]
