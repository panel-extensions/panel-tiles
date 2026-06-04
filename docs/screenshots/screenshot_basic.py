"""Screenshot: basic tile grid with three markdown tiles."""

import panel as pn
from panel.tests.util import serve_component
from playwright.sync_api import expect, sync_playwright

from panel_tiles import TileGrid

pn.extension()

grid = TileGrid(
    objects=[
        pn.pane.Markdown("# Tile 1\n\nDrag me around!"),
        pn.pane.Markdown("# Tile 2\n\nResize from the corner."),
        pn.pane.Markdown("# Tile 3\n\nRearrange the grid."),
    ],
    sizing_mode="stretch_width",
    height=400,
)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1200, "height": 600})
    serve_component(page, grid)
    expect(page.locator(".muuri-grid-item")).to_have_count(3)
    page.wait_for_timeout(1000)
    page.screenshot(path="docs/screenshots/basic_grid.png")
    browser.close()

print("Saved: docs/screenshots/basic_grid.png")
