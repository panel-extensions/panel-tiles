import re

import pytest

pytest.importorskip("playwright")

from panel.pane import Markdown
from panel.tests.util import serve_component, wait_until
from playwright.sync_api import expect

from panel_tiles import TileGrid

pytestmark = pytest.mark.ui

KPI_LAYOUT = [{"index": i, "width": 25, "height": 100, "visible": True} for i in range(4)]


def drag_resize(page, item, dx, dy):
    handle = item.locator(".muuri-handle.resize")
    handle.scroll_into_view_if_needed()
    wait_until(lambda: handle.bounding_box() is not None, page)
    # Wait out the preview max-width transition and Muuri's layout animation.
    boxes = [None]

    def settled():
        box = handle.bounding_box()
        stable = box == boxes[0]
        boxes[0] = box
        page.wait_for_timeout(100)
        return stable

    wait_until(settled, page)
    box = handle.bounding_box()
    x = box["x"] + box["width"] / 2
    y = box["y"] + box["height"] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + dx, y + dy, steps=10)
    page.mouse.up()


def data_widths(items):
    return [items.nth(i).evaluate("el => el.getAttribute('data-width')") for i in range(items.count())]


def test_responsive_toolbar_hidden_when_not_editable(page):
    grid = TileGrid(
        objects=[Markdown("A"), Markdown("B")],
        breakpoints=[768, 1200],
        editable=False,
        local_save=False,
        width=900,
        height=400,
    )

    serve_component(page, grid)

    toolbar = page.locator(".muuri-breakpoint-toolbar")
    expect(toolbar).to_have_count(1)
    expect(toolbar).not_to_be_visible()


def test_responsive_toolbar_visible_when_editable(page):
    grid = TileGrid(
        objects=[Markdown("A"), Markdown("B")],
        breakpoints=[768, 1200],
        editable=True,
        local_save=False,
        width=900,
        height=400,
    )

    serve_component(page, grid)

    toolbar = page.locator(".muuri-breakpoint-toolbar")
    expect(toolbar).to_be_visible()

    chips = toolbar.locator(".muuri-breakpoint-chip")
    # 2 breakpoints -> 3 bands (xs, sm, md) + AUTO = 4 chips
    expect(chips).to_have_count(4)


def test_responsive_toolbar_shows_on_editable_toggle(page):
    grid = TileGrid(
        objects=[Markdown("A"), Markdown("B")],
        breakpoints=[768, 1200],
        editable=False,
        local_save=False,
        width=900,
        height=400,
    )

    serve_component(page, grid)

    toolbar = page.locator(".muuri-breakpoint-toolbar")
    expect(toolbar).not_to_be_visible()

    grid.editable = True
    expect(toolbar).to_be_visible()

    grid.editable = False
    expect(toolbar).not_to_be_visible()


def test_responsive_loads_preconfigured_layouts(page):
    grid = TileGrid(
        objects=[Markdown("A"), Markdown("B")],
        breakpoints=[768, 1200],
        layout=[
            {"index": 0, "width": 50, "height": 100, "visible": True},
            {"index": 1, "width": 50, "height": 100, "visible": True},
        ],
        responsive_layouts={
            "xs": [
                {"index": 0, "width": 100, "height": 80, "visible": True},
                {"index": 1, "width": 100, "height": 80, "visible": True},
            ],
        },
        editable=True,
        local_save=False,
        width=900,
        height=400,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)

    # Default layout is applied (50% each)
    wait_until(
        lambda: items.nth(0).evaluate("el => el.getAttribute('data-width')") == "50",
        page,
    )

    # Click XS chip to switch to xs breakpoint
    xs_chip = page.locator(".muuri-breakpoint-chip").first
    xs_chip.click()

    # xs layout should now be applied (100% each)
    wait_until(
        lambda: items.nth(0).evaluate("el => el.getAttribute('data-width')") == "100",
        page,
    )
    wait_until(
        lambda: items.nth(1).evaluate("el => el.getAttribute('data-width')") == "100",
        page,
    )


