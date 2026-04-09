const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const API_TIMEOUT_MS = resolveTimeoutMs(process.env.NEXT_PUBLIC_API_TIMEOUT_MS);

function resolveTimeoutMs(value) {
  const parsed = Number(value || 12000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 12000;
}

function buildUrl(path, params = {}) {
  const url = new URL(path, API_URL.endsWith("/") ? API_URL : `${API_URL}/`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function request(path, params = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(buildUrl(path, params), {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });

    if (!response.ok) {
      let message = `Request failed with status ${response.status}`;
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const payload = await response.json().catch(() => null);
        message = payload?.detail || payload?.message || message;
      } else {
        const text = await response.text();
        if (text) {
          message = text;
        }
      }

      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${API_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getHealth() {
  return request("/health");
}

export function getOverview({ season, team } = {}) {
  return request("/overview", { season, team });
}

export function getGames({ season, week, team, limit = 100, offset = 0 } = {}) {
  return request("/games", { season, week, team, limit, offset });
}

export function getGame(gameId) {
  return request(`/game/${encodeURIComponent(gameId)}`);
}

export function getPlays(gameId, limit) {
  return request("/plays", { game_id: gameId, limit });
}

export function getTeamPlays(team, season, limit = 200) {
  return request(`/team/${encodeURIComponent(team)}/plays`, { season, limit });
}

export function getTeamSummary(team, season) {
  return request(`/team/${encodeURIComponent(team)}/summary`, { season });
}

export function getNgsLeaders({ statType, season, team, limit = 8, metric } = {}) {
  return request("/ngs/leaders", { stat_type: statType, season, team, limit, metric });
}

export function searchPlays(query, limit = 50) {
  return request("/search", { q: query, limit });
}
