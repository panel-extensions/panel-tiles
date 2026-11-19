import re

import pytest

pytest.importorskip("playwright")

from panel.pane import Markdown
from panel.tests.util import serve_component, wait_until
from playwright.sync_api import expect

from panel_tiles import TileGrid

pytestmark = pytest.mark.ui

MARGIN = 10


def spec(width, height, index):
    return {"index": index, "width": width, "height": height, "visible": True}


def serve_grid(page, sizes, width=1000, **kwargs):
    grid = TileGrid(
        objects=[Markdown(f"Tile {i}") for i in range(len(sizes))],
        layout=[spec(w, h, i) for i, (w, h) in enumerate(sizes)],
        local_save=False,
        width=width,
        **kwargs,
    )
    serve_component(page, grid)
    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(len(sizes))
    last = sizes[-1][1]
    wait_until(lambda: items.nth(len(sizes) - 1).evaluate("el => el.style.height") == f"{last}px", page)
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


def boxes_of(page, items):
    page.wait_for_timeout(400)
    return [settled_box(page, items.nth(i)) for i in range(items.count())]


def press_drag_handle(page, item):
    handle = settled_box(page, item.locator(".muuri-handle.drag"))
    x, y = handle["x"] + handle["width"] / 2, handle["y"] + handle["height"] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    return x, y


def drag_tile_to(page, item, x, y, release=True):
    sx, sy = press_drag_handle(page, item)
    page.mouse.move(sx + 5, sy + 5, steps=2)
    page.mouse.move(x, y, steps=20)
    # Muuri sorts on a timer after the pointer stops.
    page.wait_for_timeout(300)
    page.mouse.move(x + 1, y + 1)
    page.wait_for_timeout(300)
    if release:
        page.mouse.up()


@pytest.mark.parametrize("layout_mode", ["masonry", "rows"])
def test_rows_never_backfill_earlier_rows(page, layout_mode):
    sizes = [(50, 100), (50, 300), (100, 100), (50, 100)]
    _, items = serve_grid(page, sizes, layout_mode=layout_mode)
    boxes = boxes_of(page, items)

    if layout_mode == "masonry":
        assert boxes[3]["y"] < boxes[2]["y"]
    else:
        assert boxes[2]["y"] == pytest.approx(boxes[1]["y"] + 300 + 2 * MARGIN, abs=1)
        assert boxes[3]["y"] == pytest.approx(boxes[2]["y"] + 100 + 2 * MARGIN, abs=1)
        assert boxes[3]["x"] == pytest.approx(boxes[0]["x"], abs=1)


def test_rows_align_tops_at_the_tallest_tile(page):
    sizes = [(30, 100), (30, 260), (30, 180), (40, 120), (40, 80)]
    _, items = serve_grid(page, sizes, layout_mode="rows")
    boxes = boxes_of(page, items)

    assert boxes[0]["y"] == boxes[1]["y"] == boxes[2]["y"]
    second = boxes[1]["y"] + 260 + 2 * MARGIN
    assert boxes[3]["y"] == pytest.approx(second, abs=1)
    assert boxes[4]["y"] == pytest.approx(second, abs=1)


def test_rows_stack_short_tiles_beside_a_tall_one(page):
    # Two stacked cards and their margins are exactly as tall as the chart.
    sizes = [(66.6667, 400), (33.3333, 190), (33.3333, 190), (100, 100)]
    _, items = serve_grid(page, sizes, layout_mode="rows")
    chart, kpi1, kpi2, table = boxes_of(page, items)

    assert kpi1["y"] == chart["y"]
    assert kpi2["x"] == pytest.approx(kpi1["x"], abs=0.5)
    assert kpi2["y"] == pytest.approx(kpi1["y"] + 190 + 2 * MARGIN, abs=1)
    assert table["y"] == pytest.approx(chart["y"] + 400 + 2 * MARGIN, abs=1)


def test_rows_layout_mode_can_change_at_runtime(page):
    sizes = [(50, 100), (50, 300), (100, 100), (50, 100)]
    grid, items = serve_grid(page, sizes)
    assert boxes_of(page, items)[3]["y"] < boxes_of(page, items)[2]["y"]

    grid.layout_mode = "rows"

    wait_until(lambda: settled_box(page, items.nth(3))["y"] > settled_box(page, items.nth(2))["y"], page)


def test_rows_drop_right_of_a_row_ends_that_row(page):
    sizes = [(30, 100), (30, 100), (100, 100), (30, 100)]
    grid, items = serve_grid(page, sizes, layout_mode="rows")
    boxes = boxes_of(page, items)
    grid_box = settled_box(page, page.locator(".muuri-grid"))

    drag_tile_to(page, items.nth(3), grid_box["x"] + grid_box["width"] * 0.85, boxes[0]["y"] + 50)

    wait_until(lambda: grid.layout[3]["index"] == 2, page)
    assert [s["index"] for s in grid.layout] == [0, 1, 3, 2]
    after = settled_box(page, items.nth(3))
    assert after["y"] == pytest.approx(boxes[0]["y"], abs=1)
    assert after["x"] == pytest.approx(boxes[1]["x"] + boxes[1]["width"] + 2 * MARGIN, abs=1)


