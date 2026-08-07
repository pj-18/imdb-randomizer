#!/usr/bin/env node
/**
 * Regenerates movies.json — the IMDb Top 250 dataset the page ships with.
 *
 * Why a build-time script instead of fetching in the browser:
 * GitHub Pages is a static host, so there is no server to keep an API credential in.
 * IMDb's own API is paid (AWS Data Exchange), Letterboxd's is approval-gated and uses an
 * OAuth2 client secret, and OMDb/TMDB keys would be readable by anyone viewing source.
 * Fetching here keeps any credential off the client, and the Top 250 changes a handful of
 * times a year so page-load freshness buys nothing.
 *
 * Usage: node scripts/fetch-top250.mjs [--source <url>] [--out <path>]
 */

import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_SOURCE =
  'https://raw.githubusercontent.com/movie-monk-b0t/top250/master/top250_min.json';

const EXPECTED_COUNT = 250;

function parseArgs(argv) {
  const args = { source: DEFAULT_SOURCE, out: resolve(ROOT, 'movies.json') };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source' && argv[i + 1]) args.source = argv[++i];
    else if (argv[i] === '--out' && argv[i + 1]) args.out = resolve(argv[++i]);
  }
  return args;
}

/** IMDb image URLs carry their size in the name; ask for a bounded width. */
function resizePoster(url, width) {
  if (!url) return '';
  return url.replace(/\._V1_.*?\.jpg$/i, `._V1_UX${width}.jpg`);
}

const ENTITIES = {
  '&apos;': "'",
  '&quot;': '"',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
};

/**
 * The upstream titles and plots arrive HTML-escaped. The page renders them with
 * textContent, so anything left escaped would show up literally as "it&apos;s".
 * Decoding here keeps the shipped JSON clean.
 */
function decodeEntities(text) {
  if (!text) return text;
  return text
    .replace(/&[a-zA-Z]+;/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function normalize(raw) {
  const id = (raw.imdb_url || '').match(/tt\d+/)?.[0] || '';
  const year = Number.parseInt(raw.year, 10);
  const rating = Number.parseFloat(raw.rating);

  return {
    id,
    title: decodeEntities((raw.name || '').trim()),
    year: Number.isFinite(year) ? year : null,
    rating: Number.isFinite(rating) ? rating : null,
    genres: Array.isArray(raw.genre) ? raw.genre.map(decodeEntities) : [],
    directors: Array.isArray(raw.directors) ? raw.directors.map(decodeEntities) : [],
    actors: Array.isArray(raw.actors) ? raw.actors.slice(0, 3).map(decodeEntities) : [],
    plot: decodeEntities((raw.desc || '').trim()),
    // Wheel segments use the small one; the result card uses the larger one.
    thumb: resizePoster(raw.thumb_url || raw.image_url, 182),
    poster: resizePoster(raw.image_url || raw.thumb_url, 500),
  };
}

/** Fails loudly rather than shipping a half-empty dataset. */
function validate(movies) {
  const problems = [];
  if (movies.length !== EXPECTED_COUNT) {
    problems.push(`expected ${EXPECTED_COUNT} movies, got ${movies.length}`);
  }

  const seen = new Set();
  for (const m of movies) {
    const label = m.title || '(untitled)';
    if (!/^tt\d+$/.test(m.id)) problems.push(`${label}: bad or missing IMDb id`);
    if (seen.has(m.id)) problems.push(`${label}: duplicate id ${m.id}`);
    seen.add(m.id);
    if (!m.title) problems.push(`${m.id}: missing title`);
    if (m.year === null) problems.push(`${label}: missing year`);
    if (m.rating === null) problems.push(`${label}: missing rating`);
    if (!m.thumb) problems.push(`${label}: missing poster`);
    if (!m.genres.length) problems.push(`${label}: missing genres`);
    if (/&[a-zA-Z]+;|&#\d+;/.test(`${m.title} ${m.plot}`)) {
      problems.push(`${label}: undecoded HTML entity`);
    }
  }

  if (problems.length) {
    throw new Error(
      `Dataset validation failed (${problems.length} problem(s)):\n  - ${problems
        .slice(0, 20)
        .join('\n  - ')}${problems.length > 20 ? `\n  ...and ${problems.length - 20} more` : ''}`
    );
  }
}

async function main() {
  const { source, out } = parseArgs(process.argv.slice(2));

  process.stdout.write(`Fetching ${source}\n`);
  const res = await fetch(source);
  if (!res.ok) throw new Error(`Source returned HTTP ${res.status} ${res.statusText}`);

  const raw = await res.json();
  if (!Array.isArray(raw)) throw new Error('Expected the source to return a JSON array');

  const movies = raw.map(normalize).sort((a, b) => b.rating - a.rating || a.title.localeCompare(b.title));
  validate(movies);

  const payload = {
    // The source list carries no rank field, so we deliberately do not invent one.
    // Movies are ordered by IMDb rating for display purposes only.
    generatedAt: new Date().toISOString(),
    source,
    count: movies.length,
    movies,
  };

  await writeFile(out, `${JSON.stringify(payload, null, 0)}\n`, 'utf8');

  const years = movies.map((m) => m.year);
  process.stdout.write(
    `Wrote ${out}\n` +
      `  ${movies.length} movies, years ${Math.min(...years)}–${Math.max(...years)}, ` +
      `${new Set(movies.flatMap((m) => m.genres)).size} genres\n`
  );
}

main().catch((err) => {
  process.stderr.write(`\nfetch-top250 failed: ${err.message}\n`);
  process.exit(1);
});
