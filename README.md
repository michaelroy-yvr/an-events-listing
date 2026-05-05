# AN Events Listing

Embeddable events widget that pulls upcoming events from the [Action Network](https://actionnetwork.org) API. Embed on any website via `<iframe>`.

## How it works

A serverless function acts as a secure proxy between the embed page and the Action Network API. Your API key stays on the server — it is never exposed to visitors. Event data is cached for 5 minutes and refreshed automatically on each request.

```
Visitor → iframe → Netlify Function → Action Network API
```

---

## Deploy to Netlify

### 1. Fork or clone this repo

```bash
git clone https://github.com/YOUR_USERNAME/an-events-listing.git
cd an-events-listing
```

### 2. Push to GitHub

If starting fresh:
```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/an-events-listing.git
git branch -M main
git push -u origin main
```

### 3. Connect to Netlify

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**
2. Choose **GitHub** and select your repository
3. Leave build settings blank (no build command, publish directory = `.`)
4. Click **Deploy site**

### 4. Set your API key

1. In your Netlify site: **Site settings → Environment variables → Add a variable**
2. Key: `ACTION_NETWORK_API_KEY` — Value: your Action Network API key
3. Click **Save**, then go to **Deploys → Trigger deploy** to redeploy with the key active

> Get your API key at: https://actionnetwork.org/docs/v2/#api-keys

### 5. Verify

Open this URL in your browser — it should return JSON with your events:
```
https://YOUR-SITE.netlify.app/.netlify/functions/events?listing=all-upcoming
```

---

## Embed on a website

Paste an `<iframe>` wherever you want events to appear:

```html
<iframe src="https://YOUR-SITE.netlify.app/embed/?listing=all-upcoming"
        width="100%" height="600" frameborder="0" style="border:none;"></iframe>
```

### URL parameters

| Parameter  | Description                              | Example              |
|------------|------------------------------------------|----------------------|
| `listing`  | Named listing from `config/listings.json`| `?listing=canvasses` |
| `tags`     | Comma-separated tag filter               | `?tags=rally,direct-action` |
| `limit`    | Max number of events to show             | `?limit=5`           |
| `campaign` | Action Network event campaign ID         | `?campaign=abc-123`  |

Parameters in the URL override the defaults set in `config/listings.json`.

---

## Configure listings

Edit `config/listings.json` to define named listings with default filters:

```json
{
  "listings": {
    "all-upcoming": {
      "title": "Upcoming Events",
      "filters": {}
    },
    "canvasses": {
      "title": "Canvassing Events",
      "filters": {
        "tags": ["canvass"]
      }
    },
    "campaign-name": {
      "title": "Campaign Events",
      "filters": {
        "event_campaign_id": "your-campaign-uuid-here"
      }
    }
  }
}
```

After editing, commit and push — Netlify redeploys automatically.

---

## Keeping events up to date

**No action needed.** The serverless function fetches live data from Action Network every time the embed loads, with a 5-minute cache. Events are always current without any scheduled jobs or manual refreshes.

If you need to **force a refresh** (e.g. after adding a new event), simply open the function URL in your browser — the cache resets per function instance automatically.

---

## Local development

```bash
cp .env.example .env
# Add your API key to .env

npm install

# Fetch and preview events in the terminal
node --env-file=.env scripts/fetch-events.js
node --env-file=.env scripts/fetch-events.js --listing canvasses
node --env-file=.env scripts/fetch-events.js --all   # writes to data/
```

---

## File structure

```
├── api/events.js              # Serverless function (Netlify/Vercel)
├── config/listings.json       # Listing definitions — edit this
├── embed/
│   ├── index.html             # Embed page
│   └── style.css              # Embed styles
├── scripts/fetch-events.js    # Core fetch logic + CLI tool
├── netlify/functions/events.js
├── netlify.toml
└── .env.example
```
