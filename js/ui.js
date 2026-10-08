// Screens. Each one is a function (state, nav) -> element.
// An element may carry:
//   el.onMount()   run after it is in the page (load data here); may be async
//   el.teardown()  run just before it is replaced (stop video, clear timers)
// Navigation is left to the glasses' browser: everything interactive is a native
// <button>/<input>, so spatial navigation and Select just work.

import { SHELVES, DECADES, SORTS, SEEK_SECONDS, CONTROLS_HIDE_MS } from './config.js';
import * as A from './archive.js';

/* --------------------------------------------------------------- helpers */

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'html') el.innerHTML = value; // static markup only
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>',
  replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.7 9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M4 4v6h6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  logo: '<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M12 10h40a4 4 0 0 1 4 4v36a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4zM15 16v6h6v-6h-6zm0 13v6h6v-6h-6zm0 13v6h6v-6h-6zM43 16v6h6v-6h-6zm0 13v6h6v-6h-6zm0 13v6h6v-6h-6zM27 22.5v19L43 32l-16-9.5z"/></svg>',
};
const icon = (name) => h('span', { class: 'ico', html: ICONS[name] });

const SORT_IDS = SORTS.map((s) => s.id);
const nextSort = (id) => SORT_IDS[(SORT_IDS.indexOf(id) + 1) % SORT_IDS.length];
const sortLabel = (id) => SORTS.find((s) => s.id === id)?.label ?? 'Popular';

function header({ title, back = true, logo = false, extra = null }) {
  return h('header', { class: 'bar' },
    back && h('button', { class: 'btn icon-btn back', type: 'button', 'aria-label': 'Back', dataset: { key: 'back' }, onclick: () => history.back() }, icon('back')),
    logo && h('span', { class: 'logo' }, icon('logo')),
    title && h('h1', { class: 'title', text: title }),
    extra);
}

const metaLine = (item) => [item.year, A.formatRuntime(item.runtime)].filter(Boolean).join(' · ');

function card(item, onOpen) {
  const art = h('div', { class: 'art' });
  const img = h('img', { src: A.thumbUrl(item.id), alt: '', loading: 'lazy', decoding: 'async' });
  img.addEventListener('error', () => art.classList.add('noimg'));
  art.append(img, h('span', { class: 'initial', 'aria-hidden': 'true', text: item.title.charAt(0) }));
  const sub = metaLine(item);
  return h('button', { class: 'card', type: 'button', dataset: { key: item.id }, onclick: () => onOpen(item) },
    art,
    h('div', { class: 'meta' },
      h('div', { class: 't', text: item.title }),
      sub && h('div', { class: 's', text: sub })));
}

const skeletons = (n = 6) =>
  Array.from({ length: n }, () =>
    h('div', { class: 'card skeleton', 'aria-hidden': 'true' }, h('div', { class: 'art' }), h('div', { class: 'meta' }, h('div', { class: 't' }))));

function notice(message, actionLabel, onAction, key = 'retry') {
  return h('div', { class: 'notice', role: 'status' },
    h('p', { text: message }),
    actionLabel && h('button', { class: 'btn', type: 'button', dataset: { key }, onclick: onAction, text: actionLabel }));
}

// A search field fires `change` when the glasses' composer commits text, but browsers also fire it
// as a side effect of blur - including while a screen is being swapped out. So: wait a tick, and
// ignore it if the field has already left the page (otherwise Back could trigger a stray search).
function onCommit(input, handler) {
  input.addEventListener('change', () => {
    setTimeout(() => { if (input.isConnected) handler(input.value.trim()); }, 0);
  });
}

function focusKey(root, key) {
  const target = [...root.querySelectorAll('[data-key]')].find((n) => n.dataset.key === key);
  target?.focus();
}

/* ------------------------------------------------------------------ home */

