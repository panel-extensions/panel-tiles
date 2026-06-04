# panel-tiles

[![CI](https://img.shields.io/github/actions/workflow/status/panel-extensions/panel-tiles/test.yml?style=flat-square&branch=main)](https://github.com/panel-extensions/panel-tiles/actions/workflows/test.yml)
[![pypi-version](https://img.shields.io/pypi/v/panel-tiles.svg?logo=pypi&logoColor=white&style=flat-square)](https://pypi.org/project/panel-tiles)
[![python-version](https://img.shields.io/pypi/pyversions/panel-tiles?logoColor=white&logo=python&style=flat-square)](https://pypi.org/project/panel-tiles)

A draggable, resizable grid layout for [Panel](https://panel.holoviz.org) applications (Muuri + interact.js).

![Dashboard example](https://github.com/panel-extensions/panel-tiles/raw/main/docs/screenshots/hero.png)

## Installation

```bash
pip install panel-tiles
```

## Quick Start

```python
from panel_tiles import TileGrid

...

grid = TileGrid(
    objects=[
        revenue_ind,
        growth_ind,
        users_ind,
        retention_ind,
        pn.pane.Bokeh(line_fig),
        pn.pane.Bokeh(bar_fig),
        table,
    ],
    layout=[
        {"width": 25, "height": 100, "visible": True},
        {"width": 25, "height": 100, "visible": True},
        {"width": 25, "height": 100, "visible": True},
        {"width": 25, "height": 100, "visible": True},
        {"width": 50, "height": 300, "visible": True},
        {"width": 50, "height": 300, "visible": True},
        {"width": 100, "height": 250, "visible": True},
    ],
    sizing_mode="stretch_width",
    height=750,
)

pmui.Page(main=[grid], title="panel-tiles").servable()
```

## Features

- Drag-and-drop tile reordering
- Resize tiles from the corner handle
- Configurable layout with percentage widths and pixel heights
- Close buttons with hide or remove behavior
- Persist user layouts to localStorage
- Read-only mode for fixed dashboards
- Dynamic add/remove of tiles at runtime

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
