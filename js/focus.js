// Directional focus for the glasses.
//
// The Neural Band and the touch strip reach the page as ArrowUp / ArrowDown / ArrowLeft /
// ArrowRight / Enter key events. Browsers move focus between buttons themselves, but a focused
// text field keeps the arrow keys for its caret - so focus gets stuck in the search box.
//
// This module makes sure an arrow press always goes somewhere:
//   - in a text field, it always moves focus to the nearest neighbour in that direction
//     (editing happens in the glasses' composer, so the caret never needs the arrows);
//   - anywhere else, it only steps in when the browser did not move focus itself, so native
//     navigation stays in charge wherever it already works.

const FOCUSABLE = 'button, a[href], input, select, textarea, summary, [tabindex]';
const DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const TEXT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'number', 'password']);

export function isTextField(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && TEXT_TYPES.has(el.type);
}

const gap = (aStart, aEnd, bStart, bEnd) => Math.max(0, bStart - aEnd, aStart - bEnd);

// Pure geometry: how good a target is `b` when moving `dir` from `a`? Lower is better, null means
// "not in that direction". Rects are { left, top, right, bottom }.
export function scoreMove(a, b, dir) {
  const ax = (a.left + a.right) / 2, ay = (a.top + a.bottom) / 2;
  const bx = (b.left + b.right) / 2, by = (b.top + b.bottom) / 2;
  let forward, along, across, centreAcross;
  if (dir === 'down' || dir === 'up') {
    forward = dir === 'down' ? by - ay : ay - by;
    along = dir === 'down' ? b.top - a.bottom : a.top - b.bottom;
    across = gap(a.left, a.right, b.left, b.right);
    centreAcross = Math.abs(bx - ax);
  } else {
    forward = dir === 'right' ? bx - ax : ax - bx;
    along = dir === 'right' ? b.left - a.right : a.left - b.right;
    across = gap(a.top, a.bottom, b.top, b.bottom);
    centreAcross = Math.abs(by - ay);
  }
  if (forward <= 1) return null;                // behind us, or the same spot
  return Math.max(0, along) + across * 4 + centreAcross * 0.35;
}

export function pickNeighbour(from, dir, candidates) {
  let best = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    if (c.id === from.id) continue;
    const s = scoreMove(from.rect, c.rect, dir);
    if (s !== null && s < bestScore) { best = c; bestScore = s; }
  }
  return best;
}

function usable(el) {
  if (el.disabled || el.tabIndex < 0) return false;
  if (el.closest('[hidden], [inert]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  return getComputedStyle(el).visibility !== 'hidden';
}

function move(root, from, dir) {
  const els = [...root.querySelectorAll(FOCUSABLE)].filter(usable);
  const list = els.map((el, id) => ({ id, el, rect: el.getBoundingClientRect() }));
  const here = list.find((c) => c.el === from);
  let target = null;
  if (here) target = pickNeighbour(here, dir, list)?.el;
  else target = els[0];                         // focus is on <body>: start at the first control
  if (!target) return false;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
}

export function installDirectionalFocus(root) {
  document.addEventListener('keydown', (event) => {
    const dir = DIRS[event.key];
    if (!dir || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
    const from = document.activeElement;

    if (isTextField(from) && root.contains(from)) {
      event.preventDefault();
      move(root, from, dir);
      return;
    }

    // Give the browser first go; if focus is still where it was a moment later, step in.
    setTimeout(() => {
      if (document.activeElement !== from) return;
      if (from && from !== document.body && !from.isConnected) return;
      move(root, from && root.contains(from) ? from : document.body, dir);
    }, 0);
  });
}
