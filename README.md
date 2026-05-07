# panel-tiles

[![CI](https://img.shields.io/github/actions/workflow/status/panel-extensions/panel-tiles/test.yml?style=flat-square&branch=main)](https://github.com/panel-extensions/panel-tiles/actions/workflows/test.yml)
[![pypi-version](https://img.shields.io/pypi/v/panel-tiles.svg?logo=pypi&logoColor=white&style=flat-square)](https://pypi.org/project/panel-tiles)
[![python-version](https://img.shields.io/pypi/pyversions/panel-tiles?logoColor=white&logo=python&style=flat-square)](https://pypi.org/project/panel-tiles)

A draggable, resizable grid layout for [Panel](https://panel.holoviz.org) applications (Muuri + interact.js).

## Installation

```bash
pip install panel-tiles
```

## Quick start

```python
import panel as pn
from panel_tiles import TileGrid

pn.extension()

grid = TileGrid(
    objects=[
        pn.pane.Markdown("## Panel A"),
        pn.pane.Markdown("## Panel B"),
    ],
    editable=True,
    width=800,
)

grid.servable()
```

Use `pn.extension("panel-tiles")` (or `pn.extension()` after a normal install) so Panel loads the bundled JavaScript and styles.

## Features

- Drag-and-drop and resize tiles when `editable=True`
- Optional layout persistence (`local_save`)
- `initial_layout` and live `layout` updates from Python

## Development

Managed with [pixi](https://pixi.sh).

```bash
git clone https://github.com/panel-extensions/panel-tiles.git
cd panel-tiles

pixi run postinstall
pixi run compile
pixi run test
```

UI tests:

```bash
pixi run -e test-ui test-ui
```

## License

See LICENSE.
