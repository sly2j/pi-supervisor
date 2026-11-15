"""Plugin loader: finds plugin modules in a directory and imports them so they register."""

import importlib.util
import pathlib

import registry


def discover(directory):
    """Paths of `plugin_*.py` files in the directory, sorted by name."""
    return sorted(pathlib.Path(directory).glob("plugin_*.py"))


def load_file(path):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # importing runs the @registry.register decorators
    return module


def load_all(directory):
    """Import every discovered plugin; return the registered names."""
    for path in discover(directory):
        try:
            load_file(path)
        except registry.DuplicatePlugin:
            continue
    return registry.names()
