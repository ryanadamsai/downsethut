from __future__ import annotations

from collections import OrderedDict
from typing import Any, Hashable

import pandas as pd


class SimpleCache:
    def __init__(self, max_size: int = 256) -> None:
        self.max_size = max_size
        self._data: OrderedDict[Hashable, Any] = OrderedDict()

    def get(self, key: Hashable) -> Any | None:
        if key not in self._data:
            return None
        self._data.move_to_end(key)
        return self._data[key]

    def set(self, key: Hashable, value: Any) -> Any:
        self._data[key] = value
        self._data.move_to_end(key)
        while len(self._data) > self.max_size:
            self._data.popitem(last=False)
        return value

    def clear(self) -> None:
        self._data.clear()


def normalize_team_code(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip().upper()
    return text or None


def clean_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    if frame.empty:
        return []
    safe = frame.where(pd.notnull(frame), None)
    return safe.to_dict(orient="records")
