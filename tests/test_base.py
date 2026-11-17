import pytest
from bokeh.embed.bundle import extension_dirs
from panel import Spacer
from panel.pane import Markdown
from panel.viewable import Viewable

from panel_tiles import TileGrid
from panel_tiles.base import DIST_PATH


def test_grid_defaults():
    grid = TileGrid(objects=[Markdown("A")])

    assert grid.editable is True
    assert grid.fill_gaps is True
    assert grid.local_save is False
    assert grid.layout == []
    assert len(grid.objects) == 1


def test_grid_coerces_objects_to_viewables():
    grid = TileGrid(objects=["A", Markdown("B")])

    assert len(grid.objects) == 2
    assert all(isinstance(obj, Viewable) for obj in grid.objects)


def test_grid_registers_extension_directory():
    assert extension_dirs["panel-tiles"] == DIST_PATH


def test_grid_serializes_parameters_to_bokeh_model():
    layout = [
        {"index": 0, "width": 50, "height": 120, "visible": True},
        {"index": 1, "width": 37.5, "height": None, "visible": True},
    ]
    grid = TileGrid(
        objects=[Markdown("A"), Spacer(width=300, height=100)],
        editable=False,
        fill_gaps=False,
        layout=layout,
        local_save=True,
        width=800,
    )

    model = grid.get_root()

    assert model.width == 800
    assert model.children == ["objects"]
    assert model.data.editable is False
    assert model.data.fill_gaps is False
    assert model.data.local_save is True
    assert model.data.layout == layout
    assert len(model.data.objects) == 2
    assert model.data.objects[1].width == 300
    assert model.data.objects[1].height == 100


def test_grid_serializes_responsive_parameters():
    grid = TileGrid(
        objects=[Markdown("A")],
        breakpoints=[768, 1200],
        reference_width=1400,
        responsive_mode="scale",
        wrap_shrink=0.7,
    )

    model = grid.get_root()

    assert model.data.reference_width == 1400
    assert model.data.responsive_mode == "scale"
    assert model.data.wrap_shrink == 0.7


def test_grid_responsive_defaults():
    grid = TileGrid(objects=[Markdown("A")])

    assert grid.reference_width is None
    assert grid.responsive_mode == "wrap"
    assert grid.wrap_shrink == 0.5
    assert grid.responsive_layouts == {}


def test_preview_band_defaults_to_following_width():
    grid = TileGrid(objects=[Markdown("A")], breakpoints=[768, 1200])

    assert grid.preview_band is None
    assert grid.show_breakpoint_toolbar is True
    assert grid.param.preview_band.objects == [None, "xs", "sm", "md"]


def test_preview_band_accepts_band_labels():
    grid = TileGrid(objects=[Markdown("A")], breakpoints=[1200, 768], preview_band="md")

    assert grid.preview_band == "md"
    grid.preview_band = "xs"
    assert grid.preview_band == "xs"


def test_preview_band_labels_beyond_named_bands():
    grid = TileGrid(objects=[Markdown("A")], breakpoints=list(range(100, 800, 100)))

    assert grid.param.preview_band.objects[1:] == ["xs", "sm", "md", "lg", "xl", "xxl", "bp6", "bp7"]


def test_preview_band_rejects_unknown_band():
    with pytest.raises(ValueError):
        TileGrid(objects=[Markdown("A")], preview_band="md")

    grid = TileGrid(objects=[Markdown("A")], breakpoints=[768])
    with pytest.raises(ValueError):
        grid.preview_band = "md"


def test_preview_band_resets_when_breakpoints_drop_it():
    grid = TileGrid(objects=[Markdown("A")], breakpoints=[768, 1200], preview_band="md")

    grid.breakpoints = [768]

    assert grid.preview_band is None
    assert grid.param.preview_band.objects == [None, "xs", "sm"]


def test_preview_band_options_are_per_instance():
    TileGrid(objects=[Markdown("A")], breakpoints=[768, 1200])

    assert TileGrid(objects=[Markdown("A")]).param.preview_band.objects == [None]


