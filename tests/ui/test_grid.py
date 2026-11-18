import re

import pytest

pytest.importorskip("playwright")

from bokeh.models import Div
from panel import Column, Spacer
from panel.custom import JSComponent
from panel.pane import Bokeh, Markdown
from panel.tests.util import serve_component, wait_until
from panel.widgets import TextInput
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


# Makes the initial render of a Bokeh Div with the "broken" class throw.
BREAK_DIV_RERENDER = """
const timer = setInterval(() => {
  let DivView
  try {
    DivView = window.Bokeh.Models.get("Div").prototype.default_view
  } catch {
    return
  }
  clearInterval(timer)
  const rerender = DivView.prototype.rerender
  DivView.prototype.rerender = function() {
    if (this.model.css_classes.includes("broken")) {
      throw new Error("broken tile")
    }
    return rerender.call(this)
  }
}, 1)
"""


def test_grid_shows_other_tiles_when_one_fails_to_render(page):
    page.add_init_script(BREAK_DIV_RERENDER)
    grid = TileGrid(
        objects=[Bokeh(Div(text="Broken", css_classes=["broken"])), Markdown("Fine")],
        editable=False,
        local_save=False,
        width=600,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)
    expect(page.locator(".markdown").locator("div")).to_have_text("Fine\n")
    wait_until(lambda: items.evaluate_all("(els) => els.map((el) => el.style.opacity)") == ["", ""], page)


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
        responsive_mode="scale",
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


def test_grid_min_col_width_wraps_narrow_tiles(page):
    layout = [
        {"index": 0, "width": 25, "height": 80, "visible": True},
        {"index": 1, "width": 25, "height": 80, "visible": True},
    ]
    grid = TileGrid(
        objects=[
            Spacer(styles={"background": "red"}, width=100, height=80),
            Spacer(styles={"background": "green"}, width=100, height=80),
        ],
        layout=layout,
        editable=False,
        local_save=False,
        min_col_width=300,
        width=400,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)

    # 100px tiles are below min_col_width, so each wraps onto its own line.
    for i in range(2):
        wait_until(lambda i=i: items.nth(i).evaluate("el => el.getAttribute('data-width')") == "100", page)
    assert items.nth(1).bounding_box()["y"] > items.nth(0).bounding_box()["y"]
    assert grid.layout == layout


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
        responsive_mode="scale",
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
        responsive_mode="scale",
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


SNAP_LAYOUT = [
    {"index": 0, "width": 66.6667, "height": 120, "visible": True},
    {"index": 1, "width": 33.3333, "height": 200, "visible": True},
    {"index": 2, "width": 30, "height": 120, "visible": True},
    {"index": 3, "width": 30, "height": 120, "visible": True},
]


def serve_snap_grid(page, padding="0.6px", layout_mode="masonry"):
    grid = TileGrid(
        objects=[Markdown(name) for name in ("Activity", "Map", "Tuning", "Weights")],
        layout=SNAP_LAYOUT,
        layout_mode=layout_mode,
        card=False,
        local_save=False,
        sizing_mode="stretch_width",
    )
    # Padding gives the grid a fractional width, as sidebars or browser zoom do.
    serve_component(page, Column(grid, sizing_mode="stretch_width", margin=0, styles={"padding-right": padding}))
    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(4)
    wait_until(lambda: items.nth(1).evaluate("el => el.style.height") == "200px", page)
    return grid, items


def settled_box(page, locator):
    boxes = [None]

    def stable():
        box = locator.bounding_box()
        same = box is not None and box == boxes[0]
        boxes[0] = box
        page.wait_for_timeout(100)
        return same

    wait_until(stable, page)
    return boxes[0]


def drag_handle(page, item, dx, dy):
    box = settled_box(page, item.locator(".muuri-handle.resize"))
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + dx, y + dy, steps=10)
    page.mouse.up()


@pytest.mark.parametrize("layout_mode", ["masonry", "rows"])
def test_grid_resize_snapped_to_neighbour_edge_stays_on_row(page, layout_mode):
    grid, items = serve_snap_grid(page, layout_mode=layout_mode)
    container_width = page.locator(".muuri-grid").evaluate("el => el.getBoundingClientRect().width")
    assert container_width != round(container_width)

    activity, weights = settled_box(page, items.nth(0)), settled_box(page, items.nth(3))
    activity_right = activity["x"] + activity["width"]
    drag_handle(page, items.nth(3), activity_right - (weights["x"] + weights["width"]) + 15, 0)

    wait_until(lambda: grid.layout[3]["width"] != 30, page)
    after = settled_box(page, items.nth(3))
    assert after["y"] == weights["y"]
    assert after["x"] == weights["x"]
    assert abs(after["x"] + after["width"] - activity_right) < 0.5
    assert grid.layout[2]["width"] + grid.layout[3]["width"] < SNAP_LAYOUT[0]["width"]


