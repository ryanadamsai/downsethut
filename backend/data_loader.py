from __future__ import annotations

import json
import logging
import os
from datetime import date
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.request import urlopen

import pandas as pd

from utils import SimpleCache, clean_records, normalize_team_code

LOGGER = logging.getLogger(__name__)

COLUMN_ALIASES: dict[str, list[str]] = {
    "game_id": ["game_id", "gameId", "gid"],
    "season": ["season", "year"],
    "week": ["week"],
    "team_offense": ["team_offense", "posteam", "offense_team", "team"],
    "team_defense": ["team_defense", "defteam", "defense_team", "opp_team"],
    "play_type": ["play_type", "type"],
    "description": ["description", "desc", "play_text", "play_description"],
    "epa": ["EPA", "epa", "expected_points_added"],
    "down": ["down"],
    "distance": ["distance", "ydstogo", "yards_to_go"],
    "yards_gained": ["yards_gained", "gain", "yards"],
    "timestamp": ["timestamp", "time", "clock", "game_seconds_remaining"],
}

EXPECTED_COLUMNS = [
    "game_id",
    "season",
    "week",
    "team_offense",
    "team_defense",
    "play_type",
    "description",
    "epa",
    "down",
    "distance",
    "yards_gained",
    "timestamp",
]

INTERNAL_PLAY_COLUMNS = EXPECTED_COLUMNS + ["play_index", "search_text"]
PUBLIC_PBP_COLUMNS = [
    "game_id",
    "season",
    "week",
    "posteam",
    "defteam",
    "play_type",
    "desc",
    "epa",
    "down",
    "ydstogo",
    "yards_gained",
    "game_seconds_remaining",
]

GAME_COLUMNS = [
    "game_id",
    "season",
    "week",
    "teams",
    "play_count",
    "teams_key",
    "game_type",
    "gameday",
    "gametime",
    "away_team",
    "home_team",
    "away_score",
    "home_score",
    "total",
    "spread_line",
    "location",
    "stadium",
    "roof",
    "surface",
    "away_qb_name",
    "home_qb_name",
]

DEFAULT_NGS_TYPES = ("passing", "rushing", "receiving")
NGS_DEFAULT_METRICS: dict[str, tuple[str, str]] = {
    "passing": ("pass_yards", "Pass Yards"),
    "rushing": ("rush_yards_over_expected", "Rush Yards Over Expected"),
    "receiving": ("yards", "Receiving Yards"),
}

NGS_AGGREGATIONS: dict[str, dict[str, str]] = {
    "passing": {
        "attempts": "sum",
        "pass_yards": "sum",
        "pass_touchdowns": "sum",
        "interceptions": "sum",
        "completions": "sum",
        "completion_percentage": "mean",
        "passer_rating": "mean",
        "avg_time_to_throw": "mean",
        "avg_completed_air_yards": "mean",
        "avg_intended_air_yards": "mean",
        "aggressiveness": "mean",
        "max_completed_air_distance": "max",
    },
    "rushing": {
        "rush_attempts": "sum",
        "rush_yards": "sum",
        "rush_touchdowns": "sum",
        "avg_rush_yards": "mean",
        "efficiency": "mean",
        "expected_rush_yards": "sum",
        "rush_yards_over_expected": "sum",
        "percent_attempts_gte_eight_defenders": "mean",
    },
    "receiving": {
        "targets": "sum",
        "receptions": "sum",
        "yards": "sum",
        "rec_touchdowns": "sum",
        "catch_percentage": "mean",
        "avg_cushion": "mean",
        "avg_separation": "mean",
        "avg_intended_air_yards": "mean",
        "percent_share_of_intended_air_yards": "mean",
        "avg_yac": "mean",
        "avg_expected_yac": "mean",
        "avg_yac_above_expectation": "mean",
    },
}

NGS_DISPLAY_COLUMNS: dict[str, list[str]] = {
    "passing": ["pass_yards", "pass_touchdowns", "passer_rating", "avg_time_to_throw", "aggressiveness"],
    "rushing": [
        "rush_yards",
        "rush_touchdowns",
        "rush_yards_over_expected",
        "efficiency",
        "percent_attempts_gte_eight_defenders",
    ],
    "receiving": ["yards", "targets", "receptions", "avg_separation", "avg_yac_above_expectation"],
}


def _parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_float(value: str | None, default: float) -> float:
    if value is None:
        return default
    try:
        parsed = float(value)
    except ValueError:
        return default
    return parsed if parsed > 0 else default


