// Live FlockFantasy expert-average rookie rankings (superflex hybrid).
// Reads FLOCK_TOKEN from Vercel env vars. Tokens last ~24h so this will
// 401 once a day and need a re-paste; the frontend surfaces the error
// when that happens.

const FLOCK_URL =
  "https://api.flockfantasy.com/rankings" +
  "?format=SUPERFLEX&pickType=hybrid&year=2025" +
  "&deltaRankType=overall&deltaFormat=DYNASTY&deltaSubformat=SUPERFLEX";

function normalizeName(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[’‘ʼ]/g, "'")
    .replace(/[.,'`]/g, "")
    .replace(/\s+jr\b|\s+sr\b|\s+ii\b|\s+iii\b|\s+iv\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

let cache = null;
let cacheAt = 0;
const TTL_MS = 5 * 60 * 1000;  // 5 min — refresh moderately

export default async function handler(req, res) {
  const token = process.env.FLOCK_TOKEN;
  if (!token) {
    res.status(500).json({ error: "FLOCK_TOKEN env var not set on Vercel" });
    return;
  }
  if (cache && Date.now() - cacheAt < TTL_MS) {
    res.setHeader("Cache-Control", "s-maxage=300");
    res.json(cache);
    return;
  }
  try {
    const r = await fetch(FLOCK_URL, {
      headers: {
        Authorization: "Bearer " + token,
        Origin: "https://flockfantasy.com",
        "User-Agent": "Mozilla/5.0 draft-picks-bot",
      },
    });
    if (!r.ok) {
      res.status(r.status).json({ error: "Flock HTTP " + r.status });
      return;
    }
    const body = await r.json();
    if (body.statusCode && body.statusCode >= 400) {
      res.status(400).json({ error: "Flock error", detail: body.body || body });
      return;
    }
    const rookies = (body.data || [])
      .filter(p => p.isRookie && p.position && p.averageRank != null)
      .map(p => ({
        name: p.playerName,
        normName: normalizeName(p.playerName),
        position: p.position,
        team: p.team || null,
        averageRank: p.averageRank,
        overallAverageRank: p.overallAverageRank,
        rookie: true,
      }))
      .sort((a, b) => a.averageRank - b.averageRank);
    rookies.forEach((p, i) => { p.rookieRank = i + 1; });

    cache = {
      players: rookies,
      subscribed: !!body.subscribed,
      year: body.year,
      updated: Date.now(),
    };
    cacheAt = Date.now();
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");
    res.json(cache);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
