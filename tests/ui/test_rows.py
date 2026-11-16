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