def _parse_csv_list(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _default_public_years() -> list[int]:
    today = date.today()
    active_season = today.year if today.month >= 8 else today.year - 1
    return sorted({max(1999, active_season - 1), max(1999, active_season)})


def _parse_years(value: str | None) -> list[int]:
    if not value:
        return _default_public_years()
    years: set[int] = set()
    for piece in value.split(","):
        text = piece.strip()
        if text:
            years.add(int(text))
    return sorted(year for year in years if year >= 1999) or _default_public_years()


def _safe_float(value: Any, digits: int = 3) -> float | None:
    if value is None or pd.isna(value):
        return None
    return round(float(value), digits)


class NFLDataStore:
    def __init__(self, data_path: str | None = None) -> None:
        self.data_path = data_path or os.getenv("DATA_PATH")
        self.data_source = os.getenv("DATA_SOURCE", "auto").strip().lower()
        self.public_provider = os.getenv("PUBLIC_DATA_SOURCE", "nfl_data_py").strip().lower()
        self.public_years = _parse_years(os.getenv("NFL_SEASONS"))
        self.public_columns = _parse_csv_list(os.getenv("NFL_PBP_COLUMNS")) or PUBLIC_PBP_COLUMNS
        self.pbp_url_template = os.getenv(
            "PBP_URL_TEMPLATE",
            "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{season}.parquet",
        )
        self.remote_timeout_seconds = _parse_float(os.getenv("REMOTE_DATA_TIMEOUT_SECONDS"), default=20.0)
        self.games_url = os.getenv(
            "GAMES_URL",
            "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.parquet",
        )
        self.teams_url = os.getenv(
            "TEAMS_URL",
            "https://github.com/nflverse/nflverse-data/releases/download/teams/teams_colors_logos.parquet",
        )
        self.rosters_url_template = os.getenv(
            "ROSTERS_URL_TEMPLATE",
            "https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_{season}.parquet",
        )
        self.snap_counts_url_template = os.getenv(
            "SNAP_COUNTS_URL_TEMPLATE",
            "https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_{season}.parquet",
        )
        self.ngs_url_template = os.getenv(
            "NGS_URL_TEMPLATE",
            "https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/ngs_{stat_type}.parquet",
        )
        self.refresh_public_data = _parse_bool(os.getenv("REFRESH_PUBLIC_DATA"), default=False)
        self.load_auxiliary_data = _parse_bool(os.getenv("LOAD_AUXILIARY_DATA"), default=True)
        self.load_ngs = _parse_bool(os.getenv("LOAD_NGS"), default=True)
        self.ngs_types = _parse_csv_list(os.getenv("NGS_STAT_TYPES")) or list(DEFAULT_NGS_TYPES)
        self.cache_path = self._resolve_cache_path(os.getenv("NFL_CACHE_PATH"))
        self.ngs_years = [season for season in self.public_years if season >= 2016]
        self.loaded = False
        self.data_error: str | None = None
        self.resolved_path: str | None = None
        self.active_source = "uninitialized"
        self.engine = "pandas"
        self.cache = SimpleCache(max_size=512)
        self.plays = pd.DataFrame(columns=INTERNAL_PLAY_COLUMNS)
        self.games = pd.DataFrame(columns=GAME_COLUMNS)
        self.schedule_frame = pd.DataFrame()
        self.teams_frame = pd.DataFrame()
        self.rosters_frame = pd.DataFrame()
        self.snap_counts_frame = pd.DataFrame()
        self.ngs_frames: dict[str, pd.DataFrame] = {}

    def load(self) -> None:
        try:
            raw = self._load_frame()
            self.plays = self._standardize_frame(raw)
            if self.active_source == self.public_provider:
                self._write_cache(self.plays)
            self._load_supporting_frames()
            self.games = self._build_games_frame(self.plays, self.schedule_frame)
            self.loaded = True
            self.data_error = None
            self.cache.clear()
            LOGGER.info("Loaded %s plays from %s", len(self.plays), self.resolved_path or self.active_source)
        except Exception as exc:
            self.loaded = False
            self.data_error = f"Failed to load dataset: {exc}"
            LOGGER.exception("Dataset load failed")
            self._set_empty_frames()
            self.cache.clear()

    def _set_empty_frames(self) -> None:
        self.plays = pd.DataFrame(columns=INTERNAL_PLAY_COLUMNS)
        self.games = pd.DataFrame(columns=GAME_COLUMNS)
        self.schedule_frame = pd.DataFrame()
        self.teams_frame = pd.DataFrame()
        self.rosters_frame = pd.DataFrame()
        self.snap_counts_frame = pd.DataFrame()
        self.ngs_frames = {}

    def _resolve_cache_path(self, value: str | None) -> Path:
        if value:
            return Path(value)
        return Path(__file__).resolve().parent / "data" / "cache" / "plays.parquet"

    def _cache_metadata_path(self) -> Path:
        return self.cache_path.with_suffix(f"{self.cache_path.suffix}.meta.json")

    def _dataset_cache_path(self, cache_name: str) -> Path:
        return self.cache_path.parent / cache_name

    def _dataset_metadata_path(self, cache_name: str) -> Path:
        cache_path = self._dataset_cache_path(cache_name)
        return cache_path.with_suffix(f"{cache_path.suffix}.meta.json")

    def _public_cache_signature(self) -> dict[str, Any]:
        return {
            "provider": self.public_provider,
            "seasons": self.public_years,
            "columns": self.public_columns,
            "pbp_url_template": self.pbp_url_template,
        }

    def _metadata_matches(self, cache_path: Path, metadata_path: Path, expected: dict[str, Any]) -> bool:
        if not cache_path.exists() or not metadata_path.exists():
            return False
        try:
            with metadata_path.open("r", encoding="utf-8") as handle:
                metadata = json.load(handle)
        except Exception:
            return False
        return metadata == expected

    def _cache_matches_request(self) -> bool:
        return self._metadata_matches(self.cache_path, self._cache_metadata_path(), self._public_cache_signature())

    def _loaded_seasons(self) -> list[int]:
        if self.plays.empty or "season" not in self.plays.columns:
            return []
        seasons = pd.to_numeric(self.plays["season"], errors="coerce").dropna().astype(int)
        return sorted({season for season in seasons.tolist() if season >= 1999})

    def _resolve_data_path(self) -> Path | None:
        candidates: list[Path] = []
        if self.data_path:
            candidates.append(Path(self.data_path))
        cwd = Path(__file__).resolve().parent
        candidates.extend([cwd / "data" / "plays.parquet", cwd / "data" / "plays.csv", cwd / "data" / "plays.json"])
        for candidate in candidates:
            if candidate.exists():
                return candidate
        return None

    def _load_frame(self) -> pd.DataFrame:
        path = self._resolve_data_path()
        if path and self.data_source != "public":
            self.resolved_path = str(path)
            self.active_source = "file"
            return self._read_frame(path)
        if (
            self.data_source in {"auto", "public", self.public_provider}
            and self._cache_matches_request()
            and not self.refresh_public_data
        ):
            self.resolved_path = str(self.cache_path)
            self.active_source = "cache"
            return self._read_frame(self.cache_path)
        if self.data_source in {"auto", "public", self.public_provider}:
            try:
                return self._load_public_frame()
            except Exception as exc:
                if self._cache_matches_request():
                    LOGGER.warning("Public load failed (%s). Falling back to cache at %s.", exc, self.cache_path)
                    self.resolved_path = str(self.cache_path)
                    self.active_source = "cache-fallback"
                    return self._read_frame(self.cache_path)
                raise
        raise FileNotFoundError("No dataset found. Set DATA_PATH or enable public loading with DATA_SOURCE=public.")

    def _load_public_frame(self) -> pd.DataFrame:
        if self.public_provider not in {"nfl_data_py", "nflverse"}:
            raise ValueError(f"Unsupported PUBLIC_DATA_SOURCE: {self.public_provider}")
        self.active_source = self.public_provider
        self.resolved_path = f"nfl_data_py:{','.join(str(year) for year in self.public_years)}"
        frames = [
            self._read_remote_parquet(self.pbp_url_template.format(season=year), columns=self.public_columns)
            for year in self.public_years
        ]
        return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=self.public_columns)

    def _load_supporting_frames(self) -> None:
        self.schedule_frame = self._load_public_dataset("games.parquet", self.games_url, "games")
        self.teams_frame = self._load_public_dataset("teams_colors_logos.parquet", self.teams_url, "teams")
        if self.load_auxiliary_data:
            self.rosters_frame = self._load_seasonal_public_dataset(
                "roster_weekly", self.rosters_url_template, self.public_years, "weekly rosters"
            )
            self.snap_counts_frame = self._load_seasonal_public_dataset(
                "snap_counts", self.snap_counts_url_template, self.public_years, "snap counts"
            )
        else:
            self.rosters_frame = pd.DataFrame()
            self.snap_counts_frame = pd.DataFrame()
        self.ngs_frames = self._load_ngs_frames() if self.load_ngs else {}

    def _load_public_dataset(self, cache_name: str, url: str, dataset_name: str) -> pd.DataFrame:
        if self.public_provider not in {"nfl_data_py", "nflverse"}:
            return pd.DataFrame()
        signature = {"dataset": dataset_name, "provider": self.public_provider, "url": url}
        try:
            return self._read_remote_parquet_with_cache(cache_name, url, signature)
        except Exception as exc:
            LOGGER.warning("Failed to load %s data: %s", dataset_name, exc)
            return pd.DataFrame()

    def _load_seasonal_public_dataset(
        self,
        dataset_prefix: str,
        url_template: str,
        years: list[int],
        dataset_name: str,
    ) -> pd.DataFrame:
        if self.public_provider not in {"nfl_data_py", "nflverse"}:
            return pd.DataFrame()
        frames: list[pd.DataFrame] = []
        for year in years:
            cache_name = f"{dataset_prefix}_{year}.parquet"
            url = url_template.format(season=year)
            signature = {"dataset": dataset_name, "provider": self.public_provider, "season": year, "url": url}
            try:
                frames.append(self._read_remote_parquet_with_cache(cache_name, url, signature))
            except Exception as exc:
                LOGGER.warning("Failed to load %s for %s: %s", dataset_name, year, exc)
        return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()

    def _load_ngs_frames(self) -> dict[str, pd.DataFrame]:
        if self.public_provider not in {"nfl_data_py", "nflverse"} or not self.ngs_url_template:
            return {}
        frames: dict[str, pd.DataFrame] = {}
        for stat_type in self.ngs_types:
            try:
                frame = self._read_remote_parquet_with_cache(
                    f"ngs_{stat_type}.parquet",
                    self.ngs_url_template.format(stat_type=stat_type),
                    {
                        "dataset": "nextgen_stats",
                        "provider": self.public_provider,
                        "stat_type": stat_type,
                        "url_template": self.ngs_url_template,
                    },
                )
                if self.ngs_years and "season" in frame.columns:
                    frame["season"] = pd.to_numeric(frame["season"], errors="coerce")
                    frame = frame[frame["season"].isin(self.ngs_years)].copy()
                if "team_abbr" in frame.columns:
                    frame["team_abbr"] = frame["team_abbr"].astype(str).str.strip().str.upper()
                frames[stat_type] = frame.reset_index(drop=True)
            except Exception as exc:
                LOGGER.warning("Failed to load NGS %s data: %s", stat_type, exc)
        return frames

    def _read_remote_parquet_with_cache(
        self,
        cache_name: str,
        url: str,
        signature: dict[str, Any],
        columns: list[str] | None = None,
    ) -> pd.DataFrame:
        cache_path = self._dataset_cache_path(cache_name)
        metadata_path = self._dataset_metadata_path(cache_name)
        if not self.refresh_public_data and self._metadata_matches(cache_path, metadata_path, signature):
            return self._read_frame(cache_path)
        try:
            frame = self._read_remote_parquet(url, columns=columns)
            self._write_aux_cache(cache_path, metadata_path, signature, frame)
            return frame
        except Exception:
            if self._metadata_matches(cache_path, metadata_path, signature):
                LOGGER.warning("Falling back to cached auxiliary dataset at %s", cache_path)
                return self._read_frame(cache_path)
            raise

    def _read_remote_parquet(self, url: str, columns: list[str] | None = None) -> pd.DataFrame:
        with urlopen(url, timeout=self.remote_timeout_seconds) as response:
            payload = response.read()
        return pd.read_parquet(BytesIO(payload), columns=columns)

    def _write_cache(self, frame: pd.DataFrame) -> None:
        try:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            frame.to_parquet(self.cache_path, index=False)
            with self._cache_metadata_path().open("w", encoding="utf-8") as handle:
                json.dump(self._public_cache_signature(), handle, indent=2)
        except Exception as exc:
            LOGGER.warning("Unable to write local cache to %s: %s", self.cache_path, exc)

    def _write_aux_cache(
        self,
        cache_path: Path,
        metadata_path: Path,
        signature: dict[str, Any],
        frame: pd.DataFrame,
    ) -> None:
        try:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            frame.to_parquet(cache_path, index=False)
            with metadata_path.open("w", encoding="utf-8") as handle:
                json.dump(signature, handle, indent=2)
        except Exception as exc:
            LOGGER.warning("Unable to write auxiliary cache to %s: %s", cache_path, exc)

    def _read_frame(self, path: Path) -> pd.DataFrame:
        suffix = path.suffix.lower()
        try:
            import polars as pl  # type: ignore

            self.engine = "polars"
            if suffix == ".parquet":
                return pl.read_parquet(path).to_pandas()
            if suffix == ".csv":
                return pl.read_csv(path).to_pandas()
            if suffix == ".json":
                return pl.read_json(path).to_pandas()
        except ImportError:
            self.engine = "pandas"
        if suffix == ".parquet":
            return pd.read_parquet(path)
        if suffix == ".csv":
            return pd.read_csv(path)
        if suffix == ".json":
            try:
                return pd.read_json(path, lines=True)
            except ValueError:
                return pd.read_json(path)
        raise ValueError(f"Unsupported file type: {path.suffix}")

    def _standardize_frame(self, frame: pd.DataFrame) -> pd.DataFrame:
        data = frame.copy()
        renamed: dict[str, str] = {}
        for canonical, aliases in COLUMN_ALIASES.items():
            for alias in aliases:
                if alias in data.columns:
                    renamed[alias] = canonical
                    break
        data = data.rename(columns=renamed)

        for column in EXPECTED_COLUMNS:
            if column not in data.columns:
                data[column] = None

        ordered = data[EXPECTED_COLUMNS].copy().reset_index(drop=True)
        ordered["play_index"] = ordered.index.astype(int)
        ordered["game_id"] = ordered["game_id"].astype(str).str.strip()
        ordered["team_offense"] = ordered["team_offense"].astype(str).str.strip().str.upper()
        ordered["team_defense"] = ordered["team_defense"].astype(str).str.strip().str.upper()
        ordered["play_type"] = ordered["play_type"].astype(str).str.strip().str.lower()
        ordered["description"] = ordered["description"].astype(str).str.strip()
        ordered["timestamp"] = ordered["timestamp"].astype(str).str.strip()

        for numeric_col in ["season", "week", "epa", "down", "distance", "yards_gained"]:
            ordered[numeric_col] = pd.to_numeric(ordered[numeric_col], errors="coerce")

        ordered["season"] = ordered["season"].fillna(0).astype(int)
        ordered["week"] = ordered["week"].fillna(0).astype(int)
        ordered = ordered.replace({"": None, "nan": None, "None": None})
        ordered["search_text"] = (
            ordered["game_id"].fillna("").astype(str)
            + " "
            + ordered["team_offense"].fillna("").astype(str)
            + " "
            + ordered["team_defense"].fillna("").astype(str)
            + " "
            + ordered["description"].fillna("").astype(str)
        ).str.lower()
        return ordered

    def _build_games_frame(self, plays: pd.DataFrame, schedule_frame: pd.DataFrame) -> pd.DataFrame:
        if plays.empty:
            return pd.DataFrame(columns=GAME_COLUMNS)

        rows: list[dict[str, Any]] = []
        for game_id, game_frame in plays.groupby("game_id", sort=False):
            teams = sorted(
                {
                    team
                    for team in pd.concat([game_frame["team_offense"], game_frame["team_defense"]]).dropna().astype(str).tolist()
                    if team and team != "NONE"
                }
            )
            rows.append(
                {
                    "game_id": game_id,
                    "season": int(game_frame["season"].iloc[0]) if not game_frame.empty else 0,
                    "week": int(game_frame["week"].iloc[0]) if not game_frame.empty else 0,
                    "teams": " vs ".join(teams[:2]) if teams else "Unknown",
                    "play_count": int(len(game_frame)),
                    "teams_key": " ".join(teams).lower(),
                }
            )

        games = pd.DataFrame(rows)

        if not schedule_frame.empty and "game_id" in schedule_frame.columns:
            schedules = schedule_frame.copy()
            schedules["game_id"] = schedules["game_id"].astype(str)
            desired_columns = [
                "game_id",
                "game_type",
                "gameday",
                "gametime",
                "away_team",
                "home_team",
                "away_score",
                "home_score",
                "total",
                "spread_line",
                "location",
                "stadium",
                "roof",
                "surface",
                "away_qb_name",
                "home_qb_name",
            ]
            desired_columns = [column for column in desired_columns if column in schedules.columns]
            schedules = schedules[desired_columns].drop_duplicates(subset=["game_id"])
            games = games.merge(schedules, on="game_id", how="left")
            if {"away_team", "home_team"} <= set(games.columns):
                games["teams"] = games.apply(
                    lambda row: (
                        f"{row['away_team']} @ {row['home_team']}"
                        if pd.notna(row.get("away_team")) and pd.notna(row.get("home_team"))
                        else row["teams"]
                    ),
                    axis=1,
                )
                games["teams_key"] = games.apply(
                    lambda row: (
                        f"{str(row.get('away_team', '')).strip()} {str(row.get('home_team', '')).strip()}".lower().strip()
                        if pd.notna(row.get("away_team")) or pd.notna(row.get("home_team"))
                        else row["teams_key"]
                    ),
                    axis=1,
                )

        for column in GAME_COLUMNS:
            if column not in games.columns:
                games[column] = None

        return games[GAME_COLUMNS].sort_values(["season", "week", "game_id"], ascending=[False, False, True]).reset_index(
            drop=True
        )

    def _filter_games_frame(
        self,
        season: int | None = None,
        week: int | None = None,
        team: str | None = None,
    ) -> pd.DataFrame:
        frame = self.games
        team_code = normalize_team_code(team)
        if season is not None:
            frame = frame[frame["season"] == season]
        if week is not None:
            frame = frame[frame["week"] == week]
        if team_code:
            frame = frame[frame["teams_key"].str.contains(team_code.lower(), na=False, regex=False)]
        return frame

    def _filter_play_frame(self, season: int | None = None, team: str | None = None) -> pd.DataFrame:
        frame = self.plays
        team_code = normalize_team_code(team)
        if season is not None:
            frame = frame[frame["season"] == season]
        if team_code:
            frame = frame[(frame["team_offense"] == team_code) | (frame["team_defense"] == team_code)]
        return frame

    def _team_records(self, season: int) -> pd.DataFrame:
        if self.schedule_frame.empty:
            return pd.DataFrame(columns=["team", "wins", "losses", "ties", "record"])

        schedules = self.schedule_frame.copy()
        if "season" in schedules.columns:
            schedules["season"] = pd.to_numeric(schedules["season"], errors="coerce")
            schedules = schedules[schedules["season"] == season]

        completed = schedules.dropna(subset=["home_score", "away_score", "home_team", "away_team"]).copy()
        if completed.empty:
            return pd.DataFrame(columns=["team", "wins", "losses", "ties", "record"])

        completed["home_win"] = (completed["home_score"] > completed["away_score"]).astype(int)
        completed["home_loss"] = (completed["home_score"] < completed["away_score"]).astype(int)
        completed["home_tie"] = (completed["home_score"] == completed["away_score"]).astype(int)
        completed["away_win"] = completed["home_loss"]
        completed["away_loss"] = completed["home_win"]
        completed["away_tie"] = completed["home_tie"]

        home = completed[["home_team", "home_win", "home_loss", "home_tie"]].rename(
            columns={"home_team": "team", "home_win": "wins", "home_loss": "losses", "home_tie": "ties"}
        )
        away = completed[["away_team", "away_win", "away_loss", "away_tie"]].rename(
            columns={"away_team": "team", "away_win": "wins", "away_loss": "losses", "away_tie": "ties"}
        )

        records = pd.concat([home, away], ignore_index=True).groupby("team", as_index=False).sum()
        records["record"] = records.apply(
            lambda row: f"{int(row['wins'])}-{int(row['losses'])}" + (f"-{int(row['ties'])}" if int(row["ties"]) else ""),
            axis=1,
        )
        return records

    def _apply_team_metadata(self, frame: pd.DataFrame, team_column: str) -> pd.DataFrame:
        if frame.empty or self.teams_frame.empty or team_column not in frame.columns:
            return frame
        teams = self.teams_frame.copy()
        if "team_abbr" not in teams.columns:
            return frame
        teams["team_abbr"] = teams["team_abbr"].astype(str).str.strip().str.upper()
        merge_columns = ["team_abbr", "team_name", "team_color", "team_logo_espn", "team_wordmark"]
        merge_columns = [column for column in merge_columns if column in teams.columns]
        enriched = frame.merge(teams[merge_columns], left_on=team_column, right_on="team_abbr", how="left")
        return enriched.drop(columns=["team_abbr"], errors="ignore")

    def _team_summary_frame(self, season: int | None = None) -> pd.DataFrame:
        frame = self.plays if season is None else self.plays[self.plays["season"] == season]
        if frame.empty:
            return pd.DataFrame()

        metrics = frame.copy()
        metrics["epa"] = pd.to_numeric(metrics["epa"], errors="coerce")
        metrics["yards_gained"] = pd.to_numeric(metrics["yards_gained"], errors="coerce")
        metrics["is_success"] = (metrics["epa"].fillna(0) > 0).astype(int)
        metrics["is_explosive"] = (metrics["yards_gained"].fillna(0) >= 20).astype(int)
        metrics["is_pass"] = metrics["play_type"].isin(["pass", "sack"]).astype(int)

        summary = metrics.groupby("team_offense", as_index=False).agg(
            plays=("game_id", "size"),
            games=("game_id", "nunique"),
            epa_per_play=("epa", "mean"),
            success_rate=("is_success", "mean"),
            explosive_rate=("is_explosive", "mean"),
            pass_rate=("is_pass", "mean"),
            avg_yards=("yards_gained", "mean"),
        )
        summary = summary.rename(columns={"team_offense": "team"})
        summary["epa_per_play"] = summary["epa_per_play"].round(3)
        summary["success_rate"] = (summary["success_rate"] * 100).round(1)
        summary["explosive_rate"] = (summary["explosive_rate"] * 100).round(1)
        summary["pass_rate"] = (summary["pass_rate"] * 100).round(1)
        summary["avg_yards"] = summary["avg_yards"].round(1)
        summary = self._apply_team_metadata(summary, "team")

        if season is not None:
            records = self._team_records(season)
            if not records.empty:
                summary = summary.merge(records[["team", "record"]], on="team", how="left")

        return summary.sort_values(["epa_per_play", "plays"], ascending=[False, False]).reset_index(drop=True)

    def _aggregate_ngs_frame(self, stat_type: str, season: int | None = None, team: str | None = None) -> pd.DataFrame:
        frame = self.ngs_frames.get(stat_type)
        if frame is None or frame.empty:
            return pd.DataFrame()

        data = frame.copy()
        if "season" in data.columns:
            data["season"] = pd.to_numeric(data["season"], errors="coerce")
        if season is not None and "season" in data.columns:
            data = data[data["season"] == season]
        if "season_type" in data.columns:
            data = data[data["season_type"].fillna("REG") == "REG"]

        team_code = normalize_team_code(team)
        if team_code and "team_abbr" in data.columns:
            data = data[data["team_abbr"] == team_code]
        if data.empty:
            return pd.DataFrame()

        group_keys = [
            column
            for column in ["season", "team_abbr", "player_display_name", "player_position", "player_gsis_id", "player_short_name"]
            if column in data.columns
        ]
        aggregations = {
            column: method for column, method in NGS_AGGREGATIONS.get(stat_type, {}).items() if column in data.columns
        }
        if not aggregations:
            return pd.DataFrame()
        return data.groupby(group_keys, dropna=False, as_index=False).agg(aggregations).reset_index(drop=True)

    def get_ngs_leaders(
        self,
        stat_type: str,
        season: int | None = None,
        team: str | None = None,
        limit: int = 8,
        metric: str | None = None,
    ) -> dict[str, Any]:
        normalized_type = stat_type.strip().lower()
        default_metric, default_label = NGS_DEFAULT_METRICS.get(normalized_type, ("", "Metric"))
        summary = self._aggregate_ngs_frame(normalized_type, season=season, team=team)
        if summary.empty:
            return {"stat_type": normalized_type, "metric": metric or default_metric, "metric_label": default_label, "leaders": []}

        sort_metric = metric if metric and metric in summary.columns else default_metric
        if sort_metric not in summary.columns:
            numeric_columns = summary.select_dtypes(include=["number"]).columns.tolist()
            sort_metric = numeric_columns[0] if numeric_columns else None
        if not sort_metric:
            return {"stat_type": normalized_type, "metric": None, "metric_label": default_label, "leaders": []}

        summary = self._apply_team_metadata(summary.sort_values(sort_metric, ascending=False).head(limit).copy(), "team_abbr")
        display_columns = [column for column in NGS_DISPLAY_COLUMNS.get(normalized_type, []) if column in summary.columns]
        columns = [
            column
            for column in [
                "season",
                "team_abbr",
                "team_name",
                "team_color",
                "player_display_name",
                "player_short_name",
                "player_position",
                sort_metric,
                *display_columns,
            ]
            if column in summary.columns
        ]
        return {
            "stat_type": normalized_type,
            "metric": sort_metric,
            "metric_label": default_label if sort_metric == default_metric else sort_metric.replace("_", " ").title(),
            "leaders": clean_records(summary[columns]),
        }

    def _snap_leaders(self, team: str, season: int | None = None, limit: int = 8) -> list[dict[str, Any]]:
        team_code = normalize_team_code(team)
        if self.snap_counts_frame.empty or not team_code:
            return []

        snaps = self.snap_counts_frame.copy()
        if "team" in snaps.columns:
            snaps["team"] = snaps["team"].astype(str).str.strip().str.upper()
            snaps = snaps[snaps["team"] == team_code]
        if season is not None and "season" in snaps.columns:
            snaps["season"] = pd.to_numeric(snaps["season"], errors="coerce")
            snaps = snaps[snaps["season"] == season]
        if snaps.empty:
            return []

        for column in ["offense_snaps", "defense_snaps", "st_snaps"]:
            if column in snaps.columns:
                snaps[column] = pd.to_numeric(snaps[column], errors="coerce").fillna(0)
        snaps["total_snaps"] = snaps.get("offense_snaps", 0) + snaps.get("defense_snaps", 0) + snaps.get("st_snaps", 0)
        summary = snaps.groupby(["player", "position"], as_index=False).agg(
            total_snaps=("total_snaps", "sum"),
            offense_snaps=("offense_snaps", "sum"),
            defense_snaps=("defense_snaps", "sum"),
            st_snaps=("st_snaps", "sum"),
        )
        return clean_records(summary.sort_values("total_snaps", ascending=False).head(limit))

    def _roster_snapshot(self, team: str, season: int | None = None, limit: int = 12) -> list[dict[str, Any]]:
        team_code = normalize_team_code(team)
        if self.rosters_frame.empty or not team_code:
            return []

        roster = self.rosters_frame.copy()
        if "team" in roster.columns:
            roster["team"] = roster["team"].astype(str).str.strip().str.upper()
            roster = roster[roster["team"] == team_code]
        if season is not None and "season" in roster.columns:
            roster["season"] = pd.to_numeric(roster["season"], errors="coerce")
            roster = roster[roster["season"] == season]
        if roster.empty:
            return []
        if "week" in roster.columns:
            roster["week"] = pd.to_numeric(roster["week"], errors="coerce")
            latest_week = roster["week"].dropna().max()
            if pd.notna(latest_week):
                roster = roster[roster["week"] == latest_week]

        columns = [column for column in ["full_name", "position", "depth_chart_position", "jersey_number", "status", "college"] if column in roster.columns]
        return clean_records(roster[columns].drop_duplicates().head(limit))

    def get_team_summary(self, team: str, season: int | None = None) -> dict[str, Any]:
        team_code = normalize_team_code(team)
        cache_key = ("team_summary", team_code, season)
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached

        offense = self.plays[self.plays["team_offense"] == team_code].copy()
        defense = self.plays[self.plays["team_defense"] == team_code].copy()
        if season is not None:
            offense = offense[offense["season"] == season]
            defense = defense[defense["season"] == season]

        def _play_metrics(frame: pd.DataFrame) -> dict[str, Any]:
            if frame.empty:
                return {"plays": 0, "games": 0, "epa_per_play": None, "success_rate": None, "explosive_rate": None, "pass_rate": None, "avg_yards": None}
            epa = pd.to_numeric(frame["epa"], errors="coerce")
            yards = pd.to_numeric(frame["yards_gained"], errors="coerce")
            return {
                "plays": int(len(frame)),
                "games": int(frame["game_id"].nunique()),
                "epa_per_play": _safe_float(epa.mean()),
                "success_rate": _safe_float(((epa.fillna(0) > 0).mean()) * 100, digits=1),
                "explosive_rate": _safe_float(((yards.fillna(0) >= 20).mean()) * 100, digits=1),
                "pass_rate": _safe_float((frame["play_type"].isin(["pass", "sack"]).mean()) * 100, digits=1),
                "avg_yards": _safe_float(yards.mean(), digits=1),
            }

        metadata = {"team": team_code}
        if not self.teams_frame.empty and "team_abbr" in self.teams_frame.columns:
            match = self.teams_frame[self.teams_frame["team_abbr"].astype(str).str.upper() == team_code]
            if not match.empty:
                first = match.iloc[0]
                metadata |= {
                    "team_name": first.get("team_name"),
                    "team_color": first.get("team_color"),
                    "team_logo_espn": first.get("team_logo_espn"),
                    "team_wordmark": first.get("team_wordmark"),
                    "conference": first.get("team_conf"),
                    "division": first.get("team_division"),
                }

        record = None
        if season is not None:
            records = self._team_records(season)
            if not records.empty:
                match = records[records["team"] == team_code]
                if not match.empty:
                    record = match.iloc[0]["record"]

        result = {
            **metadata,
            "season": season,
            "record": record,
            "offense": _play_metrics(offense),
            "defense": _play_metrics(defense),
            "snap_leaders": self._snap_leaders(team_code, season=season),
            "roster_spotlight": self._roster_snapshot(team_code, season=season),
            "ngs": {stat_type: self.get_ngs_leaders(stat_type, season=season, team=team_code, limit=5) for stat_type in self.ngs_types},
        }
        return self.cache.set(cache_key, result)

    def get_overview(self, season: int | None = None, team: str | None = None) -> dict[str, Any]:
        team_code = normalize_team_code(team)
        cache_key = ("overview", season, team_code)
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached

        plays = self._filter_play_frame(season=season, team=team_code)
        games = self._filter_games_frame(season=season, team=team_code)
        epa = pd.to_numeric(plays["epa"], errors="coerce")
        yards = pd.to_numeric(plays["yards_gained"], errors="coerce")
        summary = {
            "plays": int(len(plays)),
            "games": int(len(games)),
            "teams": int(pd.concat([plays["team_offense"], plays["team_defense"]]).dropna().astype(str).nunique()) if not plays.empty else 0,
            "seasons": sorted({int(value) for value in plays["season"].unique().tolist() if int(value) > 0}) if not plays.empty else [],
            "avg_epa_per_play": _safe_float(epa.mean()),
            "explosive_rate": _safe_float(((yards.fillna(0) >= 20).mean()) * 100, digits=1) if not plays.empty else None,
            "pass_rate": _safe_float((plays["play_type"].isin(["pass", "sack"]).mean()) * 100, digits=1) if not plays.empty else None,
        }

        team_summary_frame = self._team_summary_frame(season=season)
        if team_code:
            team_summary_frame = team_summary_frame[team_summary_frame["team"] == team_code]

        payload = {
            "summary": summary,
            "top_teams": clean_records(team_summary_frame.head(10)),
            "featured_team": self.get_team_summary(team_code, season=season) if team_code else None,
            "ngs": {stat_type: self.get_ngs_leaders(stat_type, season=season, team=team_code, limit=8) for stat_type in self.ngs_types},
            "data_sources": {
                "plays": self.active_source,
                "ngs": sorted(name for name, frame in self.ngs_frames.items() if not frame.empty),
                "auxiliary": {
                    "games": int(len(self.schedule_frame)),
                    "teams": int(len(self.teams_frame)),
                    "rosters": int(len(self.rosters_frame)),
                    "snap_counts": int(len(self.snap_counts_frame)),
                },
            },
        }
        return self.cache.set(cache_key, payload)

    def health(self) -> dict[str, Any]:
        return {
            "status": "ok" if self.loaded else "degraded",
            "rows": int(len(self.plays)),
            "games": int(len(self.games)),
            "path": self.resolved_path,
            "source": self.active_source,
            "seasons": self.public_years,
            "loaded_seasons": self._loaded_seasons(),
            "cache_path": str(self.cache_path),
            "ngs_datasets": {name: int(len(frame)) for name, frame in self.ngs_frames.items()},
            "auxiliary": {
                "games": int(len(self.schedule_frame)),
                "teams": int(len(self.teams_frame)),
                "rosters": int(len(self.rosters_frame)),
                "snap_counts": int(len(self.snap_counts_frame)),
            },
            "engine": self.engine,
            "error": self.data_error,
        }

    def count_games(self, season: int | None = None, week: int | None = None, team: str | None = None) -> int:
        return int(len(self._filter_games_frame(season=season, week=week, team=team)))

    def get_games(
        self,
        season: int | None = None,
        week: int | None = None,
        team: str | None = None,
        limit: int = 200,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        team_code = normalize_team_code(team)
        cache_key = ("games", season, week, team_code, limit, offset)
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached

        page = self._filter_games_frame(season=season, week=week, team=team).iloc[offset : offset + limit]
        columns = [
            column
            for column in ["game_id", "season", "week", "teams", "play_count", "gameday", "gametime", "away_team", "home_team", "away_score", "home_score", "stadium", "roof"]
            if column in page.columns
        ]
        return self.cache.set(cache_key, clean_records(page[columns]))

    def get_game(self, game_id: str) -> dict[str, Any] | None:
        cache_key = ("game", game_id)
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached

        match = self.games[self.games["game_id"] == game_id]
        if match.empty:
            return None
        columns = [
            column
            for column in ["game_id", "season", "week", "teams", "play_count", "game_type", "gameday", "gametime", "away_team", "home_team", "away_score", "home_score", "total", "spread_line", "location", "stadium", "roof", "surface", "away_qb_name", "home_qb_name"]
            if column in match.columns
        ]
        return self.cache.set(cache_key, clean_records(match[columns].head(1))[0])

    def get_plays(self, game_id: str, limit: int | None = None) -> list[dict[str, Any]]:
        cache_key = ("plays", game_id, limit)
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached

        frame = self.plays[self.plays["game_id"] == game_id].sort_values("play_index")
        if limit is not None:
            frame = frame.head(limit)
        response_frame = frame[["game_id", "season", "week", "team_offense", "team_defense", "play_type", "description", "epa", "down", "distance", "yards_gained", "timestamp"]]
        return self.cache.set(cache_key, clean_records(response_frame))

    def get_team_plays(self, team: str, season: int | None = None, limit: int = 500) -> list[dict[str, Any]]:
        team_code = normalize_team_code(team)
        cache_key = ("team_plays", team_code, season, limit)
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached

        frame = self.plays[(self.plays["team_offense"] == team_code) | (self.plays["team_defense"] == team_code)].sort_values(
            ["season", "week", "play_index"], ascending=[False, False, True]
        )
        if season is not None:
            frame = frame[frame["season"] == season]
        return self.cache.set(cache_key, clean_records(frame.head(limit)))

    def search(self, query: str, limit: int = 50) -> list[dict[str, Any]]:
        normalized_query = (query or "").strip().lower()
        if not normalized_query:
            return []

        cache_key = ("search", normalized_query, limit)
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached

        frame = self.plays[self.plays["search_text"].str.contains(normalized_query, na=False, regex=False)].copy()
        frame = frame.sort_values(["season", "week", "play_index"], ascending=[False, False, True])
        columns = ["game_id", "season", "week", "team_offense", "team_defense", "play_type", "description", "epa", "down", "distance", "yards_gained", "timestamp"]
        return self.cache.set(cache_key, clean_records(frame[columns].head(limit)))