@pytest.mark.parametrize("layout_mode", ["masonry", "rows"])
def test_grid_resize_snaps_flush_to_container_edge(page, layout_mode):
    grid, items = serve_snap_grid(page, layout_mode=layout_mode)
    grid.layout = [{**spec, "height": 120} for spec in SNAP_LAYOUT]
    wait_until(lambda: items.nth(1).evaluate("el => el.style.height") == "120px", page)

    map_box, weights = settled_box(page, items.nth(1)), settled_box(page, items.nth(3))
    map_right = map_box["x"] + map_box["width"]
    drag_handle(page, items.nth(3), map_right - (weights["x"] + weights["width"]) - 20, 0)

    wait_until(lambda: grid.layout[3]["width"] > 60, page)
    after = settled_box(page, items.nth(3))
    assert after["y"] == weights["y"]
    assert abs(after["x"] + after["width"] - map_right) < 0.5


@pytest.mark.parametrize("layout_mode", ["masonry", "rows"])
def test_grid_height_only_resize_keeps_width(page, layout_mode):
    grid, items = serve_snap_grid(page, padding="0px", layout_mode=layout_mode)
    before = settled_box(page, items.nth(2))

    drag_handle(page, items.nth(2), 0, 80)

    wait_until(lambda: grid.layout[2]["height"] != 120, page)
    after = settled_box(page, items.nth(2))
    assert grid.layout[2]["width"] == 30
    assert after["width"] == before["width"]
    assert after["height"] == pytest.approx(before["height"] + 80, abs=1)


ROW_LAYOUT = [
    {"index": 0, "width": 30, "height": 120, "visible": True},
    {"index": 1, "width": 30, "height": 120, "visible": True},
    {"index": 2, "width": 25, "height": 120, "visible": True},
]


def serve_row_grid(page, **kwargs):
    grid = TileGrid(
        objects=[Markdown(name) for name in ("Map", "Weights", "Tuning")],
        layout=ROW_LAYOUT,
        local_save=False,
        width=1000,
        **kwargs,
    )
    serve_component(page, grid)
    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(3)
    wait_until(lambda: items.nth(2).evaluate("el => el.style.height") == "120px", page)
    return grid, items


def drag_past_row_end(page, items, overshoot):
    """Press the Weights handle and drag it `overshoot` px past where the row would be full."""
    grid_box = settled_box(page, page.locator(".muuri-grid"))
    tuning = settled_box(page, items.nth(2))
    spare = grid_box["x"] + grid_box["width"] - 10 - (tuning["x"] + tuning["width"])
    handle = settled_box(page, items.nth(1).locator(".muuri-handle.resize"))
    x, y = handle["x"] + handle["width"] / 2, handle["y"] + handle["height"] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + spare + overshoot, y, steps=10)
    return tuning


@pytest.mark.parametrize("layout_mode", ["masonry", "rows"])
def test_grid_resize_slightly_past_row_end_fills_it(page, layout_mode):
    grid, items = serve_row_grid(page, layout_mode=layout_mode)
    tuning = drag_past_row_end(page, items, 30)

    grid_el = page.locator(".muuri-grid")
    expect(grid_el).to_have_attribute("data-resize-state", "fill")
    expect(items.nth(1)).to_have_attribute("data-resize-state", "fill")
    expect(page.locator(".muuri-row-marker")).to_have_count(1)
    expect(page.locator(".muuri-will-move")).to_have_count(0)
    page.mouse.up()

    wait_until(lambda: grid.layout[1]["width"] != 30, page)
    expect(grid_el).not_to_have_attribute("data-resize-state", "fill")
    expect(page.locator(".muuri-row-marker")).to_have_count(0)
    after = settled_box(page, items.nth(2))
    grid_box = grid_el.bounding_box()
    assert after["y"] == tuning["y"]
    assert abs(after["x"] + after["width"] + 10 - (grid_box["x"] + grid_box["width"])) < 0.5
    assert 44.9 < grid.layout[1]["width"] < 45