XS_LAYOUT = [{"index": 0, "width": 100, "height": 80, "visible": True}]


def test_reset_responsive_layout_single_band():
    grid = TileGrid(objects=[Markdown("A")], responsive_layouts={"xs": XS_LAYOUT, "sm": XS_LAYOUT})

    grid.reset_responsive_layout("xs")

    assert grid.responsive_layouts == {"sm": XS_LAYOUT}


def test_reset_responsive_layout_all_bands():
    grid = TileGrid(objects=[Markdown("A")], responsive_layouts={"xs": XS_LAYOUT, "sm": XS_LAYOUT})

    grid.reset_responsive_layout()

    assert grid.responsive_layouts == {}


def test_handle_msg_updates_and_deletes_responsive_layout():
    grid = TileGrid(objects=[Markdown("A")])

    grid._handle_msg({"action": "update_responsive_layout", "band": "xs", "layout": XS_LAYOUT})
    assert grid.responsive_layouts == {"xs": XS_LAYOUT}

    grid._handle_msg({"action": "delete_responsive_layout", "band": "xs"})
    assert grid.responsive_layouts == {}


def test_grid_bundle_url_is_versioned_without_autoreload():
    from panel.config import config

    assert not config.autoreload
    url = TileGrid._render_esm(server=True)
    path, _, version = url.partition("?")
    assert path.endswith("panel-tiles.bundle.js")
    assert len(version) == 64


def test_grid_layout_mode_defaults_to_masonry():
    grid = TileGrid(objects=[Markdown("A")])

    assert grid.layout_mode == "masonry"
    assert grid.columns is None
    assert grid.row_height is None


def selected_grid(selected=None):
    tiles = [Markdown(name) for name in "ABCD"]
    return TileGrid(objects=tiles, selected=selected), tiles


def test_grid_selected_defaults_to_none():
    grid, _ = selected_grid()

    assert grid.selected is None


@pytest.mark.parametrize("value", [-1, 4, 10])
def test_grid_selected_rejects_out_of_range(value):
    grid, _ = selected_grid()

    with pytest.raises(ValueError, match="selected"):
        grid.selected = value
    assert grid.selected is None


def test_grid_selected_rejects_out_of_range_on_init():
    with pytest.raises(ValueError, match="selected"):
        TileGrid(objects=[Markdown("A")], selected=1)


def test_grid_selected_shifts_when_tiles_removed_before_it():
    grid, tiles = selected_grid(2)

    grid.pop(0)

    assert grid.selected == 1
    assert grid.objects[grid.selected] is tiles[2]


def test_grid_selected_shifts_when_tiles_inserted_before_it():
    grid, tiles = selected_grid(1)

    grid.insert(0, Markdown("New"))
    grid.objects = [Markdown("Other"), *grid.objects]

    assert grid.selected == 3
    assert grid.objects[grid.selected] is tiles[1]


def test_grid_selected_unchanged_when_tiles_change_after_it():
    grid, tiles = selected_grid(1)

    grid.append(Markdown("E"))
    grid.pop(3)

    assert grid.selected == 1


def test_grid_selected_resets_when_its_tile_is_removed():
    grid, tiles = selected_grid(2)

    grid.remove(tiles[2])

    assert grid.selected is None


def test_grid_selected_resets_when_its_tile_is_replaced():
    grid, _ = selected_grid(0)

    grid[0] = Markdown("Replacement")

    assert grid.selected is None


def test_grid_selected_follows_reordered_tile():
    grid, tiles = selected_grid(0)

    grid.reverse()

    assert grid.selected == 3


def test_grid_selected_resets_when_cleared():
    grid, _ = selected_grid(3)

    grid.clear()

    assert grid.selected is None


def test_grid_remove_message_updates_selected():
    grid, tiles = selected_grid(3)

    grid._handle_msg({"action": "remove", "index": 1})

    assert grid.selected == 2
    assert grid.objects[2] is tiles[3]
