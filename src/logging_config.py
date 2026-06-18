import json
import logging
import logging.handlers
import pathlib
import time

LOG_DIR = pathlib.Path(__file__).resolve().parent.parent / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        obj = {
            "ts": round(record.created, 3),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            obj["exc"] = self.formatException(record.exc_info)
        return json.dumps(obj, ensure_ascii=False)


def setup_logging(level: int = logging.INFO) -> logging.Logger:
    root = logging.getLogger()
    root.setLevel(level)
    root.handlers.clear()

    console = logging.StreamHandler()
    console.setLevel(level)
    console.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s", datefmt="%H:%M:%S"))
    root.addHandler(console)

    file_handler = logging.handlers.RotatingFileHandler(
        LOG_DIR / "aurora.log",
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setLevel(level)
    file_handler.setFormatter(JSONFormatter())
    root.addHandler(file_handler)

    return logging.getLogger("aurora")
