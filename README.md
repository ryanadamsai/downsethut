# NFL Analytics Web App

Fast, deployable NFL analytics app with:

- `backend/`: FastAPI API that loads cleaned play-by-play data on startup
- `frontend/`: minimal Next.js dashboard for search, filtering, and game-level play feeds
- `deployment/`: launch guides for Cloud Run and Git + Vercel

## Playground Features

- play-by-play search and game drill-down
- schedule-enriched game metadata
- team offense/defense snapshots
- roster and snap-count context
- public Next Gen Stats leaderboards for passing, rushing, and receiving

## Recommended Production Setup

- Backend: Google Cloud Run
- Frontend: Vercel
- Source control: GitHub

This keeps the Python API in an environment that suits startup-loaded data while giving the frontend fast Git-based preview and production deployments.

## Launch Preflight

Before the first push or deploy, verify auth and local builds:

```powershell
gh auth status
vercel whoami
gcloud auth list
gcloud config get-value project
cd backend
.\.venv\Scripts\python -m compileall .
cd ..\frontend
npm run build
```

If GitHub auth is stale, re-run `gh auth login`. If Google Cloud is not set up
yet, run `gcloud auth login` and then `gcloud config set project YOUR_GCP_PROJECT_ID`.

## Local Run

### Backend

```powershell
cd backend
copy .env.example .env
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\uvicorn main:app --host 0.0.0.0 --port 8080
```

By default, the backend now pulls play-by-play data from the public nflverse
release URLs that power `nfl_data_py` style workflows for the seasons listed in
`NFL_SEASONS`, then caches a local parquet for faster restarts. It also pulls
games, team metadata, weekly rosters, snap counts, and NGS datasets by default
so the frontend can behave like a real data playground. No production NFL data
is meant to be committed to Git.

This is intentionally URL-based at runtime instead of depending on the archived
`nfl_data_py` package itself, which keeps the backend compatible with the
current Python 3.12 environment while still using the same free public data.
`REMOTE_DATA_TIMEOUT_SECONDS` can be used to keep startup fetches from hanging too long.

Useful backend endpoints:

- `/health`
- `/overview`
- `/games`
- `/game/{game_id}`
- `/plays?game_id=...`
- `/team/{team}/summary`
- `/team/{team}/plays`
- `/ngs/leaders?stat_type=passing`
- `/search?q=...`

### Frontend

```powershell
cd frontend
copy .env.local.example .env.local
npm install
npm run dev
```

## Git + Vercel Launch

Use this guide:

- [deployment/git-vercel-launch.md](./deployment/git-vercel-launch.md)

## Data Source

Default source:

- public `nfl_data_py` / nflverse play-by-play release URLs
- optional public NGS release URLs when `LOAD_NGS=true` and `NGS_URL_TEMPLATE` is set

Optional local override:

- `backend/data/plays.parquet`
- `backend/data/plays.csv`
- `backend/data/plays.json`

The backend prefers `DATA_PATH` when set, otherwise it uses public loading and
local cache files outside Git.
