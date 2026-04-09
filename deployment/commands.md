# Deployment Guide

For the GitHub + Vercel frontend launch flow, use:

- `deployment/git-vercel-launch.md`

## Project Layout

```text
nfl-cloudrun-firebase/
  backend/
  frontend/
  deployment/
```

## Auth Preflight

```powershell
gh auth status
vercel whoami
gcloud auth list
gcloud config get-value project
```

If any of those are not ready:

```powershell
gh auth login
vercel login
gcloud auth login
gcloud config set project YOUR_GCP_PROJECT_ID
```

## Backend Local Run

```powershell
cd backend
copy .env.example .env
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\uvicorn main:app --host 0.0.0.0 --port 8080
```

Health check:

```powershell
curl http://localhost:8080/health
```

## Frontend Local Run

```powershell
cd frontend
copy .env.local.example .env.local
npm install
npm run dev
```

The frontend expects:

```text
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_API_TIMEOUT_MS=12000
```

Useful API routes for local smoke tests:

```text
/health
/overview?season=2025&team=KC
/team/KC/summary?season=2025
/ngs/leaders?stat_type=passing&season=2025
```

## Docker Build

```powershell
cd backend
docker build -t nfl-analytics-api .
```

Run it locally:

```powershell
docker run --rm -p 8080:8080 -e NFL_SEASONS=2024,2025 nfl-analytics-api
```

## Google Cloud Run Deploy

```powershell
gcloud config set project YOUR_GCP_PROJECT_ID
cd backend
gcloud builds submit --tag gcr.io/YOUR_GCP_PROJECT_ID/nfl-analytics-api
```

Deploy:

```powershell
gcloud run deploy nfl-analytics-api `
  --image gcr.io/YOUR_GCP_PROJECT_ID/nfl-analytics-api `
  --platform managed `
  --region us-central1 `
  --allow-unauthenticated `
  --port 8080 `
  --memory 1Gi `
  --cpu 1 `
  --max-instances 3 `
  --set-env-vars DATA_SOURCE=public,PUBLIC_DATA_SOURCE=nfl_data_py,NFL_SEASONS=2024,2025,NFL_CACHE_PATH=/tmp/nfl-analytics/plays.parquet,PBP_URL_TEMPLATE=https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{season}.parquet,GAMES_URL=https://github.com/nflverse/nflverse-data/releases/download/schedules/games.parquet,TEAMS_URL=https://github.com/nflverse/nflverse-data/releases/download/teams/teams_colors_logos.parquet,ROSTERS_URL_TEMPLATE=https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_{season}.parquet,SNAP_COUNTS_URL_TEMPLATE=https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_{season}.parquet,NGS_URL_TEMPLATE=https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/ngs_{stat_type}.parquet,LOAD_AUXILIARY_DATA=true,LOAD_NGS=true,ALLOWED_ORIGINS=http://localhost:3000,https://YOUR_VERCEL_PROD_DOMAIN,ALLOW_ORIGIN_REGEX=https://.*\\.vercel\\.app
```

If you want to override public loading with your own local file, use:

```powershell
--set-env-vars DATA_PATH=/app/data/plays.parquet
```

## Vercel Frontend Deploy

```powershell
cd frontend
npm install
npx vercel
```

Set the backend URL in Vercel:

```text
NEXT_PUBLIC_API_URL=https://YOUR_CLOUD_RUN_URL
```

For production:

```powershell
npm run build
npx vercel --prod
```

Or connect the GitHub repository in Vercel and set the project root directory to `frontend`.

## Optional Local Data Override

If you ever want to bypass public loading, place a local file at:

```text
backend/data/plays.parquet
```
Then rebuild and redeploy the backend image.
