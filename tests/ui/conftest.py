import asyncio

import pytest


@pytest.fixture(autouse=True)
def ioloop_setup():
    try:
        asyncio.get_event_loop()
    except (RuntimeError, DeprecationWarning):
        asyncio.set_event_loop(asyncio.new_event_loop())
