# IMDb Top 250 Randomizer

Spin a wheel to pick a film from the IMDb Top 250. Mark it watched and it never comes round
again. Works on phones and laptops, and runs entirely in the browser — no server, no build step,
no API key.

## Enabling GitHub Pages

The site is plain static files at the repository root, so Pages serves it as-is:

**Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)` → Save.**

It will be live at `https://<owner>.github.io/imdb-randomizer/` within a minute or so. All paths
are relative, so the project-subpath URL works without configuration. To preview before merging,
point Pages at the feature branch instead.

`.nojekyll` is committed so GitHub serves the files verbatim instead of running them through
Jekyll.

## How it works

| File | Role |
| --- | --- |
| `index.html` | Markup and layout |
| `styles.css` | Responsive styling, light and dark themes |
| `js/app.js` | State, rendering, event wiring (entry point) |
| `js/wheel.js` | SVG wheel geometry and spin animation |
| `js/chart.js` | Watched/unwatched donut |
| `js/data.js` | Loads and normalizes the dataset |
| `js/storage.js` | `localStorage` persistence |
| `js/filters.js` | Genre and decade filtering |
| `movies.json` | The Top 250 dataset (committed) |
| `scripts/fetch-top250.mjs` | Regenerates `movies.json` |

Everything is native ES modules — there is nothing to install, bundle, or compile.

### Watched state

Stored in `localStorage` under `imdbRandomizer.watched.v1` as a map of IMDb id → timestamp.
Keying on the IMDb id (not a list position) means regenerating `movies.json` can't scramble saved
progress. Clearing browser data removes the key and resets the counts to zero.

If a browser blocks site storage entirely (Safari private mode, cookies disabled), the page falls
back to in-memory state and shows a notice — it still works, it just won't persist.

### The wheel

250 segments would be unreadable slivers, so each spin samples 12 films from the *unwatched*
pool onto readable wedges. Because the sample is redrawn every spin, every unwatched film stays
reachable, and a watched one can never be drawn.

The winner is chosen first and the animation is then aimed at it, rather than reading a result off
a rendered angle — so the pointer and the result card can't disagree. Labels are trimmed by
measured width, not character count, so no title runs under the hub.

`prefers-reduced-motion: reduce` skips the spin animation and reveals the result immediately.

## Refreshing the data

```bash
node scripts/fetch-top250.mjs
```

Writes `movies.json` and fails loudly if the result isn't 250 complete entries. Options:
`--source <url>`, `--out <path>`.

### Why the data is baked in rather than fetched live

There is no free public IMDb API. The official one is paid, through AWS Data Exchange. The usual
alternatives don't help either, because **GitHub Pages is a static host — there is no server to
keep a credential in**:

| Option | Blocker |
| --- | --- |
| IMDb official API | Paid subscription |
| Letterboxd API | Approval-gated; OAuth2 **client secret** would be public in the page |
| OMDb | Key public in JS; 1,000 requests/day shared across all visitors |
| TMDB | Key public in JS; no Top 250 list resource |

So the fetch happens at build time instead. Any credential stays on the machine running the
script, and the page ships with the data: no key to steal, no rate limit, no CORS risk, instant
load, and it works offline. The Top 250 changes a handful of times a year, so page-load freshness
would buy nothing.

### Known caveats

- The upstream list carries **no rank field**, so the app shows each film's IMDb rating rather
  than inventing a "#1 of 250". `movies.json` is ordered by rating for display only.
- The current snapshot's newest film is from 2022 — re-run the script to pull anything newer.
- Poster images are hotlinked from IMDb's CDN (`m.media-amazon.com`). Every image has a fallback,
  so a poster that fails to load degrades to a title card rather than leaving a hole.
