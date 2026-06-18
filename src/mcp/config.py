import pathlib
import tomllib

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
CONFIG_PATH = ROOT / "config" / "mcp.toml"


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return {"mcp": {"server": {"enabled": True}, "external": {}}}
    with CONFIG_PATH.open("rb") as fh:
        return tomllib.load(fh)


def external_servers() -> list[dict]:
    data = load_config().get("mcp", {}).get("external", {})
    return [
        {"id": key, **value}
        for key, value in sorted(data.items())
        if isinstance(value, dict)
    ]
