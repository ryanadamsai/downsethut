const SCORE_KEY = "snake:2026:world-high-score";

function getStoreConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

  if (!url || !token) {
    return null;
  }

  return {
    url: url.replace(/\/$/, ""),
    token
  };
}

async function runCommand(command) {
  const store = getStoreConfig();
  if (!store) {
    return { available: false, result: null };
  }

  const response = await fetch(store.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${store.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  if (!response.ok) {
    throw new Error(`Store request failed with ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error);
  }

  return {
    available: true,
    result: payload.result
  };
}

async function getHighScore() {
  const response = await runCommand(["GET", SCORE_KEY]);
  const parsed = Number.parseInt(response.result ?? "0", 10);

  return {
    available: response.available,
    score: Number.isFinite(parsed) ? parsed : 0
  };
}

async function updateHighScore(score) {
  const current = await getHighScore();
  if (!current.available) {
    return current;
  }

  const nextScore = Math.max(current.score, score);
  if (nextScore > current.score) {
    await runCommand(["SET", SCORE_KEY, String(nextScore)]);
  }

  return {
    available: true,
    score: nextScore
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      const response = await getHighScore();
      res.status(200).json(response);
      return;
    }

    if (req.method === "POST") {
      const score = Number.parseInt(req.body?.score, 10);
      if (!Number.isFinite(score) || score < 0) {
        res.status(400).json({ error: "Invalid score." });
        return;
      }

      const response = await updateHighScore(score);
      res.status(200).json(response);
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    res.status(200).json({
      available: false,
      score: null,
      error: error instanceof Error ? error.message : "Unexpected error."
    });
  }
}
