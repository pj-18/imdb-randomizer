/**
 * Wiring: state, rendering, and event handling.
 *
 * Single source of truth is `state`. Every mutation goes through a helper that persists to
 * storage and then calls render(), so the wheel, chart, history and grid can never disagree.
 */

import { loadMovies, imdbUrl, allGenres, allDecades } from './data.js';
import { loadWatched, markWatched, unmarkWatched, isPersistent } from './storage.js';
import { createFilters, isActive, toggle, applyFilters, spinnablePool } from './filters.js';
import { createWheel, sampleCandidates } from './wheel.js';
import { createChart } from './chart.js';

const $ = (id) => document.getElementById(id);

const dom = {
  wheelSvg: document.querySelector('.wheel'),
  wheelWrap: document.querySelector('.wheel-wrap'),
  spin: $('spin'),
  wheelStatus: $('wheel-status'),
  resultPanel: $('result-panel'),
  resultPoster: $('result-poster'),
  resultPosterFallback: $('result-poster-fallback'),
  resultTitle: $('result-title'),
  resultRating: $('result-rating'),
  resultYear: $('result-year'),
  resultGenres: $('result-genres'),
  resultDirectors: $('result-directors'),
  resultPlot: $('result-plot'),
  resultWatched: $('result-watched'),
  resultLink: $('result-link'),
  chartRoot: $('chart-root'),
  statsNote: $('stats-note'),
  genreFilters: $('genre-filters'),
  decadeFilters: $('decade-filters'),
  clearFilters: $('clear-filters'),
  history: $('history'),
  historyEmpty: $('history-empty'),
  grid: $('grid'),
  storageWarning: $('storage-warning'),
};

const state = {
  movies: [],
  watched: new Map(),
  filters: createFilters(),
  pick: null,
  spinning: false,
  candidates: [],
};

const chart = createChart(dom.chartRoot);
const wheel = createWheel(dom.wheelSvg);
const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** Grid nodes are built once and mutated, rather than re-created on every render. */
const gridNodes = new Map();

/* ---------- mutations ---------- */

function setWatched(id, watched) {
  if (watched) {
    const now = Date.now();
    state.watched.set(id, now);
    markWatched(id);
  } else {
    state.watched.delete(id);
    unmarkWatched(id);
  }
  render();
}

/* ---------- rendering ---------- */

function renderResult() {
  const movie = state.pick;
  if (!movie) {
    dom.resultPanel.hidden = true;
    return;
  }
  dom.resultPanel.hidden = false;

  dom.resultPoster.hidden = false;
  dom.resultPosterFallback.hidden = true;
  dom.resultPoster.src = movie.poster || movie.thumb || '';
  dom.resultPoster.alt = `Poster for ${movie.title}`;

  dom.resultTitle.textContent = movie.title;
  dom.resultRating.textContent = `★ ${movie.rating?.toFixed(1) ?? '—'}`;
  dom.resultYear.textContent = movie.year ?? '';

  dom.resultGenres.replaceChildren(
    ...movie.genres.map((g) => {
      const li = document.createElement('li');
      li.className = 'chip-static';
      li.textContent = g;
      return li;
    })
  );

  dom.resultDirectors.textContent = movie.directors.length
    ? `Directed by ${movie.directors.join(', ')}`
    : '';
  dom.resultPlot.textContent = movie.plot;
  dom.resultLink.href = imdbUrl(movie.id);

  const isWatched = state.watched.has(movie.id);
  dom.resultWatched.setAttribute('aria-pressed', String(isWatched));
  dom.resultWatched.textContent = isWatched ? '✓ Watched' : 'Mark as watched';
}

function renderStats() {
  const inScope = applyFilters(state.movies, state.filters);
  const watchedInScope = inScope.filter((m) => state.watched.has(m.id)).length;
  const scoped = isActive(state.filters);

  chart.update({ watched: watchedInScope, total: inScope.length, scoped });

  dom.statsNote.textContent = scoped
    ? `Scoped to ${inScope.length} of ${state.movies.length} films by your filters.`
    : `Across all ${state.movies.length} films.`;
}

function renderSpinAvailability() {
  const pool = spinnablePool(state.movies, state.filters, state.watched);
  const inScope = applyFilters(state.movies, state.filters);
  const scoped = isActive(state.filters);

  dom.spin.disabled = state.spinning || pool.length === 0;

  if (state.spinning) return;

  if (inScope.length === 0) {
    dom.wheelStatus.textContent = 'No films match these filters. Loosen them to spin.';
  } else if (pool.length === 0) {
    dom.wheelStatus.textContent = scoped
      ? "You've watched everything matching these filters."
      : "You've watched all 250. Nothing left to spin for.";
  } else if (!state.pick) {
    dom.wheelStatus.textContent = `${pool.length} film${
      pool.length === 1 ? '' : 's'
    } left to pick from.`;
  }
}

function renderHistory() {
  const rows = [...state.watched.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, ts]) => ({ movie: state.movies.find((m) => m.id === id), ts }))
    .filter((row) => row.movie);

  dom.historyEmpty.hidden = rows.length > 0;

  dom.history.replaceChildren(
    ...rows.map(({ movie, ts }) => {
      const li = document.createElement('li');
      li.className = 'history__row';

      const img = document.createElement('img');
      img.className = 'history__thumb';
      img.src = movie.thumb;
      img.alt = '';
      img.loading = 'lazy';
      img.width = 40;
      img.height = 60;
      img.addEventListener('error', () => {
        img.style.visibility = 'hidden';
      });

      const meta = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'history__title';
      title.textContent = `${movie.title} (${movie.year})`;
      const date = document.createElement('div');
      date.className = 'history__date';
      date.textContent = `Marked ${dateFmt.format(new Date(ts))}`;
      meta.append(title, date);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'unwatch-btn';
      btn.textContent = 'Unwatch';
      btn.setAttribute('aria-label', `Mark ${movie.title} as not watched`);
      btn.addEventListener('click', () => setWatched(movie.id, false));

      li.append(img, meta, btn);
      return li;
    })
  );
}

