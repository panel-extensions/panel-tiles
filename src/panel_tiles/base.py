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

    close_action = param.Selector(default=None, objects=[None, "hide", "remove"])

    editable = param.Boolean(default=True)

    elevation = param.Integer(default=3, bounds=(0, 20))

    fill_gaps = param.Boolean(default=True)

    layout = param.List(default=[])

    local_save = param.Boolean(default=False)

    name = param.String(default="")

    objects = Children(doc="Items in the grid.")

    _bundle = DIST_PATH / "panel-tiles.bundle.js"
    _esm = BASE_PATH / "models" / "grid.js"
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

    def _handle_msg(self, msg):
        action = msg.get("action")
        index = msg.get("index")
        if index is None or index < 0 or index >= len(self.objects):
            return
        if action == "remove":
            self.pop(index)


__all__ = ["TileGrid"]
