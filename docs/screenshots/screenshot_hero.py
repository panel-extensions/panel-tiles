"""Screenshot: hero example with charts, indicators, and a Tabulator table in a pmui.Page."""

import numpy as np
import pandas as pd
import panel as pn
import panel_material_ui as pmui
from bokeh.plotting import figure
from panel.tests.util import serve_component, wait_until
from playwright.sync_api import sync_playwright

from panel_tiles import TileGrid

pn.extension("tabulator")

np.random.seed(42)

# Number indicators
revenue_ind = pn.indicators.Number(name="Revenue", value=4.2, format="${value}M", font_size="28pt", title_size="12pt")
growth_ind = pn.indicators.Number(
    name="Growth", value=18.5, format="{value}%", font_size="28pt", title_size="12pt", colors=[(0, "red"), (10, "orange"), (15, "green")]
)
users_ind = pn.indicators.Number(name="Active Users", value=12847, format="{value:,.0f}", font_size="28pt", title_size="12pt")
retention_ind = pn.indicators.Number(
    name="Retention", value=94.2, format="{value}%", font_size="28pt", title_size="12pt", colors=[(0, "red"), (80, "orange"), (90, "green")]
)

# Line chart
line_fig = figure(title="Revenue (2024)", sizing_mode="stretch_both", height=250)
months = np.arange(1, 13)
revenue = np.cumsum(np.random.uniform(50, 150, 12))
line_fig.line(months, revenue, line_width=3, color="#2563eb")
line_fig.scatter(months, revenue, size=7, color="#2563eb")
line_fig.xaxis.axis_label = "Month"
line_fig.yaxis.axis_label = "Revenue ($k)"

# Bar chart
bar_fig = figure(
    title="Sales by Region",
    x_range=["North", "South", "East", "West", "Central"],
    sizing_mode="stretch_both",
    height=250,
)
bar_fig.vbar(
    x=["North", "South", "East", "West", "Central"],
    top=[82, 67, 93, 45, 71],
    width=0.6,
    color=["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706"],
)
bar_fig.yaxis.axis_label = "Units Sold"

# Table
df = pd.DataFrame(
    {
        "Product": ["Widget A", "Widget B", "Gadget X", "Gadget Y", "Service Z"],
        "Q1": [120, 95, 200, 150, 80],
        "Q2": [135, 88, 220, 165, 92],
        "Q3": [142, 102, 195, 180, 105],
        "Q4": [158, 110, 240, 192, 118],
    }
)
table = pn.widgets.Tabulator(df, sizing_mode="stretch_width", height=280)

grid = TileGrid(
    objects=[
        revenue_ind,
        growth_ind,
        users_ind,
        retention_ind,
        pn.pane.Bokeh(line_fig),
        pn.pane.Bokeh(bar_fig),
        table,
    ],
    layout=[
        {"width": 25, "height": 100, "visible": True},
        {"width": 25, "height": 100, "visible": True},
        {"width": 25, "height": 100, "visible": True},
        {"width": 25, "height": 100, "visible": True},
        {"width": 50, "height": 300, "visible": True},
        {"width": 50, "height": 300, "visible": True},
        {"width": 100, "height": 300, "visible": True},
    ],
    editable=True,
    sizing_mode="stretch_width",
    height=800,
)

page = pmui.Page(main=[grid], title="panel-tiles")

with sync_playwright() as p:
    browser = p.chromium.launch()
    page_ctx = browser.new_page(viewport={"width": 1200, "height": 750})
    serve_component(page_ctx, page)
    wait_until(lambda: page_ctx.locator(".muuri-grid-item").count() == 7, page_ctx, timeout=15000)
    page_ctx.wait_for_timeout(2000)
    page_ctx.screenshot(path="docs/screenshots/hero.png")
    browser.close()

print("Saved: docs/screenshots/hero.png")
