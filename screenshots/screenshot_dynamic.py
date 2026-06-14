"""Screenshot: dynamic tile grid with add button and multiple tiles."""

import panel as pn
from panel.tests.util import serve_component
from playwright.sync_api import expect, sync_playwright

from panel_tiles import TileGrid

pn.extension()

grid = TileGrid(
    objects=[
        pn.pane.Markdown("# Tile 1\n\nFirst tile."),
        pn.pane.Markdown("# Tile 2\n\nSecond tile."),
        pn.pane.Markdown("# Tile 3\n\nThird tile."),
    ],
    close_action="remove",
    sizing_mode="stretch_width",
    height=500,
)

add_button = pn.widgets.Button(name="Add Tile", button_type="primary")
remove_button = pn.widgets.Button(name="Remove Last", button_type="danger")

layout = pn.Column(pn.Row(add_button, remove_button), grid)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1200, "height": 600})
    serve_component(page, layout)
    expect(page.locator(".muuri-grid-item")).to_have_count(3)
    page.wait_for_timeout(1000)
    page.screenshot(path="docs/screenshots/dynamic_tiles.png")
    browser.close()

print("Saved: docs/screenshots/dynamic_tiles.png")
