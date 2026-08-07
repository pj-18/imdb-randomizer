/**
 * Watched vs unwatched donut.
 *
 * Two slices is a weak form on its own — an arc angle is hard to read precisely — so the
 * counts are also printed in the middle and in the legend. The chart carries the
 * at-a-glance progress; the numbers carry the actual values.
 *
 * Colours are categorical slots 1 and 2 from the reference palette, validated for
 * colour-vision deficiency and surface contrast in both light and dark modes.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const CX = 70;
const CY = 70;
const R = 54;
const STROKE = 22;
const CIRCUMFERENCE = 2 * Math.PI * R;

/** Surface-coloured gap between the two fills, in path units. */
const GAP = 4;

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function arc(className) {
  return el('circle', {
    class: className,
    cx: CX,
    cy: CY,
    r: R,
    fill: 'none',
    'stroke-width': STROKE,
    'stroke-linecap': 'butt',
  });
}

export function createChart(root) {
  const svg = el('svg', {
    class: 'chart-svg',
    viewBox: '0 0 140 140',
    role: 'img',
  });

  // Rotated so both arcs start at 12 o'clock rather than 3 o'clock.
  const plot = el('g', { transform: `rotate(-90 ${CX} ${CY})` });
  const unwatchedArc = arc('arc arc--unwatched');
  const watchedArc = arc('arc arc--watched');
  plot.append(unwatchedArc, watchedArc);

  const value = el('text', { class: 'chart-value', x: CX, y: CY - 2 });
  const caption = el('text', { class: 'chart-caption', x: CX, y: CY + 18 });
  svg.append(plot, value, caption);

  const legend = document.createElement('ul');
  legend.className = 'chart-legend';
  const rows = ['watched', 'unwatched'].map((kind) => {
    const li = document.createElement('li');
    li.className = 'chart-legend__row';
    const swatch = document.createElement('span');
    swatch.className = `chart-legend__swatch chart-legend__swatch--${kind}`;
    swatch.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'chart-legend__label';
    label.textContent = kind === 'watched' ? 'Watched' : 'Not watched';
    const count = document.createElement('span');
    count.className = 'chart-legend__count';
    li.append(swatch, label, count);
    legend.append(li);
    return count;
  });

  root.append(svg, legend);

  /** @param {{watched:number,total:number,scoped:boolean}} data */
  function update({ watched, total, scoped = false }) {
    const safeTotal = Math.max(total, 0);
    const unwatched = Math.max(safeTotal - watched, 0);
    const fraction = safeTotal > 0 ? watched / safeTotal : 0;
    const pct = safeTotal > 0 ? Math.round(fraction * 100) : 0;

    const watchedLen = fraction * CIRCUMFERENCE;
    const unwatchedLen = CIRCUMFERENCE - watchedLen;
    // Only carve out the gap when both arcs are actually on screen.
    const gap = watched > 0 && unwatched > 0 ? GAP : 0;

    const setArc = (node, length, offset, visible) => {
      node.style.display = visible ? '' : 'none';
      if (!visible) return;
      const drawn = gap > 0 ? Math.max(length - gap, 0.001) : CIRCUMFERENCE;
      node.setAttribute('stroke-dasharray', `${drawn} ${CIRCUMFERENCE}`);
      node.setAttribute('stroke-dashoffset', `${-offset}`);
    };

    setArc(watchedArc, watchedLen, gap / 2, watched > 0);
    setArc(unwatchedArc, unwatchedLen, watchedLen + gap / 2, unwatched > 0);

    value.textContent = String(watched);
    caption.textContent = `of ${safeTotal}`;

    rows[0].textContent = `${watched} (${pct}%)`;
    rows[1].textContent = `${unwatched} (${safeTotal > 0 ? 100 - pct : 0}%)`;

    svg.setAttribute(
      'aria-label',
      `${watched} of ${safeTotal} ${scoped ? 'matching ' : ''}films watched (${pct}%), ` +
        `${unwatched} not watched.`
    );
  }

  return { update };
}
