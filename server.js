// Tiny web server for the site. No dependencies to install.
// - Serves index.html, privacy.html and ads.txt
// - /api/briefing returns news-based jokes, the President's latest public
//   location, and any publicly announced White House visitor.
//   Cached in memory for 12 hours, so Claude is only asked about twice a day.
//
// Set ANTHROPIC_API_KEY as an environment variable in GoDaddy's app settings.
// Never put the key in this file or anywhere in the GitHub repository.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const CACHE_MS = 12 * 60 * 60 * 1000; // refresh twice a day to keep costs low

// ---------- Static files ----------
const FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/privacy": ["privacy.html", "text/html; charset=utf-8"],
  "/privacy.html": ["privacy.html", "text/html; charset=utf-8"],
  "/ads.txt": ["ads.txt", "text/plain; charset=utf-8"],
};

function serveStatic(pathname, res) {
  const entry = FILES[pathname];
  if (!entry) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Not found. The air here is presidential-free.");
  }
  fs.readFile(path.join(__dirname, entry[0]), (err, data) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      return res.end("Server error");
    }
    res.writeHead(200, { "Content-Type": entry[1], "Cache-Control": "public, max-age=300" });
    res.end(data);
  });
}

// ---------- News briefing ----------
const FALLBACK = { lines: [], whereabouts: null, visitor: null, source: "fallback" };
let cache = null;        // { body, time }
let inFlight = null;     // Promise while a refresh is running
let lastError = null;    // Why the last refresh failed (shown in the fallback, never includes the key)

function buildPrompt(today) {
  return `Today is ${today}. Use web search to check this week's top news involving the President of the United States.

Then write 8 short loading-screen lines (max 90 characters each) for a satirical website that "calculates" the odds a visitor has breathed the same air as the President.

Style: a playful, affectionate parody of his well-known speaking style (superlatives, "tremendous", "many people are saying"). Each line should tie a real, publicly reported topic from this week's news to air, wind, breath, lungs, or weather.

Rules:
- Never present invented words as direct quotes from him or anyone else. Use no quotation marks.
- Make no factual claims beyond what the news actually reports.
- Nothing cruel, crude, or about anyone's health. Keep it light enough for any visitor.

Also find where the President is today, or failing that his most recently reported location, using his public schedule or news reports (for example, the city or venue of his latest event, or where Air Force One last landed). Only report a location the sources state clearly, and give the date it applies to.

Also check whether the President is publicly hosting or meeting a notable visitor at the White House today (for example, a foreign leader, a sports team, or a well-known public figure listed on his public schedule). Only include a meeting that is publicly announced. Give the visitor's name or title as it would appear in a headline, e.g. "the Prime Minister of Japan" or "Elon Musk".

Respond with only JSON, no preamble or code fences:
{"lines": ["..."], "whereabouts": {"name": "city or venue", "lat": 0, "lng": 0, "asOf": "YYYY-MM-DD"}, "visitor": "name or null"}
Use "whereabouts": null if unclear, and "visitor": null if there is no publicly announced White House meeting today.`;
}

async function fetchBriefing() {
  const today = new Date().toISOString().slice(0, 10);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: buildPrompt(today) }],
    }),
    signal: AbortSignal.timeout(75000),
  });
  if (!r.ok) {
    let detail = "";
    try { const e = await r.json(); detail = e && e.error && e.error.message ? e.error.message : ""; } catch (_) {}
    throw new Error(`Anthropic API error ${r.status}${detail ? ": " + detail.slice(0, 200) : ""}`);
  }

  const data = await r.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .replace(/```json|```/g, "");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in response");
  const parsed = JSON.parse(match[0]);

  const lines = Array.isArray(parsed.lines)
    ? parsed.lines
        .filter((l) => typeof l === "string" && l.length > 0 && l.length <= 140)
        .map((l) => l.replace(/["“”]/g, "").trim())
        .slice(0, 10)
    : [];

  let whereabouts = null;
  const w = parsed.whereabouts;
  if (
    w && typeof w.name === "string" &&
    Number.isFinite(w.lat) && Number.isFinite(w.lng) &&
    Math.abs(w.lat) <= 90 && Math.abs(w.lng) <= 180 &&
    !(w.lat === 0 && w.lng === 0)
  ) {
    whereabouts = { name: w.name.slice(0, 80), lat: w.lat, lng: w.lng, asOf: w.asOf || today };
  }

  const visitor =
    typeof parsed.visitor === "string" && parsed.visitor.trim() && parsed.visitor.trim().toLowerCase() !== "null"
      ? parsed.visitor.replace(/["“”]/g, "").trim().slice(0, 80)
      : null;

  return JSON.stringify({ lines, whereabouts, visitor, source: "news", generated: today });
}

function refresh() {
  if (!API_KEY) return Promise.resolve(null);
  if (!inFlight) {
    inFlight = fetchBriefing()
      .then((body) => { cache = { body, time: Date.now() }; lastError = null; return body; })
      .catch((err) => { lastError = err.message; console.error("Briefing refresh failed:", err.message); return null; })
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

async function serveBriefing(res) {
  const send = (body) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=600" });
    res.end(body);
  };
  const fresh = cache && Date.now() - cache.time < CACHE_MS;
  if (fresh) return send(cache.body);
  if (cache) { refresh(); return send(cache.body); }   // serve the old copy while updating
  const body = await refresh();                        // first request after a restart waits
  if (body) return send(body);
  const reason = !API_KEY ? "No ANTHROPIC_API_KEY found. Check the secret's name, then restart or redeploy the app." : (lastError || "Unknown error");
  send(JSON.stringify({ ...FALLBACK, reason }));
}

// ---------- Server ----------
http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      return res.end();
    }
    if (pathname === "/api/briefing") return serveBriefing(res);
    serveStatic(pathname, res);
  })
  .listen(PORT, () => {
    console.log(`Presidential air calculator running on port ${PORT}`);
    refresh(); // warm the cache on startup
  });