def test_responsive_constrains_container_on_breakpoint_select(page):
    grid = TileGrid(
        objects=[Markdown("A"), Markdown("B")],
        breakpoints=[768, 1200],
        editable=True,
        local_save=False,
        width=1400,
        height=400,
    )

    serve_component(page, grid)

    container = page.locator(".muuri-grid")
    expect(container).to_have_count(1)

    # Click the XS chip (<768px)
    xs_chip = page.locator(".muuri-breakpoint-chip").first
    xs_chip.click()

    # Container should be constrained and have the constrained class
    wait_until(
        lambda: container.evaluate("el => el.classList.contains('muuri-constrained')"),
        page,
    )
    wait_until(
        lambda: container.evaluate("el => el.style.maxWidth") == "768px",
        page,
    )

    # Click AUTO to unconstrain
    auto_chip = page.locator(".muuri-breakpoint-chip").last
    auto_chip.click()

    wait_until(
        lambda: not container.evaluate("el => el.classList.contains('muuri-constrained')"),
        page,
    )
    wait_until(
        lambda: container.evaluate("el => el.style.maxWidth") == "",
        page,
    )


def test_responsive_editing_persists_to_model(page):
    grid = TileGrid(
        objects=[Markdown("A"), Markdown("B")],
        breakpoints=[768, 1200],
        layout=[
            {"index": 0, "width": 50, "height": 100, "visible": True},
            {"index": 1, "width": 50, "height": 100, "visible": True},
        ],
        editable=True,
        local_save=False,
        width=900,
        height=400,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)
    wait_until(
        lambda: items.nth(0).evaluate("el => el.style.height") == "100px",
        page,
    )

    # Select XS breakpoint
    xs_chip = page.locator(".muuri-breakpoint-chip").first
    xs_chip.click()

    drag_resize(page, items.nth(0), dx=100, dy=50)

    # The responsive_layouts should now have an "xs" entry
    wait_until(lambda: "xs" in grid.responsive_layouts, page)
    assert len(grid.responsive_layouts["xs"]) == 2


def test_responsive_switch_preserves_previous_breakpoint_layout(page):
    grid = TileGrid(
        objects=[Markdown("A"), Markdown("B")],
        breakpoints=[768, 1200],
        layout=[
            {"index": 0, "width": 50, "height": 100, "visible": True},
            {"index": 1, "width": 50, "height": 100, "visible": True},
        ],
        responsive_layouts={
            "xs": [
                {"index": 0, "width": 100, "height": 80, "visible": True},
                {"index": 1, "width": 100, "height": 80, "visible": True},
            ],
            "sm": [
                {"index": 0, "width": 60, "height": 120, "visible": True},
                {"index": 1, "width": 40, "height": 120, "visible": True},
            ],
        },
        editable=True,
        local_save=False,
        width=900,
        height=400,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)

    # Switch to SM
    sm_chip = page.locator(".muuri-breakpoint-chip").nth(1)
    sm_chip.click()

    wait_until(
        lambda: items.nth(0).evaluate("el => el.getAttribute('data-width')") == "60",
        page,
    )
    wait_until(
        lambda: items.nth(1).evaluate("el => el.getAttribute('data-width')") == "40",
        page,
    )

    # Switch to XS
    xs_chip = page.locator(".muuri-breakpoint-chip").first
    xs_chip.click()

    wait_until(
        lambda: items.nth(0).evaluate("el => el.getAttribute('data-width')") == "100",
        page,
    )
    wait_until(
        lambda: items.nth(1).evaluate("el => el.getAttribute('data-width')") == "100",
        page,
    )

    # Switch back to SM - should still be 60/40
    sm_chip.click()

    wait_until(
        lambda: items.nth(0).evaluate("el => el.getAttribute('data-width')") == "60",
        page,
    )
    wait_until(
        lambda: items.nth(1).evaluate("el => el.getAttribute('data-width')") == "40",
        page,
    )


