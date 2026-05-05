#!/usr/bin/env node
/**
 * fetch-events.js
 * Core logic for fetching, filtering, and sorting events from Action Network.
 * Used by both the serverless function and the GitHub Action.
 *
 * CLI usage:
 *   node scripts/fetch-events.js                      # fetch "all-upcoming" listing
 *   node scripts/fetch-events.js --listing canvasses  # fetch named listing
 *   node scripts/fetch-events.js --all                # fetch all listings, write to data/
 */

import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const AN_API_BASE = 'https://actionnetwork.org/api/v2';

/**
 * Fetch a single page of events from Action Network.
 * @param {string} apiKey
 * @param {number} page
 * @param {string|null} campaignId  - if set, fetch from event_campaigns endpoint
 * @returns {Promise<{events: object[], totalPages: number}>}
 */
async function fetchPage(apiKey, page = 1, campaignId = null) {
  const base = campaignId
    ? `${AN_API_BASE}/event_campaigns/${campaignId}/events`
    : `${AN_API_BASE}/events`;

  const url = `${base}?page=${page}`;

  const res = await fetch(url, {
    headers: { 'OSDI-API-Token': apiKey },
  });

  if (!res.ok) {
    throw new Error(`Action Network API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  const events = data._embedded?.['osdi:events'] ?? [];
  const total = data.total_pages ?? 1;

  return { events, totalPages: total };
}

/**
 * Fetch all pages of events (paginated).
 * @param {string} apiKey
 * @param {string|null} campaignId
 * @returns {Promise<object[]>}
 */
async function fetchAllEvents(apiKey, campaignId = null) {
  const allEvents = [];
  const { events: firstPage, totalPages } = await fetchPage(apiKey, 1, campaignId);
  allEvents.push(...firstPage);

  const remaining = [];
  for (let page = 2; page <= totalPages; page++) {
    remaining.push(fetchPage(apiKey, page, campaignId));
  }

  const pages = await Promise.all(remaining);
  for (const { events } of pages) {
    allEvents.push(...events);
  }

  return allEvents;
}

/**
 * Return true if an event's start date is today or in the future.
 * @param {object} event  - Action Network event object
 * @returns {boolean}
 */
function isFuture(event) {
  const startDate = event.start_date;
  if (!startDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(startDate) >= today;
}

/**
 * Return true if the event matches the given tags filter (AND logic).
 * Tags are stored in event.tags as an array of strings (or may be absent).
 * @param {object} event
 * @param {string[]} tags
 * @returns {boolean}
 */
function matchesTags(event, tags) {
  if (!tags || tags.length === 0) return true;
  const eventTags = (event.tags ?? []).map((t) => t.toLowerCase());
  return tags.every((tag) => eventTags.includes(tag.toLowerCase()));
}

/**
 * Normalize an Action Network event into a compact display object.
 * @param {object} event
 * @returns {object}
 */
function normalizeEvent(event) {
  const location = event.location ?? {};
  const parts = [
    location.venue,
    location.address_lines?.[0],
    location.locality,
    location.region,
  ].filter(Boolean);

  return {
    id: event.identifiers?.[0] ?? event._links?.self?.href ?? '',
    title: event.title ?? event.name ?? 'Untitled Event',
    start_date: event.start_date ?? null,
    end_date: event.end_date ?? null,
    location: parts.join(', ') || null,
    location_virtual: !!(location.is_virtual),
    description: event.description ?? event.summary ?? null,
    rsvp_url: event.browser_url ?? event._links?.self?.href ?? null,
    tags: event.tags ?? [],
    capacity: event.capacity ?? null,
    total_accepted: event.total_accepted ?? null,
  };
}

/**
 * Fetch and filter events for a single listing config.
 * @param {string} apiKey
 * @param {object} filters  - { event_campaign_id?, tags?, limit? }
 * @returns {Promise<object[]>}
 */
export async function fetchListing(apiKey, filters = {}) {
  const campaignId = filters.event_campaign_id ?? null;
  const tagFilter = filters.tags ?? [];
  const limit = filters.limit ? parseInt(filters.limit, 10) : null;

  const rawEvents = await fetchAllEvents(apiKey, campaignId);

  let events = rawEvents
    .filter(isFuture)
    .filter((e) => matchesTags(e, tagFilter))
    .map(normalizeEvent)
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

  if (limit && limit > 0) {
    events = events.slice(0, limit);
  }

  return events;
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

async function main() {
  const _root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  const apiKey = process.env.ACTION_NETWORK_API_KEY;

  if (!apiKey) {
    console.error('Error: ACTION_NETWORK_API_KEY environment variable is not set.');
    console.error('Copy .env.example to .env and fill in your key.');
    process.exit(1);
  }

  // Load config
  const configPath = join(_root, 'config', 'listings.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));

  const fetchAll = args.includes('--all');
  const listingIndex = args.indexOf('--listing');
  const listingName = listingIndex >= 0 ? args[listingIndex + 1] : null;

  if (fetchAll) {
    // Fetch all listings and write to data/
    mkdirSync(join(_root, 'data'), { recursive: true });
    for (const [name, listing] of Object.entries(config.listings)) {
      console.log(`Fetching listing: ${name}...`);
      try {
        const events = await fetchListing(apiKey, listing.filters ?? {});
        const output = { listing: name, title: listing.title, updated_at: new Date().toISOString(), events };
        const outPath = join(_root, 'data', `${name}.json`);
        writeFileSync(outPath, JSON.stringify(output, null, 2));
        console.log(`  -> ${events.length} events written to data/${name}.json`);
      } catch (err) {
        console.error(`  Error fetching ${name}:`, err.message);
      }
    }
  } else {
    const name = listingName ?? 'all-upcoming';
    const listing = config.listings[name];
    if (!listing) {
      console.error(`Unknown listing: "${name}". Available: ${Object.keys(config.listings).join(', ')}`);
      process.exit(1);
    }

    console.log(`Fetching listing: ${name} (${listing.title})...`);
    const events = await fetchListing(apiKey, listing.filters ?? {});
    console.log(`Found ${events.length} upcoming events:\n`);
    for (const e of events) {
      const date = e.start_date
        ? new Date(e.start_date).toLocaleString([], {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
          })
        : 'TBD';
      console.log(`  [${date}] ${e.title}`);
      if (e.location) console.log(`           ${e.location}`);
      if (e.rsvp_url) console.log(`           ${e.rsvp_url}`);
    }
  }
}

// Only run CLI when invoked directly
if (import.meta.url && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
