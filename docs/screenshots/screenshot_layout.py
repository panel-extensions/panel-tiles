"""Screenshot: tile grid with explicit layout (one full-width, two half-width)."""

import panel as pn
from panel.tests.util import serve_component
from playwright.sync_api import expect, sync_playwright

from panel_tiles import TileGrid

pn.extension()

grid = TileGrid(
    objects=[
        pn.pane.Markdown("# Wide Tile\n\nSpans the full width."),
        pn.pane.Markdown("# Left Tile\n\n50% width."),
        pn.pane.Markdown("# Right Tile\n\n50% width."),
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
    page.screenshot(path="docs/screenshots/layout_grid.png")
    browser.close()

print("Saved: docs/screenshots/layout_grid.png")
