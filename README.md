# Have You Breathed Presidential Air?

A plain HTML site with a tiny Node.js server. No dependencies to install.
Hosted on GoDaddy Node.js Hosting, deployed from GitHub.

## Files
- `index.html` – the whole site
- `privacy.html` – privacy page (required for AdSense)
- `ads.txt` – AdSense ownership file
- `server.js` – serves the pages and `/api/briefing` (news jokes, the President's location, White House visitors; cached 3 hours)
- `package.json` – tells GoDaddy to run `npm start`

## Your API key
Add an environment variable in GoDaddy's app settings:
`ANTHROPIC_API_KEY` = your key from console.anthropic.com

Never put the key in this repository. Without it the site still works, using built-in jokes and assuming the President is at the White House.

## Test locally (optional)
`npm start`, then open http://localhost:3000
