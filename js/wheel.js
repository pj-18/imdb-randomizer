/**
 * The spin wheel.
 *
 * 250 segments would be unreadable slivers, so each spin samples a handful of candidates
 * from the unwatched pool onto readable wedges. Every unwatched film stays reachable because
 * the sample is redrawn each spin.
 *
 * The winner is chosen *first* and the animation is then aimed at it, rather than reading a
 * result off a rendered angle. That makes the outcome correct by construction — no rounding
 * or easing quirk can disagree with what the pointer shows.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const CX = 200;
const CY = 200;
const R = 190;
const HUB_R = 62;

export const SEGMENT_COUNT = 12;

const SPIN_MS = 4500;
const MIN_TURNS = 4;
const MAX_TURNS = 6;
const TITLE_MAX_CHARS = 15;

/** Wedge fills, applied over the poster so the title stays legible. */
const PALETTE = [
  '#1f3f63', '#7a2f3d', '#25573f', '#5b3a6e',
  '#8a5216', '#1c5566', '#6b2f52', '#3c5220',
  '#2f3a70', '#7c3722', '#245c56', '#5a4a1e',
];

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Point on the wheel edge. `deg` is a standard math angle (0 = pointing right). */
function polar(deg, radius) {
  const rad = (deg * Math.PI) / 180;
  return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)];
}

/**
 * A wedge centred on 0° (pointing right). Every segment reuses this one shape and is
 * rotated into place, which keeps the geometry — and the clip path — simple.
 */
