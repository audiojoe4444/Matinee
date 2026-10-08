// Tiny router. Screens are driven by browser history so the glasses' system Back
// gesture steps back one screen from anywhere (Meta caps pushState at 5 entries,
// and Matinee never goes deeper than 4: home > shelf > film > player).

import { screens } from './ui.js';

const root = document.getElementById('app');
const HOME = { screen: 'home' };

const memory = new Map(); // per-screen scroll position + focused item, restored on Back
let current = null;       // { el, state }
let token = 0;

const keyOf = (s) => JSON.stringify([s.screen, s.id ?? '', s.q ?? '', s.decade ?? 0, s.sort ?? '']);

function remember() {
  if (!current) return;
  const scroller = current.el.querySelector('.scroll');
  const active = document.activeElement;
  memory.set(keyOf(current.state), {
    scroll: scroller ? scroller.scrollTop : 0,
    focus: active && current.el.contains(active) ? active.dataset.key ?? null : null,
  });
}

export const nav = {
  push(state) {
    remember();
    memory.delete(keyOf(state)); // going forward always starts fresh
    history.pushState(state, '');
    render(state);
  },
  // Same level, new state (changing a filter, a new search). Doesn't grow the history.
  replace(state, focus) {
    memory.delete(keyOf(state));
    if (focus) memory.set(keyOf(state), { scroll: 0, focus });
    history.replaceState(state, '');
    render(state);
  },
};

function restore(el, state) {
  const saved = memory.get(keyOf(state));
  const scroller = el.querySelector('.scroll');
  if (saved && scroller) scroller.scrollTop = saved.scroll;
  let target = null;
  if (saved?.focus) target = [...el.querySelectorAll('[data-key]')].find((n) => n.dataset.key === saved.focus);
  target ??= el.querySelector('[data-autofocus]') ?? el.querySelector('.scroll button, .scroll input');
  target?.focus({ preventScroll: Boolean(saved) });
}

async function render(state) {
  const mine = ++token;
  const build = screens[state?.screen] ?? screens.home;
  current?.el.teardown?.();
  const el = build(state, nav);
  current = { el, state };
  root.replaceChildren(el);
  try {
    await el.onMount?.();
  } catch (err) {
    console.error(err);
  }
  if (mine === token) restore(el, state);
}

window.addEventListener('popstate', (event) => render(event.state ?? HOME));

history.replaceState(HOME, '');
render(HOME);
