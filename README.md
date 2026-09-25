# Have You Breathed Presidential Air?

A static page plus one serverless function. No build step.

## Deploy
1. Push this folder to a GitHub repo, then import it at vercel.com/new (framework preset: "Other"). Or run `npx vercel` in this folder.
2. In the Vercel project settings, add an environment variable `ANTHROPIC_API_KEY` (from console.anthropic.com) and redeploy.

Without the key the site still works; it just uses the built-in loading lines instead of this week's news.

## How it works
- `index.html` asks for the visitor's location, finds the nearest "presidential air source" (White House, Mar-a-Lago, Bedminster, or the latest publicly reported location from the news), pulls live wind from Open-Meteo (free, no key), and scores distance + wind direction + a little chaos into one of the 10 tiers. Declining location = Tier 1.
- `api/briefing.js` asks Claude (Haiku 4.5, with web search) for fresh news-flavored loading lines. The result is cached at Vercel's edge for 6 hours, so it costs pennies no matter how much traffic you get.

## Tweaking
- Tier copy: the `TIERS` array in `index.html`.
- Difficulty: `Math.exp(-dist / 3000)` controls how fast odds fall off with distance; `cuts` in `tierFor()` sets the tier thresholds.
- Voice of the loading lines: the prompt in `api/briefing.js`.