function wedgePath(spanDeg) {
  // A full circle has no distinct start and end point, so an arc would render as nothing.
  if (spanDeg >= 360) return null;
  const [x1, y1] = polar(-spanDeg / 2, R);
  const [x2, y2] = polar(spanDeg / 2, R);
  const largeArc = spanDeg > 180 ? 1 : 0;
  return `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

/**
 * Trims a label to the space actually available along the radius.
 *
 * A fixed character count is not good enough — at 13px, "Tôkyô monogata…" measures 134px
 * against a 100px budget, so 147 of the 250 titles would have run under the hub. Measuring
 * the rendered text is the only way to be sure it fits.
 */
function fitLabel(node, full, budget) {
  node.textContent = full;
  const measure = () => node.getComputedTextLength();

  // Returns 0 when the SVG is not being rendered; fall back to a conservative cut.
  if (measure() === 0) {
    node.textContent =
      full.length > TITLE_MAX_CHARS ? `${full.slice(0, TITLE_MAX_CHARS - 1).trimEnd()}…` : full;
    return;
  }
  if (measure() <= budget) return;

  let lo = 1;
  let hi = full.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    node.textContent = `${full.slice(0, mid).trimEnd()}…`;
    if (measure() <= budget) lo = mid;
    else hi = mid - 1;
  }
  node.textContent = `${full.slice(0, lo).trimEnd()}…`;
}

function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Up to SEGMENT_COUNT films drawn at random from the pool. */
export function sampleCandidates(pool, size = SEGMENT_COUNT) {
  return shuffle(pool).slice(0, Math.min(size, pool.length));
}

export function createWheel(svg) {
  const defs = el('defs');
  const rotor = el('g', { class: 'wheel-rotor' });
  svg.append(defs, rotor);

  // Static pointer at 12 o'clock, drawn after the rotor so it sits on top.
  svg.append(
    el('circle', { class: 'wheel-hub', cx: CX, cy: CY, r: HUB_R }),
    el('path', { class: 'wheel-pointer', d: `M ${CX - 16} 6 L ${CX + 16} 6 L ${CX} 42 Z` })
  );

  let rotation = 0; // Accumulates so the wheel never visibly snaps backwards.
  let current = [];

  function render(candidates) {
    current = candidates;
    rotor.replaceChildren();
    defs.replaceChildren();

    const n = candidates.length;
    if (n === 0) return;

    const span = 360 / n;
    const clipId = 'wheel-wedge-clip';
    const path = wedgePath(span);

    const clip = el('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' });
    clip.append(
      path
        ? el('path', { d: path })
        : el('circle', { cx: CX, cy: CY, r: R })
    );
    defs.append(clip);

    candidates.forEach((movie, i) => {
      // Segment centres run clockwise from 12 o'clock; the canonical wedge points right,
      // which is already 90° clockwise from 12, hence the offset.
      const centreFromTop = (i + 0.5) * span;
      const group = el('g', { transform: `rotate(${centreFromTop - 90} ${CX} ${CY})` });

      const clipped = el('g', { 'clip-path': `url(#${clipId})` });
      if (movie.thumb) {
        const img = el('image', {
          href: movie.thumb,
          x: CX,
          y: CY - R / 2,
          width: R,
          height: R,
          preserveAspectRatio: 'xMidYMid slice',
        });
        // A blocked or dead poster must not leave a transparent hole.
        img.addEventListener('error', () => img.remove());
        clipped.append(img);
      }
      clipped.append(
        path
          ? el('path', { d: path, fill: PALETTE[i % PALETTE.length], 'fill-opacity': 0.66 })
          : el('circle', {
              cx: CX,
              cy: CY,
              r: R,
              fill: PALETTE[0],
              'fill-opacity': 0.66,
            })
      );
      group.append(clipped);

      if (path) {
        group.append(el('path', { class: 'wheel-edge', d: path }));
      } else {
        group.append(el('circle', { class: 'wheel-edge', cx: CX, cy: CY, r: R, fill: 'none' }));
      }

      // Titles run along the radius, reading outward. On the wheel's left half that would be
      // upside down, so those get flipped about the middle of the text run.
      const rot = (centreFromTop - 90 + 360) % 360;
      const flipped = rot > 90 && rot < 270;
      const inner = HUB_R + 14;
      const outer = R - 14;
      const text = el('text', {
        class: 'wheel-label',
        y: CY + 4,
        'paint-order': 'stroke',
        ...(flipped
          ? {
              x: CX + inner,
              'text-anchor': 'start',
              transform: `rotate(180 ${CX + (inner + outer) / 2} ${CY})`,
            }
          : { x: CX + outer, 'text-anchor': 'end' }),
      });
      group.append(text);
      rotor.append(group);
      // Measured after it is in the document, where it has a rendered length.
      fitLabel(text, movie.title, outer - inner);
    });
  }

  /**
   * Spins to a randomly chosen candidate and resolves with it.
   * @param {Array} candidates already rendered on the wheel
   */
  function spin(candidates = current) {
    const n = candidates.length;
    if (n === 0) return Promise.resolve(null);

    const index = Math.floor(Math.random() * n);
    const winner = candidates[index];
    const span = 360 / n;

    // Rotation that brings segment `index` under the pointer, plus whole turns and a
    // little jitter so it does not always stop dead centre.
    const centreFromTop = (index + 0.5) * span;
    const targetMod = (360 - centreFromTop) % 360;
    const currentMod = ((rotation % 360) + 360) % 360;
    const delta = (targetMod - currentMod + 360) % 360;
    const turns = MIN_TURNS + Math.floor(Math.random() * (MAX_TURNS - MIN_TURNS + 1));
    const jitter = (Math.random() - 0.5) * span * 0.7;

    const from = rotation;
    rotation = from + turns * 360 + delta + jitter;

    const settle = () => {
      rotor.style.transform = `rotate(${rotation}deg)`;
      return winner;
    };

    if (prefersReducedMotion()) return Promise.resolve(settle());

    const animation = rotor.animate(
      [{ transform: `rotate(${from}deg)` }, { transform: `rotate(${rotation}deg)` }],
      { duration: SPIN_MS, easing: 'cubic-bezier(0.17, 0.67, 0.12, 0.99)', fill: 'forwards' }
    );

    return animation.finished.then(() => {
      animation.cancel(); // Hand the final angle to a plain style so it survives re-render.
      return settle();
    });
  }

  return { render, spin };
}
