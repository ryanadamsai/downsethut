No production NFL data is committed in this repository.

By default, the backend hydrates itself from public upstream URLs for the
`nfl_data_py` / nflverse play-by-play releases, then caches the normalized
data locally. It also caches auxiliary public datasets such as schedules,
team metadata, rosters, snap counts, and NGS parquet files in the `cache/`
subdirectory when those features are enabled.

That keeps production on current Python versions without committing data files
or relying on the archived `nfl_data_py` package at runtime.

If you want a local override for development, place your own cleaned dataset here as one of:

- `plays.parquet`
- `plays.csv`
- `plays.json`

The backend will prefer `DATA_PATH` when set, and otherwise fall back to the first matching file in this folder before using public loading.