def test_responsive_local_save_persists(page):
    grid = TileGrid(
        objects=[Markdown("A"), Markdown("B")],
        breakpoints=[768, 1200],
        layout=[
            {"index": 0, "width": 50, "height": 100, "visible": True},
            {"index": 1, "width": 50, "height": 100, "visible": True},
        ],
        responsive_layouts={
            "xs": [
                {"index": 0, "width": 100, "height": 80, "visible": True},
                {"index": 1, "width": 100, "height": 80, "visible": True},
            ],
        },
        editable=True,
        local_save=True,
        name="test-responsive-save",
        width=900,
        height=400,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)
    wait_until(
        lambda: items.nth(0).evaluate("el => el.style.height") == "100px",
        page,
    )

    # Select XS and make an edit (resize the second item)
    xs_chip = page.locator(".muuri-breakpoint-chip").first
    xs_chip.click()

    wait_until(
        lambda: items.nth(1).evaluate("el => el.getAttribute('data-width')") == "100",
        page,
    )

    drag_resize(page, items.nth(1), dx=-100, dy=0)

    wait_until(lambda: grid.responsive_layouts["xs"][1]["width"] < 100, page)

    # The regular layout localStorage key should exist (sync_layout writes it)
    wait_until(
        lambda: page.evaluate("() => Object.keys(localStorage).some(k => k.includes('test-responsive-save'))"),
        page,
    )

    # Check localStorage has the responsive layouts saved
    ls_key = page.evaluate("() => Object.keys(localStorage).find(k => k.includes('test-responsive-save::responsive'))")
    assert ls_key is not None

    ls_value = page.evaluate(f"() => JSON.parse(localStorage.getItem('{ls_key}'))")
    assert "xs" in ls_value
    assert len(ls_value["xs"]) == 2


def test_responsive_clear_local_save_removes_responsive(page):
    grid = TileGrid(
        objects=[Markdown("A"), Markdown("B")],
        breakpoints=[768, 1200],
        layout=[
            {"index": 0, "width": 50, "height": 100, "visible": True},
            {"index": 1, "width": 50, "height": 100, "visible": True},
        ],
        responsive_layouts={
            "xs": [
                {"index": 0, "width": 100, "height": 80, "visible": True},
                {"index": 1, "width": 100, "height": 80, "visible": True},
            ],
        },
        editable=True,
        local_save=True,
        name="test-responsive-clear",
        width=900,
        height=400,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)
    wait_until(
        lambda: items.nth(0).evaluate("el => el.style.height") == "100px",
        page,
    )

    # Edit the XS preview to persist a custom layout to localStorage
    xs_chip = page.locator(".muuri-breakpoint-chip").first
    xs_chip.click()

    wait_until(
        lambda: items.nth(0).evaluate("el => el.getAttribute('data-width')") == "100",
        page,
    )
    drag_resize(page, items.nth(0), dx=-100, dy=20)

    # Verify localStorage has responsive data
    wait_until(
        lambda: page.evaluate("() => Object.keys(localStorage).some(k => k.includes('test-responsive-clear::responsive'))"),
        page,
    )

    # Clear local save
    grid.clear_local_save()

    # Both regular and responsive localStorage should be removed
    wait_until(
        lambda: not page.evaluate("() => Object.keys(localStorage).some(k => k.includes('test-responsive-clear'))"),
        page,
    )


def test_responsive_server_layout_update_while_previewing_updates_base(page):
    grid = TileGrid(
        objects=[Markdown("A"), Markdown("B")],
        breakpoints=[768, 1200],
        layout=[
            {"index": 0, "width": 50, "height": 100, "visible": True},
            {"index": 1, "width": 50, "height": 100, "visible": True},
        ],
        editable=True,
        local_save=False,
        width=900,
        height=400,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)
    wait_until(lambda: items.nth(0).evaluate("el => el.style.height") == "100px", page)

    page.locator(".muuri-breakpoint-chip").first.click()
    wait_until(lambda: page.locator(".muuri-grid.muuri-constrained").count() == 1, page)

    grid.layout = [
        {"index": 0, "width": 30, "height": 120, "visible": True},
        {"index": 1, "width": 70, "height": 120, "visible": True},
    ]

    # XS displays the new base; nothing is below its shrink limit at 768px.
    wait_until(lambda: data_widths(items) == ["30", "70"], page)
    wait_until(lambda: items.nth(0).evaluate("el => el.style.height") == "120px", page)
    assert grid.responsive_layouts == {}