function homeScreen(state, nav) {
  const search = h('input', {
    type: 'search', class: 'search', placeholder: 'Search films', 'aria-label': 'Search films',
    enterkeyhint: 'search', autocomplete: 'off', dataset: { key: 'search' },
  });
  onCommit(search, (q) => {
    search.value = '';
    if (q) nav.push({ screen: 'search', q });
  });

  const grid = h('div', { class: 'grid tiles' });
  const recents = A.recent.get();
  if (recents.length) {
    grid.append(tile({
      key: 'recent', title: 'Recently watched', blurb: `${recents.length} film${recents.length === 1 ? '' : 's'}`,
      accent: '#ffffff', wide: true, onclick: () => nav.push({ screen: 'recent' }),
    }));
  }
  for (const shelf of SHELVES) {
    const t = tile({
      key: `shelf-${shelf.id}`, title: shelf.title, blurb: shelf.blurb, accent: shelf.accent,
      onclick: () => nav.push({ screen: 'shelf', id: shelf.id, decade: 0, sort: 'popular' }),
    });
    grid.append(t);
    probeShelf(shelf, t);
  }
  grid.append(tile({
    key: 'settings', title: 'Settings', blurb: 'Video quality and about', accent: '#b4bcc8',
    wide: true, quiet: true, onclick: () => nav.push({ screen: 'settings' }),
  }));

  const el = h('section', { class: 'screen', dataset: { screen: 'home' } },
    header({ back: false, logo: true, title: 'Matinee', extra: search }),
    h('div', { class: 'scroll' }, grid));
  return el;
}

function tile({ key, title, blurb, accent, wide = false, quiet = false, onclick }) {
  const el = h('button', {
    class: `tile${wide ? ' wide' : ''}${quiet ? ' quiet' : ''}`, type: 'button',
    style: `--accent-tile:${accent}`, dataset: { key }, onclick,
  }, h('span', { class: 'tile-title', text: title }), h('span', { class: 'tile-blurb', text: blurb }));
  return el;
}

// Loads each shelf quietly in the background: gives its tile a backdrop,
// and removes tiles for shelves that turn out to be empty.
async function probeShelf(shelf, tileEl) {
  try {
    const cursor = A.getCursor(shelf, null);
    if (!cursor.items.length) await cursor.next();
    if (!cursor.items.length) { tileEl.remove(); return; }
    tileEl.style.setProperty('--art', `url("${A.thumbUrl(cursor.items[0].id)}")`);
    tileEl.classList.add('has-art');
  } catch { /* offline or blocked: leave the tile; opening it offers a retry */ }
}

/* ----------------------------------------------------------------- shelf */

function shelfScreen(state, nav) {
  const shelf = SHELVES.find((s) => s.id === state.id) ?? SHELVES[0];
  const decadeIndex = state.decade ?? 0;
  const sort = state.sort ?? 'popular';
  const cursor = A.getCursor(shelf, decadeIndex ? DECADES[decadeIndex] : null);
  const grid = h('div', { class: 'grid cards' });

  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by decade' },
    DECADES.map((d, i) => h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(i === decadeIndex), dataset: { key: `chip-${i}` }, text: d.label,
      onclick: () => i !== decadeIndex && nav.replace({ ...state, decade: i }, `chip-${i}`),
    })));

  const sortBtn = h('button', {
    class: 'chip sort', type: 'button', dataset: { key: 'sort' }, text: sortLabel(sort),
    'aria-label': `Sorted by ${sortLabel(sort)}. Change sort order`,
    onclick: () => nav.replace({ ...state, sort: nextSort(sort) }, 'sort'),
  });

  const open = (item) => nav.push({ screen: 'detail', id: item.id });

  function paint() {
    const list = A.sortItems(cursor.items, sort);
    if (!list.length) {
      grid.replaceChildren(notice('No films here yet.', 'Try again', load));
      return;
    }
    const more = cursor.done ? [] : [moreButton()];
    grid.replaceChildren(...list.map((item) => card(item, open)), ...more);
  }

  function moreButton() {
    const btn = h('button', { class: 'card more', type: 'button', dataset: { key: 'more' }, text: 'More films' });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Loading…';
      try {
        const fresh = await cursor.next();
        paint();
        if (fresh[0]) focusKey(grid, fresh[0].id);
      } catch {
        btn.disabled = false;
        btn.textContent = 'Couldn’t load – try again';
      }
    });
    return btn;
  }

  async function load() {
    grid.replaceChildren(...skeletons());
    try {
      await cursor.next();
      paint();
      if (document.activeElement === document.body || !el.contains(document.activeElement)) grid.querySelector('.card')?.focus();
    } catch {
      grid.replaceChildren(notice('Couldn’t reach the Archive. Check your connection.', 'Try again', load));
      focusKey(grid, 'retry');
    }
  }

  const el = h('section', { class: 'screen', dataset: { screen: 'shelf' } },
    header({ title: shelf.title, extra: sortBtn }),
    chips,
    h('div', { class: 'scroll' }, grid));
  el.onMount = async () => {
    if (cursor.items.length) paint();
    else await load();
  };
  return el;
}

