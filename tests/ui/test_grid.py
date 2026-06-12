import pytest

pytest.importorskip("playwright")

from panel import Spacer
from panel.pane import Markdown
from panel.tests.util import serve_component, wait_until
from playwright.sync_api import expect

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


def test_grid_layout_applies_sizes(page):
    grid = TileGrid(
        objects=[
            Markdown("1"),
            Markdown("2"),
        ],
        layout=[
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


def test_grid_editable_layout_applies_sizes(page):
    grid = TileGrid(
        objects=[Markdown("1"), Markdown("2")],
        editable=True,
        local_save=False,
        width=700,
        layout=[
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


def test_grid_responsive_clamp_widens_narrow_tiles(page):
    grid = TileGrid(
        objects=[
            Spacer(styles={"background": "red"}, width=100, height=80),
            Spacer(styles={"background": "green"}, width=100, height=80),
        ],
        layout=[
            {"index": 0, "width": 25, "height": 80, "visible": True},
            {"index": 1, "width": 25, "height": 80, "visible": True},
        ],
        editable=False,
        local_save=False,
        min_col_width=300,
        width=400,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)

    # 25% of 400px = 100px < min_col_width (300px), so display should clamp to 75%
    wait_until(
        lambda: items.nth(0).evaluate("el => el.style.width") == "calc(75% - 20px)",
        page,
    )
    wait_until(
        lambda: items.nth(1).evaluate("el => el.style.width") == "calc(75% - 20px)",
        page,
    )


def test_grid_responsive_clamp_preserves_authored_width(page):
    grid = TileGrid(
        objects=[
            Spacer(styles={"background": "red"}, width=100, height=80),
        ],
        layout=[
            {"index": 0, "width": 25, "height": 80, "visible": True},
        ],
        editable=False,
        local_save=False,
        min_col_width=300,
        width=400,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(1)

    # Display is clamped but data-width preserves the authored value
    wait_until(
        lambda: items.nth(0).evaluate("el => el.getAttribute('data-width')") == "25",
        page,
    )


def test_grid_no_clamp_when_wide_enough(page):
    grid = TileGrid(
        objects=[
            Spacer(styles={"background": "red"}, width=100, height=80),
        ],
        layout=[
            {"index": 0, "width": 50, "height": 80, "visible": True},
        ],
        editable=False,
        local_save=False,
        min_col_width=200,
        width=800,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(1)

    # 50% of 800px = 400px > min_col_width (200px), no clamping
    wait_until(
        lambda: items.nth(0).evaluate("el => el.style.width") == "calc(50% - 20px)",
        page,
    )


def test_grid_layout_order_preserved_after_update(page):
    grid = TileGrid(
        objects=[
            Spacer(styles={"background": "red"}, width=200, height=80),
            Spacer(styles={"background": "green"}, width=200, height=80),
            Spacer(styles={"background": "blue"}, width=200, height=80),
        ],
        editable=True,
        local_save=False,
        width=700,
        layout=[
            {"index": 2, "width": 33, "height": 80, "visible": True},
            {"index": 0, "width": 33, "height": 80, "visible": True},
            {"index": 1, "width": 33, "height": 80, "visible": True},
        ],
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(3)

    # Update layout with new sizes, keeping the order
    grid.layout = [
        {"index": 2, "width": 50, "height": 100, "visible": True},
        {"index": 0, "width": 50, "height": 100, "visible": True},
        {"index": 1, "width": 50, "height": 100, "visible": True},
    ]

    wait_until(
        lambda: items.nth(0).evaluate("el => el.getAttribute('data-width')") == "50",
        page,
    )
    wait_until(
        lambda: items.nth(1).evaluate("el => el.getAttribute('data-width')") == "50",
        page,
    )
    wait_until(
        lambda: items.nth(2).evaluate("el => el.getAttribute('data-width')") == "50",
        page,
    )


def test_grid_drag_reorder_updates_layout(page):
    grid = TileGrid(
        objects=[
            Spacer(styles={"background": "red"}, width=200, height=80),
            Spacer(styles={"background": "green"}, width=200, height=80),
            Spacer(styles={"background": "blue"}, width=200, height=80),
        ],
        editable=True,
        local_save=False,
        width=800,
        layout=[
            {"index": 0, "width": 100, "height": 80, "visible": True},
            {"index": 1, "width": 100, "height": 80, "visible": True},
            {"index": 2, "width": 100, "height": 80, "visible": True},
        ],
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(3)
    wait_until(lambda: items.nth(0).evaluate("el => el.style.height") == "80px", page)

    # Drag the first item below the second using raw mouse events
    # (drag_to fails because Muuri rearranges items mid-drag)
    first_handle = items.nth(0).locator(".muuri-handle.drag")
    handle_box = first_handle.bounding_box()
    second_box = items.nth(1).bounding_box()

    start_x = handle_box["x"] + handle_box["width"] / 2
    start_y = handle_box["y"] + handle_box["height"] / 2
    end_y = second_box["y"] + second_box["height"] + 20

    page.mouse.move(start_x, start_y)
    page.mouse.down()
    page.mouse.move(start_x, end_y, steps=10)
    page.mouse.up()

    # After the drag the layout should reflect new ordering
    # The first model object (red) should now have index > 0
    wait_until(lambda: len(grid.layout) == 3, page)
    wait_until(lambda: grid.layout[0]["index"] > 0, page)

    # Widths and heights should be preserved
    for spec in grid.layout:
        assert spec["width"] == 100
        assert spec["height"] == 80


def test_grid_respects_child_min_width(page):
    grid = TileGrid(
        objects=[
            Spacer(styles={"background": "red"}, min_width=400, height=80),
            Spacer(styles={"background": "green"}, height=80),
        ],
        layout=[
            {"index": 0, "width": 30, "height": 80, "visible": True},
            {"index": 1, "width": 30, "height": 80, "visible": True},
        ],
        editable=False,
        local_save=False,
        width=600,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)

    # First item: 30% of 600px = 180px < min_width 400px, clamped to ~66.7%
    wait_until(
        lambda: "66.6" in items.nth(0).evaluate("el => el.style.width"),
        page,
    )
    # data-width preserves the authored 30%
    wait_until(
        lambda: items.nth(0).evaluate("el => el.getAttribute('data-width')") == "30",
        page,
    )
    # Second item has no min_width so stays at 30%
    wait_until(
        lambda: items.nth(1).evaluate("el => el.style.width") == "calc(30% - 20px)",
        page,
    )


def test_grid_respects_child_max_width(page):
    grid = TileGrid(
        objects=[
            Spacer(styles={"background": "red"}, max_width=200, height=80),
            Spacer(styles={"background": "green"}, height=80),
        ],
        layout=[
            {"index": 0, "width": 60, "height": 80, "visible": True},
            {"index": 1, "width": 60, "height": 80, "visible": True},
        ],
        editable=False,
        local_save=False,
        width=800,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)

    # First item: 60% of 800px = 480px > max_width 200px, clamped to 25%
    wait_until(
        lambda: items.nth(0).evaluate("el => el.style.width") == "calc(25% - 20px)",
        page,
    )
    # data-width preserves the authored 60%
    wait_until(
        lambda: items.nth(0).evaluate("el => el.getAttribute('data-width')") == "60",
        page,
    )
    # Second item has no max_width so stays at 60%
    wait_until(
        lambda: items.nth(1).evaluate("el => el.style.width") == "calc(60% - 20px)",
        page,
    )


def test_grid_resize_clamped_by_min_max_width(page):
    grid = TileGrid(
        objects=[
            Spacer(styles={"background": "red"}, min_width=200, max_width=400, height=80),
        ],
        layout=[
            {"index": 0, "width": 50, "height": 80, "visible": True},
        ],
        editable=True,
        local_save=False,
        width=800,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(1)
    wait_until(lambda: items.nth(0).evaluate("el => el.style.height") == "80px", page)

    item = items.nth(0)
    resize_handle = item.locator(".muuri-handle.resize")

    # Try to resize beyond max_width (400px = 50% of 800px)
    # Start from the right edge of the item and drag further right
    handle_box = resize_handle.bounding_box()
    start_x = handle_box["x"] + handle_box["width"] / 2
    start_y = handle_box["y"] + handle_box["height"] / 2

    # Drag right to attempt 90% width (720px > max 400px)
    page.mouse.move(start_x, start_y)
    page.mouse.down()
    page.mouse.move(start_x + 320, start_y, steps=5)
    page.mouse.up()

    # Authored width should be clamped at 50% (400px / 800px)
    wait_until(lambda: len(grid.layout) == 1, page)
    wait_until(lambda: grid.layout[0]["width"] <= 50, page)

    # Now try to resize below min_width (200px = 25% of 800px)
    # Drag the handle far to the left
    handle_box = resize_handle.bounding_box()
    start_x = handle_box["x"] + handle_box["width"] / 2
    start_y = handle_box["y"] + handle_box["height"] / 2

    page.mouse.move(start_x, start_y)
    page.mouse.down()
    page.mouse.move(start_x - 400, start_y, steps=5)
    page.mouse.up()

    # Authored width should be clamped at 25% (200px / 800px)
    wait_until(lambda: grid.layout[0]["width"] >= 25, page)