@pytest.mark.parametrize("layout_mode", ["masonry", "rows"])
def test_grid_resize_well_past_row_end_reflows(page, layout_mode):
    grid, items = serve_row_grid(page, layout_mode=layout_mode)
    tuning = drag_past_row_end(page, items, 160)

    expect(page.locator(".muuri-grid")).to_have_attribute("data-resize-state", "overflow")
    expect(items.nth(1)).to_have_attribute("data-resize-state", "overflow")
    expect(items.nth(2)).to_have_class(re.compile("muuri-will-move"))
    expect(page.locator(".muuri-resize-ghost")).to_be_visible()
    # Nothing reflows until release.
    assert settled_box(page, items.nth(2))["y"] == tuning["y"]
    page.mouse.up()

    wait_until(lambda: grid.layout[1]["width"] > 50, page)
    expect(page.locator(".muuri-will-move")).to_have_count(0)
    assert settled_box(page, items.nth(2))["y"] > tuning["y"] + 100


@pytest.mark.parametrize("layout_mode", ["masonry", "rows"])
def test_grid_resize_without_overflow_tolerance_reflows_at_row_end(page, layout_mode):
    grid, items = serve_row_grid(page, overflow_tolerance=0, layout_mode=layout_mode)
    drag_past_row_end(page, items, 30)

    expect(page.locator(".muuri-grid")).to_have_attribute("data-resize-state", "overflow")
    page.mouse.up()
    wait_until(lambda: grid.layout[1]["width"] > 45, page)


def test_grid_resize_past_end_of_full_row_shows_fill(page):
    grid = TileGrid(
        objects=[Markdown("A"), Markdown("B")],
        layout=[
            {"index": 0, "width": 50, "height": 120, "visible": True},
            {"index": 1, "width": 50, "height": 120, "visible": True},
        ],
        local_save=False,
        width=800,
    )
    serve_component(page, grid)
    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)
    before = settled_box(page, items.nth(1))

    box = settled_box(page, items.nth(0).locator(".muuri-handle.resize"))
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + 30, y, steps=10)

    expect(page.locator(".muuri-grid")).to_have_attribute("data-resize-state", "fill")
    expect(items.nth(0)).to_have_attribute("data-resize-state", "fill")
    expect(page.locator(".muuri-row-marker")).to_have_count(1)
    page.mouse.up()

    expect(page.locator(".muuri-row-marker")).to_have_count(0)
    assert items.nth(0).get_attribute("data-width") == "50"
    assert settled_box(page, items.nth(1)) == before


STACKED_LAYOUT = [
    {"index": 0, "width": 30, "height": 300, "visible": True},
    {"index": 1, "width": 30, "height": 120, "visible": True},
    {"index": 2, "width": 30, "height": 120, "visible": True},
    {"index": 3, "width": 30, "height": 120, "visible": True},
]


def serve_stacked_grid(page, layout_mode="masonry"):
    """A tall Map with Weights and Tuning beside it and Series below Weights."""
    grid = TileGrid(
        objects=[Markdown(name) for name in ("Map", "Weights", "Tuning", "Series")],
        layout=STACKED_LAYOUT,
        layout_mode=layout_mode,
        local_save=False,
        width=1000,
    )
    serve_component(page, grid)
    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(4)
    wait_until(lambda: items.nth(0).evaluate("el => el.style.height") == "300px", page)
    return grid, items


def drag_stacked_past_row_end(page, items, overshoot):
    grid_box = settled_box(page, page.locator(".muuri-grid"))
    tuning = settled_box(page, items.nth(2))
    spare = grid_box["x"] + grid_box["width"] - 10 - (tuning["x"] + tuning["width"])
    handle = settled_box(page, items.nth(0).locator(".muuri-handle.resize"))
    x, y = handle["x"] + handle["width"] / 2, handle["y"] + handle["height"] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + spare + overshoot, y, steps=10)


@pytest.mark.parametrize("layout_mode", ["masonry", "rows"])
def test_grid_resize_beside_stacked_tiles_fills_row(page, layout_mode):
    grid, items = serve_stacked_grid(page, layout_mode=layout_mode)
    before = [settled_box(page, items.nth(i)) for i in range(4)]
    drag_stacked_past_row_end(page, items, 30)

    expect(page.locator(".muuri-grid")).to_have_attribute("data-resize-state", "fill")
    expect(items.nth(0)).to_have_attribute("data-resize-state", "fill")
    expect(page.locator(".muuri-row-marker")).to_have_count(1)
    expect(page.locator(".muuri-will-move")).to_have_count(0)
    page.mouse.up()

    wait_until(lambda: grid.layout[0]["width"] != 30, page)
    after = [settled_box(page, items.nth(i)) for i in range(4)]
    assert [box["y"] for box in after] == [box["y"] for box in before]
    assert after[3]["x"] == after[1]["x"]