function buildGrid() {
  const items = state.movies.map((movie) => {
    const li = document.createElement('li');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'grid__btn';
    btn.setAttribute('aria-pressed', 'false');

    const wrap = document.createElement('div');
    wrap.className = 'grid__poster-wrap';
    const img = document.createElement('img');
    img.className = 'grid__poster';
    img.src = movie.thumb;
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      img.style.visibility = 'hidden';
    });
    const badge = document.createElement('span');
    badge.className = 'grid__badge';
    badge.textContent = '✓';
    badge.setAttribute('aria-hidden', 'true');
    wrap.append(img, badge);

    const label = document.createElement('span');
    label.className = 'grid__label';
    label.textContent = `${movie.title} (${movie.year})`;

    btn.append(wrap, label);
    btn.addEventListener('click', () =>
      setWatched(movie.id, !state.watched.has(movie.id))
    );

    li.append(btn);
    gridNodes.set(movie.id, { li, btn });
    return li;
  });

  dom.grid.replaceChildren(...items);
}

function renderGrid() {
  const inScope = new Set(applyFilters(state.movies, state.filters).map((m) => m.id));
  const scoped = isActive(state.filters);

  for (const movie of state.movies) {
    const node = gridNodes.get(movie.id);
    if (!node) continue;
    const isWatched = state.watched.has(movie.id);
    node.btn.setAttribute('aria-pressed', String(isWatched));
    node.btn.setAttribute(
      'aria-label',
      `${movie.title}, ${movie.year}. ${isWatched ? 'Watched' : 'Not watched'}. Tap to toggle.`
    );
    node.li.classList.toggle('grid__item--filtered', scoped && !inScope.has(movie.id));
  }
}

function renderFilterChips() {
  dom.clearFilters.hidden = !isActive(state.filters);
  for (const btn of document.querySelectorAll('[data-filter-kind]')) {
    const set = state.filters[btn.dataset.filterKind];
    btn.setAttribute('aria-pressed', String(set.has(btn.dataset.filterValue)));
  }
}

function render() {
  renderResult();
  renderStats();
  renderSpinAvailability();
  renderHistory();
  renderGrid();
  renderFilterChips();
}

/* ---------- wheel ---------- */

function refreshCandidates() {
  const pool = spinnablePool(state.movies, state.filters, state.watched);
  state.candidates = sampleCandidates(pool);
  wheel.render(state.candidates);
}

async function onSpin() {
  if (state.spinning) return;

  // Re-sample now rather than after the previous result, so the pointer always keeps
  // pointing at the film the last spin actually landed on.
  refreshCandidates();
  if (state.candidates.length === 0) {
    render();
    return;
  }

  state.spinning = true;
  state.pick = null;
  dom.spin.disabled = true;
  dom.wheelStatus.textContent = 'Spinning…';
  dom.resultPanel.hidden = true;

  try {
    const winner = await wheel.spin(state.candidates);
    state.pick = winner;
    dom.wheelStatus.textContent = winner ? `Landed on ${winner.title}.` : '';
  } finally {
    state.spinning = false;
    render();
  }
}

/* ---------- filters UI ---------- */

function buildFilterChips(container, kind, values) {
  container.replaceChildren(
    ...values.map((value) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      btn.textContent = value;
      btn.setAttribute('aria-pressed', 'false');
      btn.dataset.filterKind = kind;
      btn.dataset.filterValue = value;
      btn.addEventListener('click', () => {
        toggle(state.filters[kind], value);
        state.pick = null;
        render();
      });
      li.append(btn);
      return li;
    })
  );
}

function setupTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const select = (tab) => {
    for (const t of tabs) {
      const selected = t === tab;
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
    }
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      select(next);
      next.focus();
    });
  });
}

/* ---------- init ---------- */

async function init() {
  dom.spin.disabled = true;
  dom.wheelStatus.textContent = 'Loading the Top 250…';

  try {
    state.movies = await loadMovies();
  } catch (err) {
    dom.wheelStatus.textContent = `Could not load the film list. ${err.message}`;
    return;
  }

  state.watched = loadWatched();
  dom.storageWarning.hidden = isPersistent();

  buildFilterChips(dom.genreFilters, 'genres', allGenres(state.movies));
  buildFilterChips(dom.decadeFilters, 'decades', allDecades(state.movies));
  buildGrid();
  setupTabs();

  dom.spin.addEventListener('click', onSpin);
  dom.clearFilters.addEventListener('click', () => {
    state.filters = createFilters();
    render();
  });
  dom.resultWatched.addEventListener('click', () => {
    if (!state.pick) return;
    setWatched(state.pick.id, !state.watched.has(state.pick.id));
  });
  dom.resultPoster.addEventListener('error', () => {
    dom.resultPoster.hidden = true;
    dom.resultPosterFallback.hidden = false;
    dom.resultPosterFallback.textContent = state.pick?.title ?? '';
  });

  refreshCandidates();
  render();
}

init();
