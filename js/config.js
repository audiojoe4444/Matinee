// Everything you are likely to want to tweak lives in this file.

export const API = {
  search: 'https://archive.org/advancedsearch.php',
  metadata: 'https://archive.org/metadata/',
  thumb: 'https://archive.org/services/img/',
  download: 'https://archive.org/download/',
};

export const PAGE_ROWS = 60;               // films requested per page
export const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // how long shelf results are reused
export const CACHE_VERSION = 'v2';         // bump to throw away every cached shelf

// Archive's popular lists include some adult exploitation titles. These are filtered out of every
// shelf and search (both in the query and again on the way in). Extend if you spot more.
export const HIDDEN_TITLE_WORDS = ['sex', 'sexy', 'nude', 'nudist', 'nudie', 'erotic', 'erotica', 'burlesque', 'teaserama', 'porn', 'porno', 'orgy'];
export const HIDDEN_SUBJECTS = ['erotica', 'nudist', 'sexploitation', 'burlesque', 'adult film'];
export const MAX_RECENT = 12;              // "Recently watched" length
export const SEEK_SECONDS = 15;            // skip back / forward step
export const CONTROLS_HIDE_MS = 4500;      // player controls fade after this long

// Decade filter chips. "20s" deliberately starts at 1880 so anything older rides along.
export const DECADES = [
  { label: 'All' },
  { label: '20s', from: 1880, to: 1929 },
  { label: '30s', from: 1930, to: 1939 },
  { label: '40s', from: 1940, to: 1949 },
  { label: '50s', from: 1950, to: 1959 },
  { label: '60s+', from: 1960, to: 2030 },
];

export const SORTS = [
  { id: 'popular', label: 'Popular' },
  { id: 'az', label: 'A–Z' },
  { id: 'year', label: 'Year' },
];

// The shelves are the whole point: instead of Archive's raw search, each shelf is a
// hand-picked slice. `base` is an Archive search clause; the app adds the clean-up rules.
//   minDownloads  - popularity floor, which is what keeps junk uploads out
//   short         - true for shelves where short runtimes are normal (cartoons, silents)
export const SHELVES = [
  { id: 'top',          title: 'Top Picks',       blurb: 'Crowd favourites',          accent: '#ffb547',
    base: 'collection:(feature_films)', minDownloads: 2000 },
  { id: 'noir',         title: 'Film Noir',       blurb: 'Shadows and trench coats',  accent: '#9db4ff',
    base: 'collection:(Film_Noir)', minDownloads: 300 },
  { id: 'scifi-horror', title: 'Sci-Fi & Horror', blurb: 'Monsters, rockets, robots', accent: '#7ff0b0',
    base: 'collection:(SciFi_Horror)', minDownloads: 300 },
  { id: 'comedy',       title: 'Comedy',          blurb: 'Slapstick to screwball',    accent: '#ffd86b',
    base: 'collection:(Comedy_Films)', minDownloads: 300 },
  { id: 'western',      title: 'Westerns',        blurb: 'Saddle up',                 accent: '#ffa36b',
    base: '(collection:(feature_films) OR collection:(moviesandfilms)) AND subject:(western)', minDownloads: 300 },
  { id: 'mystery',      title: 'Mystery & Crime', blurb: 'Whodunits and gangsters',   accent: '#c8a2ff',
    base: 'collection:(feature_films) AND subject:(mystery OR crime OR detective OR gangster)', minDownloads: 300 },
  { id: 'silent',       title: 'Silent Classics', blurb: 'Before the talkies',        accent: '#e8e8e8',
    base: 'collection:(silent_films)', minDownloads: 200, short: true },
  { id: 'cartoons',     title: 'Cartoons',        blurb: 'Vintage animation',         accent: '#ff8fb8',
    base: 'collection:(animationandcartoons)', minDownloads: 500, short: true },
];
