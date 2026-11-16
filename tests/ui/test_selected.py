import re

import pytest

pytest.importorskip("playwright")

from panel.pane import Markdown
from panel.tests.util import serve_component, wait_until
from playwright.sync_api import expect

from panel_tiles import TileGrid

pytestmark = pytest.mark.ui

SELECTED = re.compile(r"\bmuuri-selected\b")


def serve_grid(page, n=3, **kwargs):
    grid = TileGrid(
        objects=[Markdown(f"Tile {i}") for i in range(n)],
        layout=[{"index": i, "width": 30, "height": 120, "visible": True} for i in range(n)],
        local_save=False,
        width=1000,
        **kwargs,
    )
    serve_component(page, grid)
    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(n)
    wait_until(lambda: items.nth(n - 1).evaluate("el => el.style.height") == "120px", page)
    return grid, items


def handle_center(item, kind):
    box = item.locator(f".muuri-handle.{kind}").bounding_box()
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def test_selected_set_by_clicking_tile_content(page):
    grid, items = serve_grid(page)

    items.nth(1).locator(".markdown").click()

    wait_until(lambda: grid.selected == 1, page)
    expect(items.nth(1)).to_have_class(SELECTED)
    expect(page.locator(".muuri-selected")).to_have_count(1)


def test_selected_set_when_dragging_a_tile(page):
    grid, items = serve_grid(page)
    x, y = handle_center(items.nth(2), "drag")

    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x - 40, y + 10, steps=5)

    wait_until(lambda: grid.selected == 2, page)
    page.mouse.up()


def test_selected_set_when_resizing_a_tile(page):
    grid, items = serve_grid(page)
    x, y = handle_center(items.nth(0), "resize")

    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x, y + 30, steps=5)
    page.mouse.up()

    wait_until(lambda: grid.selected == 0, page)


def test_selected_from_python_highlights_tile(page):
    grid, items = serve_grid(page)

    grid.selected = 2
    expect(items.nth(2)).to_have_class(SELECTED)

    grid.selected = None
    expect(page.locator(".muuri-selected")).to_have_count(0)


def test_selected_follows_tile_when_earlier_tile_removed(page):
    grid, items = serve_grid(page)
    tile = grid.objects[2]
    items.nth(2).locator(".markdown").click()
    wait_until(lambda: grid.selected == 2, page)

    grid.pop(0)

    expect(items).to_have_count(2)
    assert grid.selected == 1
    assert grid.objects[1] is tile
    expect(items.nth(1)).to_have_class(SELECTED)
    expect(page.locator(".muuri-selected")).to_have_count(1)


def test_selected_cleared_only_when_its_own_tile_is_hidden(page):
    grid, items = serve_grid(page, close_action="hide")
    grid.selected = 0
    expect(items.nth(0)).to_have_class(SELECTED)

    items.nth(1).locator(".muuri-handle.close").click()
    wait_until(lambda: grid.layout and not grid.layout[1]["visible"], page)
    assert grid.selected == 0

    items.nth(0).locator(".muuri-handle.close").click()
    wait_until(lambda: grid.selected is None, page)
    expect(page.locator(".muuri-selected")).to_have_count(0)


def test_selected_cleared_when_its_tile_is_removed_by_close(page):
    grid, items = serve_grid(page, close_action="remove")
    grid.selected = 1
    expect(items.nth(1)).to_have_class(SELECTED)

    items.nth(1).locator(".muuri-handle.close").click()

    expect(items).to_have_count(2)
    wait_until(lambda: grid.selected is None, page)
    expect(page.locator(".muuri-selected")).to_have_count(0)