def test_responsive_server_layout_update_in_auto_does_not_create_override(page):
    grid = TileGrid(
        objects=[Markdown("A"), Markdown("B")],
        breakpoints=[768, 1200],
        layout=[
            {"index": 0, "width": 50, "height": 100, "visible": True},
            {"index": 1, "width": 50, "height": 100, "visible": True},
        ],
        editable=True,
        local_save=False,
        width=900,
        height=400,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)

    grid.layout = [
        {"index": 0, "width": 70, "height": 150, "visible": True},
        {"index": 1, "width": 30, "height": 150, "visible": True},
    ]

    wait_until(lambda: data_widths(items) == ["70", "30"], page)
    page.wait_for_timeout(200)
    assert grid.responsive_layouts == {}


def test_responsive_band_without_override_is_generated_from_base(page):
    grid = TileGrid(
        objects=[Markdown(t) for t in "ABCD"],
        breakpoints=[768, 1200],
        layout=KPI_LAYOUT,
        reference_width=1400,
        responsive_layouts={
            # Overrides for the band containing reference_width are ignored.
            "md": [{"index": i, "width": 100, "height": 100, "visible": True} for i in range(4)],
        },
        editable=True,
        local_save=False,
        width=1400,
        height=400,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(4)
    wait_until(lambda: data_widths(items) == ["25"] * 4, page)

    # 25% of 768px is 192px, above the 175px shrink limit, so XS keeps the row.
    page.locator(".muuri-breakpoint-chip").first.click()
    wait_until(lambda: page.locator(".muuri-grid.muuri-constrained").count() == 1, page)
    page.wait_for_timeout(300)
    assert data_widths(items) == ["25"] * 4

    grid.wrap_shrink = 0.6
    wait_until(lambda: data_widths(items) == ["50"] * 4, page)
    assert grid.layout == KPI_LAYOUT


def test_responsive_auto_wraps_narrow_container_without_breakpoints(page):
    grid = TileGrid(
        objects=[Markdown(t) for t in "ABCD"],
        layout=KPI_LAYOUT,
        reference_width=1400,
        editable=False,
        local_save=False,
        width=600,
        height=400,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(4)
    wait_until(lambda: data_widths(items) == ["50"] * 4, page)

    # Tiles pair up into two rows.
    tops = [items.nth(i).bounding_box()["y"] for i in range(4)]
    assert tops[0] == tops[1] and tops[2] == tops[3] and tops[2] > tops[0]
    assert grid.layout == KPI_LAYOUT


def test_responsive_auto_rewraps_on_viewport_resize(page):
    grid = TileGrid(
        objects=[Markdown(t) for t in "ABCD"],
        layout=KPI_LAYOUT,
        reference_width=1400,
        editable=False,
        local_save=False,
        sizing_mode="stretch_width",
        height=400,
    )

    page.set_viewport_size({"width": 1400, "height": 800})
    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(4)
    wait_until(lambda: data_widths(items) == ["25"] * 4, page)

    page.set_viewport_size({"width": 500, "height": 800})
    wait_until(lambda: data_widths(items) == ["50"] * 4, page)

    page.set_viewport_size({"width": 1300, "height": 800})
    wait_until(lambda: data_widths(items) == ["25"] * 4, page)
    assert grid.layout == KPI_LAYOUT


def test_responsive_scale_mode_keeps_percentages(page):
    grid = TileGrid(
        objects=[Markdown(t) for t in "ABCD"],
        layout=KPI_LAYOUT,
        reference_width=1400,
        responsive_mode="scale",
        editable=False,
        local_save=False,
        width=500,
        height=400,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(4)
    wait_until(lambda: data_widths(items) == ["25"] * 4, page)
    page.wait_for_timeout(300)
    assert data_widths(items) == ["25"] * 4


def test_responsive_preview_edit_creates_override_and_keeps_base(page):
    layout = [
        {"index": 0, "width": 50, "height": 100, "visible": True},
        {"index": 1, "width": 50, "height": 100, "visible": True},
    ]
    grid = TileGrid(
        objects=[Markdown("A"), Markdown("B")],
        breakpoints=[768, 1200],
        layout=layout,
        reference_width=1400,
        editable=True,
        local_save=False,
        width=1400,
        height=400,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)
    wait_until(lambda: items.nth(0).evaluate("el => el.style.height") == "100px", page)

    page.locator(".muuri-breakpoint-chip").first.click()
    wait_until(lambda: page.locator(".muuri-grid.muuri-constrained").count() == 1, page)
    drag_resize(page, items.nth(0), dx=0, dy=60)

    wait_until(lambda: "xs" in grid.responsive_layouts, page)
    assert grid.layout == layout
    assert grid.reference_width == 1400
    expect(page.locator(".muuri-breakpoint-chip").first).to_have_class(re.compile("muuri-chip-custom"))


def test_responsive_auto_edit_updates_base_and_reference_width(page):
    grid = TileGrid(
        objects=[Markdown("A"), Markdown("B")],
        layout=[
            {"index": 0, "width": 50, "height": 100, "visible": True},
            {"index": 1, "width": 50, "height": 100, "visible": True},
        ],
        editable=True,
        local_save=False,
        width=900,
        height=400,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)
    wait_until(lambda: items.nth(0).evaluate("el => el.style.height") == "100px", page)

    drag_resize(page, items.nth(0), dx=0, dy=60)

    wait_until(lambda: grid.reference_width == 900, page)
    assert grid.layout[0]["height"] > 100
    assert grid.responsive_layouts == {}


def test_responsive_reset_discards_override(page):
    grid = TileGrid(
        objects=[Markdown(t) for t in "ABCD"],
        breakpoints=[768, 1200],
        layout=KPI_LAYOUT,
        reference_width=1400,
        responsive_layouts={
            "xs": [{"index": i, "width": 100, "height": 80, "visible": True} for i in range(4)],
        },
        editable=True,
        local_save=False,
        width=1400,
        height=400,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(4)
    reset = page.locator(".muuri-breakpoint-reset")
    expect(reset).to_be_hidden()

    chips = page.locator(".muuri-breakpoint-chip")
    expect(chips.nth(2)).to_have_class(re.compile("muuri-chip-base"))
    expect(chips.first).to_have_class(re.compile("muuri-chip-custom"))

    chips.first.click()
    wait_until(lambda: data_widths(items) == ["100"] * 4, page)
    expect(reset).to_be_visible()

    reset.click()
    wait_until(lambda: grid.responsive_layouts == {}, page)
    wait_until(lambda: data_widths(items) == ["25"] * 4, page)
    expect(reset).to_be_hidden()
    expect(chips.first).not_to_have_class(re.compile("muuri-chip-custom"))


def test_responsive_server_reset_regenerates(page):
    grid = TileGrid(
        objects=[Markdown(t) for t in "ABCD"],
        breakpoints=[768, 1200],
        layout=KPI_LAYOUT,
        reference_width=1400,
        responsive_layouts={
            "sm": [{"index": i, "width": 100, "height": 80, "visible": True} for i in range(4)],
        },
        editable=False,
        local_save=False,
        width=1000,
        height=400,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(4)
    wait_until(lambda: data_widths(items) == ["100"] * 4, page)

    grid.reset_responsive_layout("sm")
    wait_until(lambda: data_widths(items) == ["25"] * 4, page)


def test_responsive_local_save_restores_reference_width(page):
    grid = TileGrid(
        objects=[Markdown("A"), Markdown("B")],
        layout=[
            {"index": 0, "width": 50, "height": 100, "visible": True},
            {"index": 1, "width": 50, "height": 100, "visible": True},
        ],
        editable=True,
        local_save=True,
        name="test-responsive-reference",
        width=900,
        height=400,
    )

    serve_component(page, grid)

    items = page.locator(".muuri-grid-item")
    expect(items).to_have_count(2)
    wait_until(lambda: items.nth(0).evaluate("el => el.style.height") == "100px", page)

    drag_resize(page, items.nth(0), dx=0, dy=60)
    wait_until(lambda: grid.reference_width == 900, page)

    saved = page.evaluate("() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith('test-responsive-reference::reference_width'))))")
    assert saved == 900

    grid.clear_local_save()
    wait_until(
        lambda: not page.evaluate("() => Object.keys(localStorage).some(k => k.includes('test-responsive-reference'))"),
        page,
    )
