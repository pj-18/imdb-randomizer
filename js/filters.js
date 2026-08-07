/**
 * Genre / decade filtering. An empty set means "no restriction" rather than "match nothing",
 * so the default state shows all 250.
 */

export function createFilters() {
  return { genres: new Set(), decades: new Set() };
}

export function isActive(filters) {
  return filters.genres.size > 0 || filters.decades.size > 0;
}

export function toggle(set, value) {
  if (set.has(value)) set.delete(value);
  else set.add(value);
}

/** Movies matching the filters, watched or not. */
export function applyFilters(movies, filters) {
  if (!isActive(filters)) return movies;
  return movies.filter((m) => {
    const genreOk =
      filters.genres.size === 0 || m.genres.some((g) => filters.genres.has(g));
    const decadeOk = filters.decades.size === 0 || filters.decades.has(m.decade);
    return genreOk && decadeOk;
  });
}

/** The pool the wheel actually draws from: in-filter and not yet watched. */
export function spinnablePool(movies, filters, watched) {
  return applyFilters(movies, filters).filter((m) => !watched.has(m.id));
}
