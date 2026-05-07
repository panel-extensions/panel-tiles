import pytest

pytest.importorskip("playwright")

from playwright.sync_api import expect

from panel import Spacer
from panel.pane import Markdown
from panel.tests.util import serve_component, wait_until

from panel_tiles import TileGrid

pytestmark = pytest.mark.ui


def test_grid_no_console_errors(page):
    grid = TileGrid(
        objects=[Markdown("Initial")],
        editable=False,
        local_save=False,
    )

    msgs, _ = serve_component(page, grid)

    expect(page.locator(".markdown").locator("div")).to_have_text("Initial\n")
    assert [msg for msg in msgs if msg.type == "error"] == []


def test_grid_renders_children_and_handles(page):
    grid = TileGrid(
        objects=[
            Spacer(styles={"background": "red"}, width=300, height=100),
            Spacer(styles={"background": "green"}, width=300, height=100),
            Spacer(styles={"background": "blue"}, width=300, height=100),
        ],
        editable=False,
        local_save=False,
        width=900,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    drags = page.locator(".muuri-handle.drag")
    resizes = page.locator(".muuri-handle.resize")

    expect(items).to_have_count(3)
    expect(drags).to_have_count(3)
    expect(resizes).to_have_count(3)


def test_grid_initial_layout_applies_sizes(page):
    grid = TileGrid(
        objects=[
            Markdown("1"),
            Markdown("2"),
        ],
        initial_layout=[
            {"index": 0, "width": 35, "height": 90, "visible": True},
            {"index": 1, "width": 65, "height": 140, "visible": True},
        ],
        editable=False,
        local_save=False,
        width=600,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)
    wait_until(lambda: items.nth(0).evaluate("el => el.style.width") == "calc(35% - 20px)", page)
    wait_until(lambda: items.nth(1).evaluate("el => el.style.width") == "calc(65% - 20px)", page)
    assert items.nth(0).evaluate("el => el.style.height") == "90px"
    assert items.nth(1).evaluate("el => el.style.height") == "140px"


def test_grid_layout_parameter_updates_item_sizes(page):
    grid = TileGrid(
        objects=[
            Spacer(styles={"background": "red"}, width=300, height=120),
            Spacer(styles={"background": "green"}, width=300, height=120),
        ],
        editable=False,
        local_save=False,
        width=600,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)

    grid.layout = [
        {"index": 0, "width": 70, "height": 180, "visible": True},
        {"index": 1, "width": 30, "height": 80, "visible": True},
    ]

    wait_until(
        lambda: items.nth(0).evaluate("el => el.style.width") == "calc(70% - 20px)",
        page,
    )
    wait_until(
        lambda: items.nth(1).evaluate("el => el.style.width") == "calc(30% - 20px)",
        page,
    )

    assert items.nth(0).evaluate("el => el.style.height") == "180px"
    assert items.nth(1).evaluate("el => el.style.height") == "80px"


def test_grid_editable_initial_layout_applies_sizes(page):
    grid = TileGrid(
        objects=[Markdown("1"), Markdown("2")],
        editable=True,
        local_save=False,
        width=700,
        initial_layout=[
            {"index": 0, "width": 40, "height": 110, "visible": True},
            {"index": 1, "width": 60, "height": 160, "visible": True},
        ],
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)
    wait_until(lambda: items.nth(0).evaluate("el => el.style.width") == "calc(40% - 20px)", page)
    wait_until(lambda: items.nth(1).evaluate("el => el.style.width") == "calc(60% - 20px)", page)
    assert items.nth(0).evaluate("el => el.style.height") == "110px"
    assert items.nth(1).evaluate("el => el.style.height") == "160px"


def test_grid_preserves_object_order(page):
    grid = TileGrid(
        objects=[Markdown("1"), Markdown("2")],
        editable=False,
        local_save=False,
        width=700,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)
    first = items.nth(0).bounding_box()
    second = items.nth(1).bounding_box()
    assert first is not None
    assert second is not None
    assert first["y"] <= second["y"]