@pytest.mark.parametrize("layout_mode", ["masonry", "rows"])
def test_grid_resize_beside_stacked_tiles_shows_overflow(page, layout_mode):
    grid, items = serve_stacked_grid(page, layout_mode=layout_mode)
    drag_stacked_past_row_end(page, items, 160)

    expect(page.locator(".muuri-grid")).to_have_attribute("data-resize-state", "overflow")
    expect(items.nth(0)).to_have_attribute("data-resize-state", "overflow")
    expect(page.locator(".muuri-resize-ghost")).to_be_visible()
    expect(items.nth(2)).to_have_class(re.compile("muuri-will-move"))
    expect(items.nth(3)).to_have_class(re.compile("muuri-will-move"))
    expect(items.nth(1)).not_to_have_class(re.compile("muuri-will-move"))
    page.mouse.up()
    wait_until(lambda: grid.layout[0]["width"] > 40, page)


EDIT_STATE = """grid => [...grid.querySelectorAll(":scope > .muuri-grid-item")].map(el => ({
  outline: getComputedStyle(el).outlineStyle,
  resizeState: el.dataset.resizeState ?? null,
  willMove: el.classList.contains("muuri-will-move"),
}))"""


def assert_no_edit_state(page):
    grid_el = page.locator(".muuri-grid")
    expect(grid_el).not_to_have_attribute("data-resize-state", re.compile(".*"))
    expect(page.locator(".muuri-resize-ghost")).to_have_count(0)
    expect(page.locator(".muuri-row-marker")).to_have_count(0)
    for item in grid_el.evaluate(EDIT_STATE):
        assert item == {"outline": "none", "resizeState": None, "willMove": False}


def cancel_pointer(page):
    page.locator(".muuri-grid").evaluate("() => document.dispatchEvent(new PointerEvent('pointercancel', {pointerId: 1, pointerType: 'mouse', bubbles: true}))")


@pytest.mark.parametrize("overshoot", [30, 160], ids=["fill", "overflow"])
@pytest.mark.parametrize("end", ["cancel", "hold"])
def test_grid_leaving_edit_mode_clears_resize_feedback(page, end, overshoot):
    grid, items = serve_row_grid(page)
    drag_past_row_end(page, items, overshoot)
    expect(page.locator(".muuri-grid")).to_have_attribute("data-resize-state", "fill" if overshoot == 30 else "overflow")

    if end == "cancel":
        cancel_pointer(page)
    grid.editable = False

    expect(page.locator(".muuri-grid")).to_have_class(re.compile("muuri-no-handles"))
    assert grid.selected == 1
    assert_no_edit_state(page)
    page.mouse.up()
    assert_no_edit_state(page)


def test_grid_resizes_in_each_of_two_grids(page):
    grids = [
        TileGrid(objects=[Markdown(name) for name in ("Map", "Weights", "Tuning")], layout=ROW_LAYOUT, local_save=False, width=1000, height=200) for _ in range(2)
    ]
    msgs, _ = serve_component(page, Column(*grids))
    for grid, grid_el in zip(grids, page.locator(".muuri-grid").all(), strict=False):
        items = grid_el.locator(":scope > .muuri-grid-item")
        expect(items).to_have_count(3)
        wait_until(lambda items=items: items.nth(2).evaluate("el => el.style.height") == "120px", page)
        drag_handle(page, items.nth(0), 0, 100)
        wait_until(lambda grid=grid: grid.layout[0]["height"] > 180, page)
    assert [msg for msg in msgs if msg.type == "error"] == []


def test_grid_tile_padding_variable(page):
    grid = TileGrid(objects=[Markdown("A")], local_save=False, width=400, stylesheets=[":host { --tile-padding: 12px; }"])
    serve_component(page, grid)

    expect(page.locator(".muuri-grid-item")).to_have_css("padding", "12px")


def item_boxes(page, items):
    page.wait_for_timeout(500)
    return [settled_box(page, items.nth(i)) for i in range(items.count())]


