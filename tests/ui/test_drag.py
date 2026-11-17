import pytest

pytest.importorskip("playwright")

from panel.pane import Markdown
from panel.tests.util import serve_component, wait_until
from playwright.sync_api import expect

from panel_tiles import TileGrid

pytestmark = pytest.mark.ui

KPI_LAYOUT = [{"index": i, "width": 25, "height": 100, "visible": True} for i in range(4)] + [
    {"index": 4, "width": 50, "height": 200, "visible": True},
    {"index": 5, "width": 50, "height": 200, "visible": True},
]

# Pixels per pointer event, from a slow drag to a flick.
SPEEDS = [3, 10, 40, 80, 150]


def visual_order(items, n):
    boxes = [items.nth(i).bounding_box() for i in range(n)]
    return sorted(range(n), key=lambda i: (round(boxes[i]["y"]), round(boxes[i]["x"])))


def settle(page, items, n):
    orders = [None]

    def stable():
        order = [items.nth(i).bounding_box() for i in range(n)]
        same = order == orders[0]
        orders[0] = order
        page.wait_for_timeout(150)
        return same

    wait_until(stable, page)


def drag_pointer(page, start, end, speed):
    (x0, y0), (x1, y1) = start, end
    page.mouse.move(x0, y0)
    page.mouse.down()
    n = max(2, int(max(abs(x1 - x0), abs(y1 - y0)) / speed))
    for k in range(1, n + 1):
        page.mouse.move(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n)
        page.wait_for_timeout(16)
    page.wait_for_timeout(300)
    page.mouse.up()


@pytest.mark.parametrize("layout_mode", ["masonry", "rows"])
def test_drag_tile_partly_over_neighbour_reorders(page, layout_mode):
    """A tile dragged until it covers less than half of its neighbour still passes it."""
    grid = TileGrid(
        objects=[Markdown(f"Tile {i}") for i in range(6)],
        layout=KPI_LAYOUT,
        layout_mode=layout_mode,
        local_save=False,
        width=1000,
    )
    serve_component(page, grid)
    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(6)
    wait_until(lambda: items.nth(5).evaluate("el => el.style.height") == "200px", page)

    failures = []
    for rep in range(10):
        grid.layout = [dict(spec) for spec in KPI_LAYOUT]
        wait_until(lambda: visual_order(items, 6) == list(range(6)), page)
        settle(page, items, 6)
        src = rep % 3
        handle = items.nth(src).locator(".muuri-handle.drag").bounding_box()
        target = items.nth(src + 1).bounding_box()
        start = (handle["x"] + handle["width"] / 2, handle["y"] + handle["height"] / 2)
        # The dragged tile ends up covering 40% of its neighbour.
        end = (start[0] + target["width"] * 0.6 + 20, start[1] + 5)
        drag_pointer(page, start, end, SPEEDS[rep % len(SPEEDS)])
        settle(page, items, 6)
        order = visual_order(items, 6)
        if order.index(src) != order.index(src + 1) + 1:
            failures.append((rep, src, SPEEDS[rep % len(SPEEDS)], order))
    assert failures == []
