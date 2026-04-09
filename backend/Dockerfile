FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    DATA_SOURCE=public \
    PUBLIC_DATA_SOURCE=nfl_data_py \
    NFL_SEASONS=2024,2025 \
    NFL_CACHE_PATH=/tmp/nfl-analytics/plays.parquet \
    PBP_URL_TEMPLATE=https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{season}.parquet \
    GAMES_URL=https://github.com/nflverse/nflverse-data/releases/download/schedules/games.parquet \
    TEAMS_URL=https://github.com/nflverse/nflverse-data/releases/download/teams/teams_colors_logos.parquet \
    ROSTERS_URL_TEMPLATE=https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_{season}.parquet \
    SNAP_COUNTS_URL_TEMPLATE=https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_{season}.parquet \
    NGS_URL_TEMPLATE=https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/ngs_{stat_type}.parquet \
    LOAD_AUXILIARY_DATA=true \
    LOAD_NGS=true

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py data_loader.py utils.py ./
COPY data ./data

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