def assert_laid_out_without_overlap(boxes):
    for box in boxes:
        assert box["width"] > 20 and box["height"] > 20
    for i, a in enumerate(boxes):
        for b in boxes[i + 1 :]:
            apart_x = a["x"] + a["width"] <= b["x"] or b["x"] + b["width"] <= a["x"]
            apart_y = a["y"] + a["height"] <= b["y"] or b["y"] + b["height"] <= a["y"]
            assert apart_x or apart_y, f"{a} overlaps {b}"


def test_grid_created_hidden_lays_out_when_shown(page):
    grid = TileGrid(
        objects=[Markdown(f"Tile {i}") for i in range(3)],
        local_save=False,
        visible=False,
        width=600,
    )
    serve_component(page, grid)
    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(3)
    page.wait_for_timeout(500)

    grid.visible = True

    expect(items.nth(2)).to_be_visible()
    assert_laid_out_without_overlap(item_boxes(page, items))


def test_grid_items_added_while_parent_hidden_lay_out_when_shown(page):
    grid = TileGrid(objects=[Markdown("Tile 0")], local_save=False, width=600)
    parent = Column(grid)
    serve_component(page, parent)
    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(1)
    settled_box(page, items.nth(0))

    parent.visible = False
    grid.objects = [Markdown(f"Tile {i}") for i in range(3)]
    expect(items).to_have_count(3)
    page.wait_for_timeout(500)
    parent.visible = True

    expect(items.nth(2)).to_be_visible()
    assert_laid_out_without_overlap(item_boxes(page, items))


def stretching_tile():
    """Content that fills its tile, so it collapses if the tile has no height."""
    body = Column(TextInput(value="Text", sizing_mode="stretch_width"), sizing_mode="stretch_both")
    return Column(body, sizing_mode="stretch_both")


def test_grid_entry_without_height_keeps_content_height(page):
    grid = TileGrid(
        objects=[stretching_tile(), Markdown("Explicit")],
        layout=[{}, {"width": 50, "height": 200}],
        editable=False,
        local_save=False,
        width=600,
    )
    serve_component(page, grid)
    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)

    first, second = item_boxes(page, items)
    assert first["height"] >= 50
    assert second["height"] == 200
    assert_laid_out_without_overlap([first, second])


def test_grid_layout_without_height_after_explicit_height_keeps_content_height(page):
    grid = TileGrid(
        objects=[stretching_tile(), Markdown("Explicit")],
        layout=[{"width": 50, "height": 150}, {"width": 50, "height": 200}],
        editable=False,
        local_save=False,
        width=600,
    )
    serve_component(page, grid)
    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)
    wait_until(lambda: item_boxes(page, items)[0]["height"] == 150, page)

    grid.layout = [{"width": 50}, {"width": 50, "height": 100}]
    wait_until(lambda: item_boxes(page, items)[1]["height"] == 100, page)
    first, second = item_boxes(page, items)
    assert first["height"] >= 50
    assert_laid_out_without_overlap([first, second])


class DelayedContent(JSComponent):
    """Renders its content asynchronously and reports it through its ready promise, like a React component."""

    _esm = """
    export function render({view, el}) {
      view._await_ready(new Promise(resolve => setTimeout(() => {
        const div = document.createElement("div")
        div.style.height = "100px"
        el.append(div)
        resolve()
      }, 100)))
    }
    """


def test_grid_items_added_later_are_sized_from_rendered_content(page):
    grid = TileGrid(objects=[], editable=False, local_save=False, width=600)
    serve_component(page, grid)
    page.wait_for_timeout(500)

    grid.objects = [DelayedContent()]
    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(1)

    (box,) = item_boxes(page, items)
    assert box["height"] >= 100


class StalledView(JSComponent):
    """Stands in for any view elsewhere on the page whose ready promise never settles."""

    _esm = """
    export function render({view}) {
      view._await_ready(new Promise(() => {}))
    }
    """


def test_grid_renders_when_another_view_never_finishes(page):
    grid = TileGrid(
        objects=[Markdown(f"Tile {i}") for i in range(2)],
        local_save=False,
        width=600,
    )
    serve_component(page, Column(StalledView(), grid))

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)
    expect(items.nth(1)).to_be_visible()
    wait_until(lambda: items.nth(1).evaluate("el => getComputedStyle(el).opacity") == "1", page)


