# AN Events Listing — Claude Notes

## Project Overview
Embeddable events listing widget for Action Network. Fetches upcoming events via the Action Network API, supports multiple named listings with filters, and embeds on external websites via `<iframe>`.

## File Structure
```
AN_events_listing/
├── api/events.js              # Serverless function (Netlify/Vercel) — caching proxy
├── netlify/functions/events.js # Netlify entry point (re-exports from api/)
├── config/listings.json       # Named listing definitions with filters
├── embed/
│   ├── index.html             # Embed page — reads ?listing= param
│   └── style.css              # Self-contained responsive styles
├── scripts/fetch-events.js    # Core fetch logic + CLI tool
├── .github/workflows/
│   └── fetch-events.yml       # GitHub Action: fetches every 5 min, writes data/
├── data/                      # Generated JSON files (GitHub Pages mode)
├── netlify.toml               # Netlify build + redirect config
├── package.json               # ESM, node-fetch dep
└── .env.example               # API key template
```

## Architecture

**Two deployment modes:**
1. **Netlify/Vercel (serverless)**: `embed/index.html` calls `/api/events?listing=X`. The serverless function caches responses in memory for 5 minutes and proxies to Action Network API.
2. **GitHub Pages (static)**: A GitHub Action runs every 5 min, calls `node scripts/fetch-events.js --all`, writes `data/{listing}.json`. The embed page loads `../data/{listing}.json` directly.

## Key Conventions
- **ESM throughout** (`"type": "module"` in package.json). All files use `import`/`export`.
- **No build step** — vanilla JS embed, no bundler.
- **API key is server-side only** — never exposed to the embed page.
- **Caching**: serverless function caches in-process (Map), 5-min TTL. GitHub Pages mode caches via git commit.

## Environment Variables
- `ACTION_NETWORK_API_KEY` — required. Set in:
  - Local: `.env` file (not committed)
  - Netlify: site environment variables
  - Vercel: project environment variables
  - GitHub Actions: repository secret named `ACTION_NETWORK_API_KEY`

## Config: config/listings.json
Add named listings here. Each listing has:
- `title` — display name shown in embed header
- `filters` — optional object with:
  - `event_campaign_id` — Action Network campaign UUID (uses campaign events endpoint)
  - `tags` — array of tag strings (AND logic)
  - `limit` — max events to return

## Action Network API Notes
- Base: `https://actionnetwork.org/api/v2/events?page=N`
- Campaign-specific: `https://actionnetwork.org/api/v2/event_campaigns/{id}/events?page=N`
- Auth: `OSDI-API-Token: {key}` header
- Pagination: `total_pages` field, max 25 per page
- Future-filtering done client-side (after fetch): `start_date >= today`
- Tags may appear in `event.tags` array

## Embedding on Host Sites
```html
<iframe src="https://your-site.netlify.app/embed/?listing=canvasses"
        width="100%" height="600" frameborder="0"
        style="border:none;"></iframe>
```
URL params:
- `listing` — listing name from config
- `tags` — comma-separated tag override
- `limit` — max events
- `campaign` — campaign ID override

## Local Development
```bash
cp .env.example .env
# edit .env with your API key

npm install

# Test fetch script
node scripts/fetch-events.js
node scripts/fetch-events.js --listing canvasses
node scripts/fetch-events.js --all

# Run locally with Netlify Dev (serves /api/events + /embed/)
npm run dev
# then open http://localhost:8888/embed/?listing=all-upcoming
```