/* ---------------------------------------------------------------- search */

function searchScreen(state, nav) {
  const input = h('input', {
    type: 'search', class: 'search', value: state.q, placeholder: 'Search films', 'aria-label': 'Search films',
    enterkeyhint: 'search', autocomplete: 'off', dataset: { key: 'search' },
  });
  onCommit(input, (q) => {
    if (q && q !== state.q) nav.replace({ screen: 'search', q }, null);
  });
  const grid = h('div', { class: 'grid cards' });
  const open = (item) => nav.push({ screen: 'detail', id: item.id });

  async function load() {
    grid.replaceChildren(...skeletons(4));
    try {
      const results = await A.searchFilms(state.q);
      if (!results.length) {
        grid.replaceChildren(notice(`Nothing found for “${state.q}”. Try a shorter search.`));
        return;
      }
      grid.replaceChildren(...results.map((item) => card(item, open)));
    } catch {
      grid.replaceChildren(notice('Couldn’t reach the Archive. Check your connection.', 'Try again', load));
    }
  }

  const el = h('section', { class: 'screen', dataset: { screen: 'search' } },
    header({ extra: input }),
    h('div', { class: 'scroll' }, grid));
  el.onMount = load;
  return el;
}

/* ---------------------------------------------------------------- recent */

function recentScreen(state, nav) {
  const grid = h('div', { class: 'grid cards' });
  const open = (item) => nav.push({ screen: 'detail', id: item.id });
  const list = A.recent.get();
  if (!list.length) grid.append(notice('Nothing watched yet.'));
  else grid.append(...list.map((item) => card(item, open)));
  const clear = h('button', {
    class: 'btn', type: 'button', dataset: { key: 'clear' }, text: 'Clear list',
    onclick: () => { A.recent.clear(); nav.replace({ screen: 'recent' }, null); },
  });
  return h('section', { class: 'screen', dataset: { screen: 'recent' } },
    header({ title: 'Recently watched' }),
    h('div', { class: 'scroll' }, grid, list.length ? h('div', { class: 'foot' }, clear) : null));
}

/* ---------------------------------------------------------------- detail */

function detailScreen(state, nav) {
  const body = h('div', { class: 'scroll' });
  const el = h('section', { class: 'screen', dataset: { screen: 'detail' } }, header({}), body);

  function fill(item) {
    A.fetchMeta(item.id).catch(() => {}); // warm up so Play starts quickly
    const art = h('div', { class: 'art' });
    const img = h('img', { src: A.thumbUrl(item.id), alt: '', decoding: 'async' });
    img.addEventListener('error', () => art.classList.add('noimg'));
    art.append(img, h('span', { class: 'initial', 'aria-hidden': 'true', text: item.title.charAt(0) }));
    const sub = metaLine(item);
    body.replaceChildren(
      h('div', { class: 'hero' },
        art,
        h('div', { class: 'info' },
          h('h2', { class: 'film-title', text: item.title }),
          sub && h('div', { class: 'film-meta', text: sub }),
          item.creator && h('div', { class: 'film-by', text: item.creator }))),
      h('button', {
        class: 'btn primary big play', type: 'button', dataset: { key: 'play' }, 'data-autofocus': '',
        onclick: () => nav.push({ screen: 'player', id: item.id }),
      }, icon('play'), 'Play'),
      item.desc ? h('p', { class: 'desc', text: item.desc }) : null);
  }

  const known = A.getStoredItem(state.id);
  if (known) fill(known);
  el.onMount = async () => {
    if (known) return;
    body.replaceChildren(h('div', { class: 'notice' }, h('p', { text: 'Loading…' })));
    let item = null;
    try { item = await A.getItem(state.id); } catch { /* handled below */ }
    if (item) {
      fill(item);
      focusKey(el, 'play');
    } else {
      body.replaceChildren(notice('Couldn’t load this film.', 'Back', () => history.back(), 'back2'));
    }
  };
  return el;
}

