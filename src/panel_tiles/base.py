import hashlib
import os
from pathlib import Path
from typing import Literal

import param
from bokeh.embed.bundle import extension_dirs
from panel.config import config
from panel.custom import Children, JSComponent
from panel.io import state
from panel.layout.base import ListLike
from panel.util import classproperty

BASE_PATH = Path(__file__).parent
DIST_PATH = BASE_PATH / "dist"

extension_dirs["panel-tiles"] = DIST_PATH


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

    fill_gaps = param.Boolean(default=True)

    breakpoints = param.List(
        default=[],
        doc="""
        List of pixel-width thresholds that define responsive breakpoint
        bands, e.g. [768, 1200] yields three bands: xs (<768), sm (768-1200),
        md (>1200). When set, a toolbar appears in edit mode to preview each
        band and optionally author a custom layout for it.""",
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
            if config.autoreload:
                modified = hashlib.sha256(str(esm_path.stat().st_mtime).encode("utf-8")).hexdigest()
                esm += f"?{modified}"
        else:
            esm = esm_path.read_text(encoding="utf-8")
        return esm

    @classproperty
    def _bundle_path(cls) -> os.PathLike | None:
        return cls._bundle

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.local_save and not self.name:
            import warnings

            warnings.warn(
                "TileGrid has local_save=True but no name set. " "Provide a unique name to avoid collisions when " "multiple grids exist on the same page.",
                UserWarning,
                stacklevel=2,
            )

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
