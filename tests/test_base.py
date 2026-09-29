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
