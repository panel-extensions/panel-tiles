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
    assert grid.initial_layout == []
    assert grid.layout == []
    assert len(grid.objects) == 1


def test_grid_coerces_objects_to_viewables():
    grid = TileGrid(objects=["A", Markdown("B")])

    assert len(grid.objects) == 2
    assert all(isinstance(obj, Viewable) for obj in grid.objects)


def test_grid_registers_extension_directory():
    assert extension_dirs["panel-tiles"] == DIST_PATH


def test_grid_serializes_parameters_to_bokeh_model():
    initial_layout = [{"index": 0, "width": 50, "height": 120, "visible": True}]
    layout = [{"index": 1, "width": 37.5, "height": None, "visible": True}]
    grid = TileGrid(
        objects=[Markdown("A"), Spacer(width=300, height=100)],
        editable=False,
        fill_gaps=False,
        initial_layout=initial_layout,
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
    assert model.data.initial_layout == initial_layout
    assert model.data.layout == layout
    assert len(model.data.objects) == 2
    assert model.data.objects[1].width == 300
    assert model.data.objects[1].height == 100
