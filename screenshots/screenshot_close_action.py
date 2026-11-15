"""Screenshot: tile grid with close buttons (hide mode)."""

import panel as pn
from panel.tests.util import serve_component
from playwright.sync_api import expect, sync_playwright

from panel_tiles import TileGrid

pn.extension()

grid = TileGrid(
    objects=[
        pn.pane.Markdown("# Tile A\n\nClick X to hide me."),
        pn.pane.Markdown("# Tile B\n\nI can be hidden too."),
        pn.pane.Markdown("# Tile C\n\nHidden tiles stay in objects."),
    ],
    close_action="hide",
    sizing_mode="stretch_width",
    height=400,
)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1200, "height": 600})
    serve_component(page, grid)
    expect(page.locator(".muuri-grid-item")).to_have_count(3)
    page.wait_for_timeout(1000)
    page.screenshot(path="docs/screenshots/close_action.png")
    browser.close()

print("Saved: docs/screenshots/close_action.png")