/* ---------------------------------------------------------------- player */

function formatClock(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = String(s % 60).padStart(2, '0');
  return hrs ? `${hrs}:${String(mins).padStart(2, '0')}:${secs}` : `${mins}:${secs}`;
}

function playerScreen(state, nav) {
  const item = A.getStoredItem(state.id);
  const title = item?.title ?? 'Now playing';

  const video = h('video', { class: 'video', playsinline: '', preload: 'auto' });
  const spinner = h('div', { class: 'spinner', 'aria-hidden': 'true' });
  const statusText = h('div', { class: 'status-text', text: 'Loading…' });
  const retryBtn = h('button', { class: 'btn', type: 'button', dataset: { key: 'retry' }, text: 'Try again', hidden: '' });
  const statusExit = h('button', { class: 'btn', type: 'button', dataset: { key: 'status-exit' }, 'data-autofocus': '', text: 'Exit', onclick: () => history.back() });
  const status = h('div', { class: 'status', role: 'status' },
    spinner, h('div', { class: 'status-title', text: title }), statusText,
    h('div', { class: 'btnrow' }, retryBtn, statusExit));

  const reveal = h('button', { class: 'reveal', type: 'button', 'aria-label': 'Show playback controls', hidden: '' });
  const fillBar = h('div', { class: 'fill' });
  const clock = h('div', { class: 'clock', text: '0:00 / 0:00' });
  const playBtn = h('button', { class: 'btn big pp', type: 'button', dataset: { key: 'pp' } });
  const backBtn = h('button', { class: 'btn big', type: 'button', dataset: { key: 'b15' }, text: `−${SEEK_SECONDS}s` });
  const fwdBtn = h('button', { class: 'btn big', type: 'button', dataset: { key: 'f15' }, text: `+${SEEK_SECONDS}s` });
  const exitBtn = h('button', { class: 'btn big', type: 'button', dataset: { key: 'exit' }, text: 'Exit', onclick: () => history.back() });
  const controls = h('div', { class: 'controls', hidden: '' },
    h('div', { class: 'now', text: title }),
    h('div', { class: 'timeline' }, fillBar),
    clock,
    h('div', { class: 'btnrow' }, backBtn, playBtn, fwdBtn, exitBtn));

  const el = h('section', { class: 'player', dataset: { screen: 'player' } }, video, status, controls, reveal);

  let hideTimer = 0;
  let started = false;
  let ended = false;
  let recorded = false;
  let torn = false;
  let candidates = [];

  const renderPlayPause = () => {
    playBtn.replaceChildren(icon(ended ? 'replay' : video.paused ? 'play' : 'pause'), ended ? 'Replay' : video.paused ? 'Play' : 'Pause');
  };
  const renderTime = () => {
    const dur = Number.isFinite(video.duration) ? video.duration : 0;
    clock.textContent = `${formatClock(video.currentTime)} / ${formatClock(dur)}`;
    fillBar.style.inlineSize = dur ? `${Math.min(100, (video.currentTime / dur) * 100)}%` : '0%';
  };
  const scheduleHide = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideControls, CONTROLS_HIDE_MS);
  };
  function showControls({ focus = true } = {}) {
    controls.hidden = false;
    reveal.hidden = true;
    renderPlayPause();
    renderTime();
    if (focus) playBtn.focus();
    scheduleHide();
  }
  function hideControls() {
    if (torn || video.paused || ended || !started) return;
    controls.hidden = true;
    reveal.hidden = false;
    reveal.focus();
  }
  function fail(message) {
    clearTimeout(hideTimer);
    controls.hidden = true;
    reveal.hidden = true;
    status.hidden = false;
    status.classList.add('failed');
    spinner.hidden = true;
    statusText.textContent = message;
    retryBtn.hidden = false;
    retryBtn.focus();
  }
  function tryNext() {
    const next = candidates.shift();
    if (!next) { fail('This film won’t play on this device.'); return; }
    statusText.textContent = 'Loading…';
    video.src = next.url;
    const attempt = video.play();
    if (attempt?.catch) {
      attempt.catch((err) => {
        if (torn || err?.name === 'AbortError') return;
        // Autoplay was refused - show the controls so one press starts it.
        status.hidden = true;
        showControls();
      });
    }
  }
  async function start() {
    status.hidden = false;
    status.classList.remove('failed');
    spinner.hidden = false;
    retryBtn.hidden = true;
    statusText.textContent = 'Loading…';
    try {
      candidates = await A.getSources(state.id, A.prefs.get().quality);
    } catch {
      if (!torn) fail('Couldn’t reach the Archive.');
      return;
    }
    if (torn) return;
    if (!candidates.length) { fail('No playable video found for this film.'); return; }
    tryNext();
  }

  const seek = (delta) => {
    const dur = Number.isFinite(video.duration) ? video.duration : Infinity;
    video.currentTime = Math.max(0, Math.min(dur - 0.25, video.currentTime + delta));
    ended = false;
    renderTime();
    renderPlayPause();
  };

  backBtn.addEventListener('click', () => seek(-SEEK_SECONDS));
  fwdBtn.addEventListener('click', () => seek(SEEK_SECONDS));
  playBtn.addEventListener('click', () => {
    if (ended) { video.currentTime = 0; ended = false; }
    if (video.paused) video.play().catch(() => {});
    else video.pause();
    renderPlayPause();
  });
  retryBtn.addEventListener('click', start);
  reveal.addEventListener('click', () => showControls());
  controls.addEventListener('focusin', scheduleHide);
  controls.addEventListener('click', scheduleHide);

  video.addEventListener('timeupdate', renderTime);
  video.addEventListener('loadedmetadata', renderTime);
  video.addEventListener('playing', () => {
    const firstFrame = !started;
    started = true;
    ended = false;
    status.hidden = true;
    if (!recorded && item) { A.recent.add(item); recorded = true; }
    renderPlayPause();
    if (firstFrame) showControls();
  });
  video.addEventListener('waiting', () => {
    if (!started) return;
    spinner.hidden = false;
    statusText.textContent = 'Buffering…';
    status.hidden = false;
  });
  video.addEventListener('pause', () => {
    renderPlayPause();
    if (!ended && started) { clearTimeout(hideTimer); controls.hidden = false; reveal.hidden = true; }
  });
  video.addEventListener('ended', () => {
    ended = true;
    showControls();
  });
  video.addEventListener('error', () => {
    if (torn) return;
    if (!started && candidates.length) tryNext();
    else fail(started ? 'Playback stopped unexpectedly.' : 'This film won’t play on this device.');
  });

  el.onMount = () => { start(); };
  el.teardown = () => {
    torn = true;
    clearTimeout(hideTimer);
    try { video.pause(); } catch { /* ignore */ }
    video.removeAttribute('src');
    try { video.load(); } catch { /* ignore */ }
  };
  return el;
}

