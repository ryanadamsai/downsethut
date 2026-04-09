# Git + Vercel Launch Guide

## Recommended Deployment Shape

- Git provider: GitHub
- Frontend hosting: Vercel
- Backend hosting: Google Cloud Run

This app is intentionally split this way:

- Vercel is excellent for the Next.js frontend and Git-based preview deployments.
- Cloud Run is the better fit for the FastAPI backend because the API loads the dataset on startup and benefits from a long-lived container.

## 1. Preflight Auth and Tooling

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

If anything is missing:

```powershell
gh auth login
vercel login
gcloud auth login
gcloud config set project YOUR_GCP_PROJECT_ID
```

## 2. Initialize Git

```powershell
git init
git add .
git commit -m "Initial NFL analytics app"
```

## 3. Create a GitHub Repo and Push

```powershell
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/nfl-cloudrun-firebase.git
git push -u origin main
```

## 4. Deploy the Backend First

The frontend needs a live API URL.

From:

```text
backend/
```

Run:

```powershell
gcloud config set project YOUR_GCP_PROJECT_ID
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
  --set-env-vars DATA_SOURCE=public,PUBLIC_DATA_SOURCE=nfl_data_py,NFL_SEASONS=2024,2025,NFL_CACHE_PATH=/tmp/nfl-analytics/plays.parquet,PBP_URL_TEMPLATE=https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{season}.parquet,GAMES_URL=https://github.com/nflverse/nflverse-data/releases/download/schedules/games.parquet,TEAMS_URL=https://github.com/nflverse/nflverse-data/releases/download/teams/teams_colors_logos.parquet,ROSTERS_URL_TEMPLATE=https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_{season}.parquet,SNAP_COUNTS_URL_TEMPLATE=https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_{season}.parquet,NGS_URL_TEMPLATE=https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/ngs_{stat_type}.parquet,REMOTE_DATA_TIMEOUT_SECONDS=20,LOAD_AUXILIARY_DATA=true,LOAD_NGS=true,ALLOWED_ORIGINS=http://localhost:3000,ALLOW_ORIGIN_REGEX=https://.*\\.vercel\\.app
```

After deploy, copy the Cloud Run URL:

```text
https://YOUR_CLOUD_RUN_SERVICE_URL
```

## 5. Import the Frontend into Vercel

In Vercel:

1. Click `Add New Project`
2. Import the GitHub repository
3. Set the project Root Directory to:

```text
frontend
```

4. Framework preset should resolve to `Next.js`
5. Leave the install and build commands at the defaults or use the values in `frontend/vercel.json`

## 6. Configure Vercel Environment Variables

In the Vercel project settings, add:

```text
NEXT_PUBLIC_API_URL=https://YOUR_CLOUD_RUN_SERVICE_URL
NEXT_PUBLIC_API_TIMEOUT_MS=12000
```

Add it for:

- Production
- Preview
- Development

## 7. Trigger the First Vercel Deploy

Once the environment variable is set:

- redeploy from the Vercel dashboard
- or push a new commit to GitHub

Every push to GitHub will then create:

- a production deploy on your production branch
- preview deploys for pull requests and feature branches

## 8. Backend CORS for Vercel

This repo already supports:

- `ALLOWED_ORIGINS`
- `ALLOW_ORIGIN_REGEX`

For Vercel preview URLs, use:

```text
ALLOW_ORIGIN_REGEX=https://.*\.vercel\.app
```

For a stable custom domain, also add it to `ALLOWED_ORIGINS`.

Example:

```text
ALLOWED_ORIGINS=http://localhost:3000,https://app.yourdomain.com
ALLOW_ORIGIN_REGEX=https://.*\.vercel\.app
```

## 9. Useful Git Commands

```powershell
git status
git add .
git commit -m "Update frontend filters"
git push
```

Vercel will redeploy automatically after `git push`.

## 10. Pre-Launch Checklist

- Backend health endpoint responds: `/health`
- Overview endpoint responds: `/overview`
- `NEXT_PUBLIC_API_URL` points to the live Cloud Run URL
- `NEXT_PUBLIC_API_TIMEOUT_MS` is set to a sane value like `12000`
- Vercel Root Directory is set to `frontend`
- Cloud Run CORS allows Vercel preview and production domains
- `NFL_SEASONS` is set to the season range you want to expose
- `LOAD_AUXILIARY_DATA=true` and `LOAD_NGS=true` if you want the full playground experience
- Frontend loads `/` and `/game/[game_id]` correctly

## 11. Fastest Safe Launch Path

1. Push repo to GitHub
2. Deploy backend to Cloud Run
3. Import frontend into Vercel with root directory `frontend`
4. Set `NEXT_PUBLIC_API_URL`
5. Redeploy frontend
