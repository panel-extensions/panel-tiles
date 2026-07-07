import pytest

pytest.importorskip("playwright")

from panel.pane import Markdown
from panel.tests.util import serve_component, wait_until
from playwright.sync_api import expect

from panel_tiles import TileGrid

pytestmark = pytest.mark.ui


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

    # Resize the first tile using the resize handle
    item = items.nth(0)
    resize_handle = item.locator(".muuri-handle.resize")
    wait_until(lambda: resize_handle.bounding_box() is not None, page)
    handle_box = resize_handle.bounding_box()
    start_x = handle_box["x"] + handle_box["width"] / 2
    start_y = handle_box["y"] + handle_box["height"] / 2

    page.mouse.move(start_x, start_y)
    page.mouse.down()
    page.mouse.move(start_x + 100, start_y + 50, steps=5)
    page.mouse.up()

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

    item = items.nth(1)
    resize_handle = item.locator(".muuri-handle.resize")
    resize_handle.scroll_into_view_if_needed()
    wait_until(lambda: resize_handle.bounding_box() is not None, page)
    page.wait_for_timeout(200)
    handle_box = resize_handle.bounding_box()
    start_x = handle_box["x"] + handle_box["width"] / 2
    start_y = handle_box["y"] + handle_box["height"] / 2

    page.mouse.move(start_x, start_y)
    page.mouse.down()
    page.mouse.move(start_x - 100, start_y, steps=10)
    page.mouse.up()

    # Wait for responsive_layouts to update
    wait_until(lambda: "xs" in grid.responsive_layouts, page)

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

    # Select XS to trigger a save to localStorage
    xs_chip = page.locator(".muuri-breakpoint-chip").first
    xs_chip.click()

    wait_until(
        lambda: items.nth(0).evaluate("el => el.getAttribute('data-width')") == "100",
        page,
    )

    # Switch back to AUTO to persist the xs layout
    auto_chip = page.locator(".muuri-breakpoint-chip").last
    auto_chip.click()

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


def test_responsive_server_layout_update_saves_to_active_breakpoint(page):
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

    wait_until(
        lambda: page.locator(".muuri-grid.muuri-constrained").count() == 1,
        page,
    )

    # Update layout from server while XS is active
    grid.layout = [
        {"index": 0, "width": 100, "height": 120, "visible": True},
        {"index": 1, "width": 100, "height": 120, "visible": True},
    ]

    # Layout should be applied visually
    wait_until(
        lambda: items.nth(0).evaluate("el => el.getAttribute('data-width')") == "100",
        page,
    )

    # responsive_layouts should be updated with the xs entry
    wait_until(lambda: "xs" in grid.responsive_layouts, page)
    assert grid.responsive_layouts["xs"][0]["width"] == 100
    assert grid.responsive_layouts["xs"][0]["height"] == 120


def test_responsive_server_layout_update_without_breakpoint_does_not_save(page):
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

    # Update layout from server in AUTO mode (no breakpoint selected)
    grid.layout = [
        {"index": 0, "width": 70, "height": 150, "visible": True},
        {"index": 1, "width": 30, "height": 150, "visible": True},
    ]

    # Layout should be applied visually
    wait_until(
        lambda: items.nth(0).evaluate("el => el.getAttribute('data-width')") == "70",
        page,
    )

    # responsive_layouts should remain empty
    assert grid.responsive_layouts == {}


def test_responsive_fallback_to_larger_breakpoint(page):
    grid = TileGrid(
        objects=[Markdown("A"), Markdown("B")],
        breakpoints=[768, 1200],
        layout=[
            {"index": 0, "width": 50, "height": 100, "visible": True},
            {"index": 1, "width": 50, "height": 100, "visible": True},
        ],
        responsive_layouts={
            # Only md (largest) is defined
            "md": [
                {"index": 0, "width": 30, "height": 150, "visible": True},
                {"index": 1, "width": 70, "height": 150, "visible": True},
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

    # Select XS - no xs layout exists, should fall back to md
    xs_chip = page.locator(".muuri-breakpoint-chip").first
    xs_chip.click()

    wait_until(
        lambda: items.nth(0).evaluate("el => el.getAttribute('data-width')") == "30",
        page,
    )
    wait_until(
        lambda: items.nth(1).evaluate("el => el.getAttribute('data-width')") == "70",
        page,
    )
