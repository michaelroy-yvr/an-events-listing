/**
 * api/events.js
 * Serverless function for Netlify/Vercel.
 * Acts as a caching proxy between embed pages and the Action Network API.
 *
 * Query params:
 *   listing  — name of a listing from config/listings.json (default: "all-upcoming")
 *   campaign — override event_campaign_id filter
 *   tags     — comma-separated tag names to filter by
 *   limit    — max number of events to return
 */

// eslint-disable-next-line import/no-unresolved
import config from '../config/listings.json' assert { type: 'json' };
import { fetchListing } from '../scripts/fetch-events.js';

// ─── In-memory cache ──────────────────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.data;
}

function setCached(key, data) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Handler (Netlify) ────────────────────────────────────────────────────────
export async function handler(event) {
  return handleRequest(event.queryStringParameters ?? {});
}

// ─── Handler (Vercel) ─────────────────────────────────────────────────────────
export default async function vercelHandler(req, res) {
  const result = await handleRequest(req.query ?? {});
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(result.statusCode).send(result.body);
}

// ─── Core handler ─────────────────────────────────────────────────────────────
async function handleRequest(params) {
  const apiKey = process.env.ACTION_NETWORK_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, { error: 'Server configuration error: missing API key.' });
  }

  const listingName = params.listing ?? 'all-upcoming';
  const listingConfig = config.listings[listingName];

  if (!listingConfig) {
    return jsonResponse(404, {
      error: `Unknown listing: "${listingName}". Available: ${Object.keys(config.listings).join(', ')}`,
    });
  }

  const filters = { ...(listingConfig.filters ?? {}) };
  if (params.campaign) filters.event_campaign_id = params.campaign;
  if (params.tags)     filters.tags = params.tags.split(',').map((t) => t.trim());
  if (params.limit)    filters.limit = parseInt(params.limit, 10);

  const cacheKey = `${listingName}:${JSON.stringify(filters)}`;
  const cached = getCached(cacheKey);
  if (cached) return jsonResponse(200, cached, { 'X-Cache': 'HIT' });

  try {
    const events = await fetchListing(apiKey, filters);
    const payload = {
      listing: listingName,
      title: listingConfig.title,
      updated_at: new Date().toISOString(),
      events,
    };
    setCached(cacheKey, payload);
    return jsonResponse(200, payload, { 'X-Cache': 'MISS' });
  } catch (err) {
    console.error('fetchListing error:', err);
    return jsonResponse(502, { error: 'Failed to fetch events from Action Network.' });
  }
}

function jsonResponse(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}
