// Returns news-flavored loading lines (and, if reported, the President's latest
// public whereabouts). Cached at Vercel's edge for 6 hours so the Anthropic API
// is called only a few times a day, no matter how many people visit.

module.exports = async (req, res) => {
  const fallback = { lines: [], whereabouts: null, source: "fallback" };
  const key = process.env.ANTHROPIC_API_KEY;

  if (!key) {
    res.setHeader("Cache-Control", "s-maxage=300");
    return res.status(200).json(fallback);
  }

  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Today is ${today}. Use web search to check this week's top news involving the President of the United States.

Then write 8 short loading-screen lines (max 90 characters each) for a satirical website that "calculates" the odds a visitor has breathed the same air as the President.

Style: a playful, affectionate parody of his well-known speaking style (superlatives, "tremendous", "many people are saying"). Each line should tie a real, publicly reported topic from this week's news to air, wind, breath, lungs, or weather.

Rules:
- Never present invented words as direct quotes from him or anyone else. Use no quotation marks.
- Make no factual claims beyond what the news actually reports.
- Nothing cruel, crude, or about anyone's health. Keep it light enough for any visitor.

Also report his most recently publicly reported location, only if the news states one clearly.

Respond with only JSON, no preamble or code fences:
{"lines": ["..."], "whereabouts": {"name": "city or venue", "lat": 0, "lng": 0, "asOf": "YYYY-MM-DD"} }
Use "whereabouts": null if unclear.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) throw new Error(`Anthropic API ${r.status}`);

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

    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json({ lines, whereabouts, source: "news", generated: today });
  } catch (err) {
    console.error(err);
    res.setHeader("Cache-Control", "s-maxage=300");
    return res.status(200).json(fallback);
  }
};
