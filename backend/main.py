from __future__ import annotations

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from data_loader import NFLDataStore

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    store = NFLDataStore()
    store.load()
    app.state.store = store
    yield


app = FastAPI(
    title="NFL Analytics API",
    version="0.1.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]
allow_origin_regex = os.getenv("ALLOW_ORIGIN_REGEX")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)


def get_store(request: Request) -> NFLDataStore:
    return request.app.state.store


@app.get("/health")
def health(request: Request):
    return get_store(request).health()


@app.get("/overview")
def overview(
    request: Request,
    season: int | None = Query(default=None),
    team: str | None = Query(default=None),
):
    return get_store(request).get_overview(season=season, team=team)


@app.get("/games")
def list_games(
    request: Request,
    season: int | None = Query(default=None),
    week: int | None = Query(default=None),
    team: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
):
    store = get_store(request)
    games = store.get_games(season=season, week=week, team=team, limit=limit, offset=offset)
    total = store.count_games(season=season, week=week, team=team)
    return {"count": len(games), "total": total, "offset": offset, "games": games}


@app.get("/game/{game_id}")
def game_detail(request: Request, game_id: str):
    store = get_store(request)
    game = store.get_game(game_id)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return {"game": game}


@app.get("/plays")
def list_plays(
    request: Request,
    game_id: str = Query(..., min_length=1),
    limit: int | None = Query(default=None, ge=1, le=2000),
):
    store = get_store(request)
    plays = store.get_plays(game_id=game_id, limit=limit)
    return {"count": len(plays), "plays": plays}


@app.get("/team/{team}/plays")
def team_plays(
    request: Request,
    team: str,
    season: int | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=2000),
):
    store = get_store(request)
    plays = store.get_team_plays(team=team, season=season, limit=limit)
    return {"count": len(plays), "plays": plays}


@app.get("/team/{team}/summary")
def team_summary(
    request: Request,
    team: str,
    season: int | None = Query(default=None),
):
    return {"team": get_store(request).get_team_summary(team=team, season=season)}


@app.get("/ngs/leaders")
def ngs_leaders(
    request: Request,
    stat_type: str = Query(..., min_length=1),
    season: int | None = Query(default=None),
    team: str | None = Query(default=None),
    limit: int = Query(default=8, ge=1, le=50),
    metric: str | None = Query(default=None),
):
    return get_store(request).get_ngs_leaders(stat_type=stat_type, season=season, team=team, limit=limit, metric=metric)


@app.get("/search")
def search(request: Request, q: str = Query(..., min_length=1), limit: int = Query(default=50, ge=1, le=200)):
    store = get_store(request)
    results = store.search(query=q, limit=limit)
    return {"count": len(results), "results": results}
