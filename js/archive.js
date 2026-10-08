// Talks to the Internet Archive and turns its messy records into tidy ones.
// Nothing in here touches the DOM, so it can be unit-tested in Node.

import { API, PAGE_ROWS, CACHE_TTL_MS, CACHE_VERSION, MAX_RECENT, HIDDEN_TITLE_WORDS, HIDDEN_SUBJECTS } from './config.js';

const FIELDS = ['identifier', 'title', 'year', 'downloads', 'runtime', 'creator', 'description'];
const HIDDEN_TITLE = new RegExp(`\\b(?:${HIDDEN_TITLE_WORDS.join('|')})\\b`, 'i');
const HIDE_CLAUSES = [
  `NOT title:(${HIDDEN_TITLE_WORDS.join(' OR ')})`,
  `NOT subject:(${HIDDEN_SUBJECTS.map((s) => (s.includes(' ') ? `"${s}"` : s)).join(' OR ')})`,
];
const first = (v) => (Array.isArray(v) ? v[0] : v);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ text */

export function stripHtml(input) {
  if (input == null) return '';
  return String(input)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function clip(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

const SMALL_WORDS = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'but', 'or', 'nor', 'vs', 'with', 'from', 'by']);

export function titleCase(text) {
  return text
    .toLowerCase()
    .split(' ')
    .map((word, i) =>
      i > 0 && SMALL_WORDS.has(word)
        ? word
        : word.replace(/^([("'‘“]*)([a-z])/, (_, pre, c) => pre + c.toUpperCase()))
    .join(' ');
}

// "THE_CABINET_OF_DR._CALIGARI (1920) - Full Movie [HD]" -> "The Cabinet of Dr. Caligari"
export function cleanTitle(raw) {
  let t = stripHtml(first(raw) ?? '');
  t = t.replace(/_+/g, ' ');
  t = t.replace(/\.(mp4|avi|mkv|mov|mpe?g|ogv|m4v|wmv)$/i, '');
  // bracketed marketing noise: (Restored), [HD], (Full Movie) ...
  t = t.replace(/\s*[(\[]\s*(?:full\s+(?:movie|film|episode)|hd|4k|1080p|720p|480p|restored|remastered|colou?rized|public\s+domain|complete|uncut|dvd|bluray|blu-ray)[^)\]]*[)\]]/gi, '');
  // trailing " - Full Movie", " | HD" ...
  t = t.replace(/\s*[-–—|:]\s*(?:full\s+(?:movie|film)|hd|1080p|720p|restored|public\s+domain)\b.*$/i, '');
  // a year in brackets anywhere, or after a trailing dash (the year is shown separately)
  t = t.replace(/\s*[(\[]\s*(?:18|19|20)\d{2}\s*[)\]]/g, '');
  t = t.replace(/\s*[-–—]\s*(?:18|19|20)\d{2}\s*$/, '');
  // rip/encode tags that leak into titles
  t = t.replace(/\b(?:bd|br|dvd|web|hd)\s?rip\b/gi, '').replace(/\s+(?:dvd|hd|hq)(?:\s+quality)?$/i, '');
  t = t.replace(/\s+/g, ' ').trim().replace(/^[-–—:|,.\s]+|[-–—:|,\s]+$/g, '');
  // stray space inside an opening quote: Chaplin's " The Pawnshop" -> Chaplin's "The Pawnshop"
  t = t.replace(/(^|[\s(])"\s+/g, '$1"');
  // stray space inside brackets: "( The Cabinet )" -> "(The Cabinet)"
  t = t.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
  // library-style inverted articles: "Little Princess, The" -> "The Little Princess"
  t = t.replace(/^(.+?),\s*(the|a|an)$/i, (_, rest, art) => `${art[0].toUpperCase()}${art.slice(1).toLowerCase()} ${rest}`);
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 4 && letters === letters.toUpperCase()) t = titleCase(t);
  return t;
}

export function parseYear(v) {
  const m = String(first(v) ?? '').match(/(1[89]\d{2}|20[0-3]\d)/);
  return m ? Number(m[1]) : null;
}

// Runtime strings on Archive are all over the place: "01:24:03", "95 min", "1 hr 23 min", "6:10"...
// Returns whole minutes, or null when it can't be sure. With { guess: true } an ambiguous
// two-part value is given a best guess ("6:10" is a cartoon, "1:19" is a feature) - fine for
// showing on screen, but never used to throw a film away.
export function parseRuntime(v, { guess = false } = {}) {
  v = first(v);
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  let mins = null;
  const clock = s.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (clock) {
    const a = Number(clock[1]);
    const b = Number(clock[2]);
    if (clock[3] != null) mins = a * 60 + b + Number(clock[3]) / 60; // h:mm:ss
    else if (a >= 10) mins = a + b / 60;                              // mm:ss
    else if (!guess) return null;                                     // "1:30": hours or minutes? unknown
    else mins = a >= 4 ? a + b / 60 : a * 60 + b;                     // 4:05 reads as mm:ss, 1:19 as h:mm
  } else if (/\d:\d/.test(s)) {
    return null; // "1:25 min", "1:33.13", "01:10'31": mixed styles - don't guess
  } else {
    const h = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
    const m = s.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/);
    if (h || m) mins = (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
    else if (/^\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      mins = n <= 400 ? n : n / 60; // small numbers are minutes, big ones seconds
    }
  }
  return mins && mins > 0 ? Math.round(mins) : null;
}

export function formatRuntime(min) {
  if (!min) return '';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const JUNK_TITLE = /\b(trailers?|teasers?|promos?|previews?|clips?|excerpts?|outtakes?|commentary|soundtrack|screeners?|audiobook|podcast)\b/i;

// Raw Archive record -> clean film, or null if it's junk.
export function normalizeDoc(doc, { short = false } = {}) {
  const id = doc?.identifier;
  const rawTitle = first(doc?.title);
  if (!id || !rawTitle) return null;
  const plainTitle = stripHtml(rawTitle);
  if (JUNK_TITLE.test(plainTitle) || HIDDEN_TITLE.test(plainTitle)) return null;
  const year = parseYear(doc.year ?? doc.date);
  const sure = parseRuntime(doc.runtime); // only a confident reading may reject a film
  if (!short && sure != null && sure < 40) return null;
  const runtime = sure ?? parseRuntime(doc.runtime, { guess: true });
  const title = cleanTitle(rawTitle);
  if (!title) return null;
  const creator = Array.isArray(doc.creator) ? doc.creator.slice(0, 2).join(', ') : doc.creator;
  return {
    id,
    title,
    year,
    runtime,
    downloads: Number(doc.downloads) || 0,
    desc: clip(stripHtml(first(doc.description) ?? ''), 700),
    creator: clip(stripHtml(creator ?? ''), 80),
  };
}

// Archive is full of the same film uploaded five times. Same title + year = same film.
export function dedupeKey(item) {
  const t = item.title.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '');
  return t ? `${t}|${item.year ?? ''}` : `id:${item.id}`;
}

export function sortItems(items, sortId) {
  const list = [...items];
  const name = (item) => item.title.toLowerCase().replace(/^(the|a|an)\s+/, '');
  if (sortId === 'az') list.sort((a, b) => name(a).localeCompare(name(b)));
  else if (sortId === 'year') list.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || name(a).localeCompare(name(b)));
  return list;
}

/* --------------------------------------------------------------- queries */

export function buildQuery(shelf, decade) {
  const from = decade?.from ?? 1880;
  const to = decade?.to ?? 2030;
  const base = shelf.minDownloads ?? 300;
  const min = decade ? Math.max(50, Math.round(base / 3)) : base;
  return [
    `(${shelf.base})`,
    'mediatype:movies',
    'NOT access-restricted-item:true',
    ...HIDE_CLAUSES,
    `year:[${from} TO ${to}]`,
    `downloads:[${min} TO 999999999]`,
  ].join(' AND ');
}

export function buildSearchQuery(text) {
  const terms = String(text ?? '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  if (!terms.length) return null;
  const all = terms.join(' AND ');
  return [
    `(title:(${all}) OR creator:(${all}))`,
    'mediatype:movies',
    'NOT access-restricted-item:true',
    ...HIDE_CLAUSES,
    'year:[1880 TO 2030]',
    'downloads:[50 TO 999999999]',
  ].join(' AND ');
}

export function searchUrl(q, { rows = PAGE_ROWS, page = 1, sort = 'downloads desc' } = {}) {
  const p = new URLSearchParams();
  p.set('q', q);
  for (const f of FIELDS) p.append('fl[]', f);
  if (sort) p.append('sort[]', sort);
  p.set('rows', String(rows));
  p.set('page', String(page));
  p.set('output', 'json');
  return `${API.search}?${p}`;
}

export const thumbUrl = (id) => `${API.thumb}${encodeURIComponent(id)}`;
export const downloadUrl = (id, name) =>
  `${API.download}${encodeURIComponent(id)}/${String(name).split('/').map(encodeURIComponent).join('/')}`;

/* ------------------------------------------------------- network + cache */

async function fetchJSON(url, { timeout = 20000, retries = 1 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await globalThis.fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < retries) await sleep(400);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

const mem = new Map();
const storage = () => {
  try { return globalThis.localStorage ?? null; } catch { return null; }
};

function cacheGet(key) {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.t < CACHE_TTL_MS) return hit.v;
  try {
    const raw = storage()?.getItem(`matinee:${key}`);
    if (raw) {
      const entry = JSON.parse(raw);
      if (Date.now() - entry.t < CACHE_TTL_MS) { mem.set(key, entry); return entry.v; }
    }
  } catch { /* corrupt or unavailable - ignore */ }
  return null;
}

function cacheSet(key, value) {
  const entry = { t: Date.now(), v: value };
  mem.set(key, entry);
  try {
    const raw = JSON.stringify(entry);
    if (raw.length < 250000) storage()?.setItem(`matinee:${key}`, raw);
  } catch { /* storage full or blocked - memory copy is enough */ }
}

/* ----------------------------------------------------------- item store */

const items = new Map();
export const rememberItem = (item) => items.set(item.id, item);
export const getStoredItem = (id) => items.get(id);

export async function getItem(id) {
  const known = items.get(id);
  if (known) return known;
  const q = `identifier:"${String(id).replace(/"/g, '')}"`;
  const data = await fetchJSON(searchUrl(q, { rows: 1, sort: null }));
  const doc = data?.response?.docs?.[0];
  const item = doc ? normalizeDoc(doc, { short: true }) : null;
  if (item) rememberItem(item);
  return item;
}

/* -------------------------------------------------------------- cursors */

// A shelf (optionally narrowed to a decade) that loads page by page, cleaning as it goes.
class Cursor {
  constructor(shelf, decade) {
    this.shelf = shelf;
    this.decade = decade;
    this.items = [];
    this.seen = new Set();
    this.page = 0;
    this.done = false;
    this.pending = null;
  }

  async #fetchPage(page) {
    const key = `${CACHE_VERSION}:${this.shelf.id}|${this.decade?.label ?? 'All'}|p${page}`;
    if (page === 1) {
      const cached = cacheGet(key);
      if (cached) return cached;
    }
    const data = await fetchJSON(searchUrl(buildQuery(this.shelf, this.decade), { page }));
    const docs = data?.response?.docs ?? [];
    if (page === 1 && docs.length) cacheSet(key, docs);
    return docs;
  }

  // Loads the next page and returns only the films it added.
  async next() {
    if (this.done) return [];
    if (this.pending) return this.pending;
    this.pending = (async () => {
      const fresh = [];
      for (let tries = 0; tries < 3 && !fresh.length && !this.done; tries++) {
        const page = ++this.page;
        let docs;
        try {
          docs = await this.#fetchPage(page);
        } catch (err) {
          this.page -= 1;
          throw err;
        }
        if (docs.length < PAGE_ROWS) this.done = true;
        for (const doc of docs) {
          const item = normalizeDoc(doc, { short: this.shelf.short });
          if (!item) continue;
          const key = dedupeKey(item);
          if (this.seen.has(key)) continue;
          this.seen.add(key);
          this.items.push(item);
          fresh.push(item);
          rememberItem(item);
        }
      }
      return fresh;
    })();
    try {
      return await this.pending;
    } finally {
      this.pending = null;
    }
  }
}

const cursors = new Map();
export function getCursor(shelf, decade) {
  const key = `${shelf.id}|${decade?.label ?? 'All'}`;
  if (!cursors.has(key)) cursors.set(key, new Cursor(shelf, decade ?? null));
  return cursors.get(key);
}

export async function searchFilms(text) {
  const q = buildSearchQuery(text);
  if (!q) return [];
  const data = await fetchJSON(searchUrl(q, { rows: 80 }));
  const seen = new Set();
  const out = [];
  for (const doc of data?.response?.docs ?? []) {
    const item = normalizeDoc(doc, { short: true });
    if (!item) continue;
    const key = dedupeKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    rememberItem(item);
    out.push(item);
  }
  return out;
}

/* -------------------------------------------------------------- sources */

const VIDEO_EXT = /\.(mp4|m4v|webm)$/i;
const ORDER = {
  light: ['light', 'h264', 'mpeg4', 'hd', 'webm', 'other'],
  standard: ['h264', 'mpeg4', 'hd', 'light', 'webm', 'other'],
};

export function classifyFormat(format, name = '') {
  const f = String(format ?? '').toLowerCase();
  if (/512\s*kb/.test(f) || /_512kb\./i.test(name)) return 'light';
  if (/hd/.test(f)) return 'hd';
  if (/h\.?264/.test(f)) return 'h264';
  if (/mpeg-?4/.test(f)) return 'mpeg4';
  if (/webm/.test(f) || /\.webm$/i.test(name)) return 'webm';
  return 'other';
}

// Picks up to `limit` playable files: best match first, with different formats as fallbacks.
export function rankSources(files, id, quality = 'light', limit = 3) {
  const order = ORDER[quality] ?? ORDER.light;
  const candidates = (files ?? [])
    .filter((f) => f && f.name && VIDEO_EXT.test(f.name) && !/trailer/i.test(f.name) && f.private !== 'true' && Number(f.size) > 200000)
    .map((f) => ({ f, bucket: classifyFormat(f.format, f.name), size: Number(f.size) }))
    .sort((a, b) => order.indexOf(a.bucket) - order.indexOf(b.bucket) || b.size - a.size);
  const out = [];
  const used = new Set();
  for (const c of candidates) {
    if (used.has(c.bucket)) continue; // one file per format; the biggest wins (the feature, not an extra)
    used.add(c.bucket);
    out.push({ url: downloadUrl(id, c.f.name), label: c.bucket, size: c.size });
    if (out.length >= limit) break;
  }
  return out;
}

const metaPromises = new Map();
export function fetchMeta(id) {
  if (!metaPromises.has(id)) {
    const promise = fetchJSON(`${API.metadata}${encodeURIComponent(id)}`).catch((err) => {
      metaPromises.delete(id);
      throw err;
    });
    metaPromises.set(id, promise);
  }
  return metaPromises.get(id);
}

export async function getSources(id, quality = 'light') {
  const meta = await fetchMeta(id);
  if (!meta || meta.is_dark || meta.metadata?.['access-restricted-item'] === 'true') return [];
  return rankSources(meta.files, id, quality);
}

/* --------------------------------------------------- preferences + recents */

export const prefs = {
  get() {
    try { return { quality: 'light', ...JSON.parse(storage()?.getItem('matinee:prefs') ?? '{}') }; } catch { return { quality: 'light' }; }
  },
  set(patch) {
    const next = { ...prefs.get(), ...patch };
    try { storage()?.setItem('matinee:prefs', JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  },
};

export const recent = {
  get() {
    try {
      const list = JSON.parse(storage()?.getItem('matinee:recent') ?? '[]');
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  },
  add(item) {
    const list = recent.get().filter((r) => r.id !== item.id);
    list.unshift({ id: item.id, title: item.title, year: item.year ?? null, runtime: item.runtime ?? null });
    try { storage()?.setItem('matinee:recent', JSON.stringify(list.slice(0, MAX_RECENT))); } catch { /* ignore */ }
  },
  clear() {
    try { storage()?.removeItem('matinee:recent'); } catch { /* ignore */ }
  },
};