def drag_through(page, item, points):
    sx, sy = press_drag_handle(page, item)
    page.mouse.move(sx + 5, sy + 5, steps=2)
    for x, y in points:
        page.mouse.move(x, y, steps=10)
        page.wait_for_timeout(300)
    page.mouse.up()


def test_rows_drop_before_and_after_tiles_by_their_midpoint(page):
    sizes = [(30, 100), (30, 100), (30, 100), (100, 100)]
    grid, items = serve_grid(page, sizes, layout_mode="rows")
    a, b, c, _ = boxes_of(page, items)
    y = a["y"] + 50

    # Past the right half of B and then C, so the first tile ends up last in the row.
    drag_through(page, items.nth(0), [(b["x"] + b["width"] * 0.75, y), (c["x"] + c["width"] * 0.75, y)])
    wait_until(lambda: [s["index"] for s in grid.layout] == [2, 0, 1, 3], page)

    # Onto the left half of the tile that now leads the row.
    a, b, c, _ = boxes_of(page, items)
    drag_through(page, items.nth(2), [(b["x"] + b["width"] * 0.25, y)])
    wait_until(lambda: [s["index"] for s in grid.layout] == [2, 1, 0, 3], page)


def test_rows_drop_below_every_tile_moves_to_the_end(page):
    sizes = [(30, 100), (30, 100), (30, 100), (100, 100)]
    grid, items = serve_grid(page, sizes, layout_mode="rows")
    boxes = boxes_of(page, items)

    drag_tile_to(page, items.nth(0), boxes[3]["x"] + 100, boxes[3]["y"] + boxes[3]["height"] + 60)

    wait_until(lambda: grid.layout[0]["index"] == 3, page)
    assert [s["index"] for s in grid.layout] == [3, 0, 1, 2]


@pytest.mark.parametrize("layout_mode", ["masonry", "rows"])
def test_drag_shows_placeholder_at_target_slot(page, layout_mode):
    sizes = [(30, 100), (30, 100), (30, 100), (100, 100)]
    _, items = serve_grid(page, sizes, layout_mode=layout_mode)
    boxes = boxes_of(page, items)

    drag_tile_to(page, items.nth(3), boxes[0]["x"] + 20, boxes[0]["y"] + 50, release=False)

    placeholder = page.locator(".muuri-drag-placeholder")
    expect(placeholder).to_have_count(1)
    expect(placeholder).to_be_visible()
    if layout_mode == "rows":
        box = settled_box(page, placeholder)
        # The full-width tile goes before the first one, so it takes the first row to itself.
        assert box["y"] == pytest.approx(boxes[0]["y"], abs=1)
        assert box["width"] == pytest.approx(boxes[3]["width"], abs=1)
    page.mouse.up()
    expect(placeholder).to_have_count(0)


@pytest.mark.parametrize("layout_mode", ["masonry", "rows"])
def test_drag_commits_layout_once(page, layout_mode):
    sizes = [(25, 100), (25, 100), (25, 100), (25, 100), (100, 100)]
    grid, items = serve_grid(page, sizes, layout_mode=layout_mode)
    boxes = boxes_of(page, items)
    commits = []
    grid.param.watch(lambda event: commits.append(event.new), "layout")

    # Sweep across every tile in the first row before dropping past the last one.
    press_drag_handle(page, items.nth(0))
    # The default masonry predicate needs the dragged tile to cover half of a target.
    offset = 0.75 if layout_mode == "rows" else 0.1
    for box in boxes[1:4]:
        page.mouse.move(box["x"] + box["width"] * offset, box["y"] + 50, steps=10)
        page.wait_for_timeout(250)
    page.mouse.up()

    wait_until(lambda: len(commits) >= 1, page)
    page.wait_for_timeout(800)
    assert len(commits) == 1
    assert commits[0][0]["index"] == 3


def test_resize_snaps_width_to_columns(page):
    grid, items = serve_grid(page, [(25, 130)], width=1200, columns=12, layout_mode="rows")
    handle = settled_box(page, items.nth(0).locator(".muuri-handle.resize"))
    x, y = handle["x"] + handle["width"] / 2, handle["y"] + handle["height"] / 2

    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + 70, y, steps=10)
    page.mouse.up()

    wait_until(lambda: grid.layout[0]["width"] != 25, page)
    assert grid.layout[0]["width"] == pytest.approx(100 * 4 / 12, abs=0.02)


