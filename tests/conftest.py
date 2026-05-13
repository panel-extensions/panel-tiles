optional_markers = {
    "ui": {
        "help": "Runs UI related tests",
        "marker-descr": "UI test marker",
        "skip-reason": "Test only runs with the --ui option.",
    },
}


def pytest_addoption(parser):
    for marker, info in optional_markers.items():
        parser.addoption(
            f"--{marker}",
            action="store_true",
            default=False,
            help=info["help"],
        )


def pytest_configure(config):
    for marker, info in optional_markers.items():
        config.addinivalue_line("markers", f"{marker}: {info['marker-descr']}")


def pytest_collection_modifyitems(config, items):
    skipped, selected = [], []
    markers = [m for m in optional_markers if config.getoption(f"--{m}")]
    empty = not markers
    for item in items:
        if empty and any(m in item.keywords for m in optional_markers):
            skipped.append(item)
        elif empty:
            selected.append(item)
        elif any(m in item.keywords for m in markers):
            selected.append(item)
        else:
            skipped.append(item)

    config.hook.pytest_deselected(items=skipped)
    items[:] = selected