# Counts the renders of each Bokeh Div by its text.
COUNT_DIV_RENDERS = """
window.divRenders = {}
const timer = setInterval(() => {
  let DivView
  try {
    DivView = window.Bokeh.Models.get("Div").prototype.default_view
  } catch {
    return
  }
  clearInterval(timer)
  const render = DivView.prototype.render
  DivView.prototype.render = function() {
    window.divRenders[this.model.text] = (window.divRenders[this.model.text] || 0) + 1
    return render.call(this)
  }
}, 1)
"""


@pytest.mark.parametrize("close_action", [None, "remove"])
def test_grid_remove_item_keeps_other_items_rendered(page, close_action):
    page.add_init_script(COUNT_DIV_RENDERS)
    grid = TileGrid(
        objects=[Bokeh(Div(text=f"Tile {i}")) for i in range(3)],
        local_save=False,
        close_action=close_action,
        width=600,
    )
    serve_component(page, grid)
    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(3)
    expect(items.nth(2)).to_be_visible()
    settled_box(page, items.nth(2))
    renders = page.evaluate("window.divRenders")
    assert renders == {"Tile 0": 1, "Tile 1": 1, "Tile 2": 1}
    items.evaluate_all("""(els) => {
      for (const el of els) {
        el._marked = true
        el.lastElementChild.firstChild._marked = true
      }
    }""")

    if close_action:
        items.nth(1).locator(".muuri-handle.close").click()
    else:
        grid.objects = [grid.objects[0], grid.objects[2]]

    expect(items).to_have_count(2)
    page.wait_for_timeout(500)
    assert page.evaluate("window.divRenders") == renders
    assert items.evaluate_all("(els) => els.map((el) => el._marked === true)") == [True, True]
    assert items.evaluate_all("(els) => els.map((el) => el.lastElementChild.firstChild._marked === true)") == [True, True]
    expect(items.nth(0)).to_contain_text("Tile 0")
    expect(items.nth(1)).to_contain_text("Tile 2")
    assert_laid_out_without_overlap(item_boxes(page, items))


# Narrows the Column around the grid from CSS alone, as a sidebar opening or
# closing does, without Bokeh laying anything out.
SET_PARENT_PADDING = """([grid, padding]) => {
  grid.getRootNode().host.getRootNode().host.style.paddingRight = `${padding}px`
}"""


@pytest.mark.parametrize("transition", [False, True], ids=["instant", "transition"])
def test_grid_reflows_when_container_width_changes(page, transition):
    grid = TileGrid(
        objects=[Markdown(f"Tile {i}") for i in range(3)],
        layout=[{"index": i, "width": 33, "height": 120, "visible": True} for i in range(3)],
        # Below every width used here, so the resolved layout itself never changes.
        reference_width=500,
        local_save=False,
        sizing_mode="stretch_width",
    )
    stylesheets = [":host { transition: padding-right 300ms ease; }"] if transition else []
    serve_component(page, Column(grid, sizing_mode="stretch_width", margin=0, stylesheets=stylesheets))
    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(3)
    settled_box(page, items.nth(2))
    grid_el = page.locator(".muuri-grid")
    full = settled_box(page, grid_el)["width"]

    for padding in (500, 100):
        page.evaluate(SET_PARENT_PADDING, [grid_el.element_handle(), padding])
        wait_until(lambda target=full - padding: abs(settled_box(page, grid_el)["width"] - target) < 1, page)
        boxes = item_boxes(page, items)
        assert_laid_out_without_overlap(boxes)
        assert len({box["y"] for box in boxes}) == 1
        # Each tile starts one margin (2 x 10px) after the one before it and the row ends inside the grid.
        for before, after in zip(boxes, boxes[1:], strict=False):
            assert abs(after["x"] - before["x"] - before["width"] - 20) < 1
        grid_box = grid_el.bounding_box()
        free = grid_box["x"] + grid_box["width"] - (boxes[2]["x"] + boxes[2]["width"])
        assert 0 <= free < 0.01 * grid_box["width"] + 15, f"tiles leave {free}px free at width {grid_box['width']}"


def test_grid_close_hide_commits_hidden_tile(page):
    grid = TileGrid(
        objects=[Markdown(f"Tile {i}") for i in range(3)],
        layout=[{"index": i, "width": 30, "height": 120, "visible": True} for i in range(3)],
        close_action="hide",
        local_save=False,
        width=1000,
    )
    serve_component(page, grid)
    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(3)
    settled_box(page, items.nth(2))

    items.nth(1).locator(".muuri-handle.close").click()

    wait_until(lambda: [spec["visible"] for spec in grid.layout] == [True, False, True], page)