def test_resize_snaps_height_to_row_height(page):
    grid, items = serve_grid(page, [(25, 130)], width=1200, row_height=50, layout_mode="rows")
    handle = settled_box(page, items.nth(0).locator(".muuri-handle.resize"))
    x, y = handle["x"] + handle["width"] / 2, handle["y"] + handle["height"] / 2

    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x, y + 40, steps=10)
    page.mouse.up()

    # Three steps (150px) grow to four (200px), less the tile's margins.
    wait_until(lambda: grid.layout[0]["height"] != 130, page)
    assert grid.layout[0]["height"] == pytest.approx(200 - 2 * MARGIN, abs=0.5)
    assert grid.layout[0]["width"] == 25


def drag_by(page, item, dx, dy):
    sx, sy = press_drag_handle(page, item)
    for i in range(1, 11):
        page.mouse.move(sx + dx * i / 10, sy + dy * i / 10)
        page.wait_for_timeout(40)
    page.wait_for_timeout(300)
    page.mouse.up()


@pytest.mark.parametrize("direction", [1, -1], ids=["right", "left"])
def test_rows_wide_tile_passes_neighbour_after_short_drag(page, direction):
    # A 75% tile beside a 25% one only has to travel about a third of the narrow tile's width.
    sizes = [(75, 200), (25, 100)] if direction > 0 else [(25, 100), (75, 200)]
    wide = 0 if direction > 0 else 1
    grid, items = serve_grid(page, sizes, layout_mode="rows")
    narrow = boxes_of(page, items)[1 - wide]

    drag_by(page, items.nth(wide), direction * narrow["width"] * 0.4, 0)

    wait_until(lambda: grid.layout[wide]["index"] == 1 - wide, page)


def test_rows_tall_tile_moves_down_after_short_drag(page):
    sizes = [(50, 300), (50, 300), (50, 100), (50, 100)]
    grid, items = serve_grid(page, sizes, layout_mode="rows")
    second_row = boxes_of(page, items)[2]["y"]

    # The pointer stays far above the second row; the tile's bottom edge reaches into it.
    # Pointing before the row's first tile would mean the end of the first row, which the tile still fits.
    drag_by(page, items.nth(0), 150, 80)

    wait_until(lambda: grid.layout[0]["index"] > 1, page)
    assert settled_box(page, items.nth(0))["y"] >= second_row - 1


def press_resize_handle(page, item):
    handle = settled_box(page, item.locator(".muuri-handle.resize"))
    x, y = handle["x"] + handle["width"] / 2, handle["y"] + handle["height"] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    return x, y


SPLIT_ROW = [(60, 150), (40, 150), (100, 100)]


@pytest.mark.parametrize(("dx", "widths"), [(100, (70, 30)), (-100, (50, 50))], ids=["widen", "narrow"])
def test_rows_resize_in_full_row_moves_the_boundary(page, dx, widths):
    grid, items = serve_grid(page, SPLIT_ROW, layout_mode="rows")
    before = boxes_of(page, items)
    x, y = press_resize_handle(page, items.nth(0))
    page.mouse.move(x + dx, y, steps=10)

    expect(page.locator(".muuri-grid")).to_have_attribute("data-resize-state", "split")
    expect(items.nth(0)).to_have_attribute("data-resize-state", "split")
    expect(page.locator(".muuri-row-marker")).to_have_count(1)
    expect(page.locator(".muuri-will-move")).to_have_count(0)
    page.mouse.up()

    wait_until(lambda: grid.layout[1]["width"] != 40, page)
    expect(page.locator(".muuri-row-marker")).to_have_count(0)
    assert grid.layout[0]["width"] == pytest.approx(widths[0], abs=0.1)
    assert grid.layout[1]["width"] == pytest.approx(widths[1], abs=0.1)
    assert grid.layout[0]["width"] + grid.layout[1]["width"] <= 100
    after = boxes_of(page, items)
    assert [box["y"] for box in after] == [box["y"] for box in before]
    assert after[1]["x"] + after[1]["width"] == pytest.approx(before[1]["x"] + before[1]["width"], abs=0.5)


def test_rows_split_stops_at_the_neighbours_minimum_width(page):
    grid, items = serve_grid(page, SPLIT_ROW, layout_mode="rows")
    before = boxes_of(page, items)
    x, y = press_resize_handle(page, items.nth(0))
    # Short of the row end, which would reflow the row instead.
    page.mouse.move(x + 330, y, steps=10)
    expect(page.locator(".muuri-grid")).to_have_attribute("data-resize-state", "split")
    page.mouse.up()

    wait_until(lambda: grid.layout[1]["width"] != 40, page)
    after = boxes_of(page, items)
    assert after[1]["y"] == before[1]["y"]
    # 100px border box plus its margins.
    assert after[1]["width"] == pytest.approx(100, abs=1)
    assert grid.layout[0]["width"] + grid.layout[1]["width"] <= 100