/* -------------------------------------------------------------- settings */

function settingsScreen() {
  const current = A.prefs.get().quality;
  const options = [
    ['light', 'Light', 'Smaller files. Starts quickly and looks right on the glasses display.'],
    ['standard', 'Standard', 'Best quality available. Uses more data.'],
  ];
  const buttons = options.map(([id, label, hint]) => h('button', {
    class: 'opt', type: 'button', 'aria-pressed': String(id === current), dataset: { key: `q-${id}`, quality: id },
    onclick: () => {
      A.prefs.set({ quality: id });
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.quality === id)));
    },
  }, h('span', { class: 'opt-title', text: label }), h('span', { class: 'opt-hint', text: hint })));

  return h('section', { class: 'screen', dataset: { screen: 'settings' } },
    header({ title: 'Settings' }),
    h('div', { class: 'scroll' },
      h('div', { class: 'stack' },
        h('h2', { class: 'section-title', text: 'Video quality' }),
        ...buttons,
        h('h2', { class: 'section-title', text: 'About' }),
        h('p', { class: 'about', text: 'Matinee streams films from the Internet Archive’s public collections and is not affiliated with the Internet Archive. Rights information for each film is the Archive’s and its uploaders’ to give.' }))));
}

export const screens = {
  home: homeScreen,
  shelf: shelfScreen,
  search: searchScreen,
  recent: recentScreen,
  detail: detailScreen,
  player: playerScreen,
  settings: settingsScreen,
};
