"""Screenshot: read-only tile grid with fixed layout."""

import panel as pn
from panel.tests.util import serve_component
from playwright.sync_api import expect, sync_playwright

from panel_tiles import TileGrid

pn.extension()

grid = TileGrid(
    objects=[
        pn.pane.Markdown("# Welcome\n\nThis is a fixed layout grid."),
        pn.pane.Markdown("# Info\n\nTiles cannot be moved or resized."),
        pn.pane.Markdown("# Details\n\nSet editable=False to lock the grid."),
    ],
    layout=[
        {"width": 100, "height": 150, "visible": True},
        {"width": 50, "height": 200, "visible": True},
        {"width": 50, "height": 200, "visible": True},
    ],
    editable=False,
    sizing_mode="stretch_width",
    height=500,
)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1200, "height": 600})
    serve_component(page, grid)
    expect(page.locator(".muuri-grid-item")).to_have_count(3)
    page.wait_for_timeout(1000)
    page.screenshot(path="docs/screenshots/read_only.png")
    browser.close()

print("Saved: docs/screenshots/read_only.png")
