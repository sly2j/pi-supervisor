"""Plugin registry: plugins register a name and a factory, hosts look them up."""

_PLUGINS = {}
_ORDER = []


class DuplicatePlugin(Exception):
    pass


def register(name, priority=0):
    """Decorator: register the factory under `name`; higher priority loads first."""

    def wrap(factory):
        if name in _PLUGINS:
            raise DuplicatePlugin(name)
        _PLUGINS[name] = (priority, factory)
        _ORDER.append(name)
        _ORDER.sort(key=lambda n: -_PLUGINS[n][0])
        return factory

    return wrap


def get(name):
    """Return a new plugin instance, or raise KeyError."""
    return _PLUGINS[name][1]()


def names():
    """Registered names, highest priority first."""
    return list(_ORDER)


def unregister(name):
    _PLUGINS.pop(name, None)
    if name in _ORDER:
        _ORDER.remove(name)


def clear():
    _PLUGINS.clear()
    _ORDER.clear()


def describe():
    return {n: _PLUGINS[n][0] for n in _ORDER}