def test_rows_split_reflows_when_pulled_to_the_row_end(page):
    grid, items = serve_grid(page, SPLIT_ROW, layout_mode="rows")
    before = boxes_of(page, items)
    x, y = press_resize_handle(page, items.nth(0))
    page.mouse.move(x + 450, y, steps=15)

    expect(page.locator(".muuri-grid")).to_have_attribute("data-resize-state", "overflow")
    expect(page.locator(".muuri-resize-ghost")).to_be_visible()
    expect(items.nth(1)).to_have_class(re.compile("muuri-will-move"))
    expect(items.nth(2)).not_to_have_class(re.compile("muuri-will-move"))
    # Nothing reflows until release.
    assert settled_box(page, items.nth(1))["y"] == before[1]["y"]
    page.mouse.up()

    wait_until(lambda: grid.layout[0]["width"] > 99, page)
    assert grid.layout[1]["width"] == 40
    after = boxes_of(page, items)
    assert after[1]["y"] > before[1]["y"]
    assert after[1]["width"] == pytest.approx(before[1]["width"], abs=0.5)


def test_rows_split_grows_into_spare_room_first(page):
    grid, items = serve_grid(page, [(30, 120), (30, 120), (25, 120)], layout_mode="rows")
    before = boxes_of(page, items)
    x, y = press_resize_handle(page, items.nth(1))
    # 150px of spare room, then 100px taken from the last tile.
    page.mouse.move(x + 250, y, steps=10)
    expect(page.locator(".muuri-grid")).to_have_attribute("data-resize-state", "split")
    page.mouse.up()

    wait_until(lambda: grid.layout[2]["width"] != 25, page)
    assert grid.layout[1]["width"] == pytest.approx(55, abs=0.1)
    assert grid.layout[2]["width"] == pytest.approx(15, abs=0.1)
    after = boxes_of(page, items)
    assert [box["y"] for box in after] == [box["y"] for box in before]


def test_rows_split_shrinks_stacked_neighbours_together(page):
    sizes = [(30, 300), (30, 120), (30, 120), (30, 120)]
    grid, items = serve_grid(page, sizes, layout_mode="rows")
    before = boxes_of(page, items)
    assert before[3]["x"] == before[1]["x"]
    x, y = press_resize_handle(page, items.nth(0))
    page.mouse.move(x + 150, y, steps=10)
    page.mouse.up()

    wait_until(lambda: grid.layout[1]["width"] != 30, page)
    assert grid.layout[1]["width"] == pytest.approx(25, abs=0.1)
    assert grid.layout[3]["width"] == pytest.approx(25, abs=0.1)
    assert grid.layout[2]["width"] == 30
    after = boxes_of(page, items)
    assert [box["y"] for box in after] == [box["y"] for box in before]
    assert after[3]["x"] == after[1]["x"]


def test_rows_resize_of_last_tile_in_row_still_overflows(page):
    grid, items = serve_grid(page, SPLIT_ROW, layout_mode="rows")
    before = boxes_of(page, items)
    x, y = press_resize_handle(page, items.nth(1))
    page.mouse.move(x + 160, y, steps=10)
    expect(page.locator(".muuri-grid")).to_have_attribute("data-resize-state", "overflow")
    page.mouse.up()

    wait_until(lambda: grid.layout[1]["width"] > 40, page)
    assert grid.layout[0]["width"] == 60
    assert settled_box(page, items.nth(1))["y"] > before[1]["y"]


def test_rows_wrap_resize_reflows_instead_of_splitting(page):
    grid, items = serve_grid(page, SPLIT_ROW, layout_mode="rows", row_resize="wrap")
    before = boxes_of(page, items)
    x, y = press_resize_handle(page, items.nth(0))
    page.mouse.move(x + 160, y, steps=10)
    expect(page.locator(".muuri-grid")).to_have_attribute("data-resize-state", "overflow")
    page.mouse.up()

    wait_until(lambda: grid.layout[0]["width"] > 60, page)
    assert grid.layout[1]["width"] == 40
    assert settled_box(page, items.nth(1))["y"] > before[1]["y"]


def test_rows_height_only_resize_leaves_neighbour_alone(page):
    grid, items = serve_grid(page, SPLIT_ROW, layout_mode="rows")
    x, y = press_resize_handle(page, items.nth(0))
    page.mouse.move(x, y + 60, steps=10)
    page.mouse.up()

    wait_until(lambda: grid.layout[0]["height"] != 150, page)
    assert grid.layout[0]["width"] == 60
    assert grid.layout[1]["width"] == 40
