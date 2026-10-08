import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanTitle, parseRuntime, formatRuntime, parseYear, normalizeDoc, dedupeKey, sortItems,
  buildQuery, buildSearchQuery, searchUrl, rankSources, classifyFormat, stripHtml, titleCase,
} from '../js/archive.js';
import { SHELVES, DECADES } from '../js/config.js';

test('cleanTitle strips marketing noise and years', () => {
  assert.equal(cleanTitle('Metropolis (1927) - Full Movie'), 'Metropolis');
  assert.equal(cleanTitle('Night of the Living Dead [HD]'), 'Night of the Living Dead');
  assert.equal(cleanTitle('The_Cabinet_of_Dr._Caligari (1920)'), 'The Cabinet of Dr. Caligari');
  assert.equal(cleanTitle('DETOUR (Restored) (1945)'), 'Detour');
  assert.equal(cleanTitle('Plan 9 from Outer Space - 1959'), 'Plan 9 from Outer Space');
  assert.equal(cleanTitle('His Girl Friday | Public Domain'), 'His Girl Friday');
  assert.equal(cleanTitle(['Nosferatu', 'extra']), 'Nosferatu');
  assert.equal(cleanTitle('Sherlock Holmes.mp4'), 'Sherlock Holmes');
});

test('cleanTitle handles real Archive titles', () => {
  assert.equal(cleanTitle('Little Princess, The'), 'The Little Princess');
  assert.equal(cleanTitle('Haul in One, A'), 'A Haul in One');
  assert.equal(cleanTitle('Charlie Chaplin\'s " The Pawnshop"'), 'Charlie Chaplin\'s "The Pawnshop"');
  assert.equal(cleanTitle('Beyond The Valley Of The Dolls(1970) BD RIP'), 'Beyond The Valley Of The Dolls');
  assert.equal(cleanTitle('Spider-Man: The Animated Series (Complete 1994 Series) [1080p AI Upscale]'), 'Spider-Man: The Animated Series');
  assert.equal(cleanTitle('The General (complete & clearer) (1926)'), 'The General');
  assert.equal(cleanTitle("Satan's Cheerleaders ( 1977)"), "Satan's Cheerleaders");
  assert.equal(cleanTitle('POPEYE Meets Sindbad The Sailor ( 1936)'), 'POPEYE Meets Sindbad The Sailor');
  assert.equal(cleanTitle('Nosferatu_DVD_quality'), 'Nosferatu');
  assert.equal(cleanTitle('Das Kabinett des Doktor Caligari ( The Cabinet of Dr. Caligari )'), 'Das Kabinett des Doktor Caligari (The Cabinet of Dr. Caligari)');
});

test('adult exploitation titles never get through', () => {
  const base = { identifier: 'x', year: '1938', downloads: 99999 };
  for (const title of ['Sex Madness', 'Diary of a Nudist', 'Teaserama', 'Naughty Burlesque Revue']) {
    assert.equal(normalizeDoc({ ...base, title }), null, title);
  }
  assert.ok(normalizeDoc({ ...base, title: 'Essex Boys' }), 'whole words only');
  assert.ok(normalizeDoc({ ...base, title: 'The Naked City' }), 'classics that merely say "naked" stay');
});

test('queries carry the hide clauses', () => {
  assert.match(buildQuery(SHELVES[0], null), /NOT title:\(sex OR sexy OR nude/);
  assert.match(buildQuery(SHELVES[0], null), /NOT subject:\(erotica OR nudist OR sexploitation OR burlesque OR "adult film"\)/);
  assert.match(buildSearchQuery('detour'), /NOT title:\(sex OR/);
});

test('cleanTitle fixes SHOUTY titles but leaves normal ones alone', () => {
  assert.equal(cleanTitle('THE LAST MAN ON EARTH'), 'The Last Man on Earth');
  assert.equal(cleanTitle('The Lost World'), 'The Lost World');
  assert.equal(titleCase('A MAN OF THE WORLD'), 'A Man of the World');
});

test('cleanTitle copes with junk input', () => {
  assert.equal(cleanTitle(undefined), '');
  assert.equal(cleanTitle('   '), '');
  assert.equal(cleanTitle('Tom &amp; Jerry <b>Classics</b>'), 'Tom & Jerry Classics');
});

test('parseRuntime handles the formats Archive actually uses', () => {
  assert.equal(parseRuntime('01:24:03'), 84);
  assert.equal(parseRuntime('1:24:03'), 84);
  assert.equal(parseRuntime('83 min'), 83);
  assert.equal(parseRuntime('83 minutes'), 83);
  assert.equal(parseRuntime('1 hr 23 min'), 83);
  assert.equal(parseRuntime('1h 5m'), 65);
  assert.equal(parseRuntime('5400'), 90);
  assert.equal(parseRuntime('95'), 95);
  assert.equal(parseRuntime('12:30'), 13); // mm:ss
  assert.equal(parseRuntime(['00:09:00']), 9);
});

test('parseRuntime refuses to guess when ambiguous, unless asked to', () => {
  assert.equal(parseRuntime('1:30'), null);
  assert.equal(parseRuntime('6:10', { guess: true }), 6);   // real Archive value for a 6-minute cartoon
  assert.equal(parseRuntime('1:19', { guess: true }), 79);  // real Archive value for a feature
  assert.equal(parseRuntime('105 min.'), 105);               // real Archive values below
  assert.equal(parseRuntime('71min'), 71);
  assert.equal(parseRuntime('68 mins'), 68);
  assert.equal(parseRuntime('27 Min'), 27);
  assert.equal(parseRuntime('6 min 10 sec'), 6);
  assert.equal(parseRuntime('00:92:00'), 92);
  assert.equal(parseRuntime('1:25 min'), null, 'mixed style: not 25 minutes');
  assert.equal(parseRuntime('1:33.13', { guess: true }), null);
  assert.equal(parseRuntime("01:10'31", { guess: true }), null);
  const amb = normalizeDoc({ identifier: 'a', title: 'Ambiguous Feature', year: '1950', runtime: '1:30' });
  assert.ok(amb, 'unsure runtimes never hide a film');
  assert.equal(amb.runtime, 90);
  assert.equal(parseRuntime(''), null);
  assert.equal(parseRuntime(undefined), null);
  assert.equal(parseRuntime('about an hour'), null);
});

test('formatRuntime', () => {
  assert.equal(formatRuntime(null), '');
  assert.equal(formatRuntime(9), '9m');
  assert.equal(formatRuntime(60), '1h');
  assert.equal(formatRuntime(84), '1h 24m');
});

test('parseYear', () => {
  assert.equal(parseYear('1943'), 1943);
  assert.equal(parseYear('1943-05-01'), 1943);
  assert.equal(parseYear(['1931']), 1931);
  assert.equal(parseYear(''), null);
  assert.equal(parseYear('n/a'), null);
});

test('normalizeDoc drops trailers, clips and short fillers; keeps features', () => {
  const base = { identifier: 'x', year: '1950', downloads: 900 };
  assert.equal(normalizeDoc({ ...base, title: 'Metropolis - Official Trailer' }), null);
  assert.equal(normalizeDoc({ ...base, title: 'Clip from Detour' }), null);
  assert.equal(normalizeDoc({ ...base, title: 'Some Short', runtime: '00:09:00' }), null);
  assert.equal(normalizeDoc({ ...base, title: '' }), null);
  assert.equal(normalizeDoc({ title: 'No id' }), null);
  const ok = normalizeDoc({ ...base, title: 'Detour (1945)', runtime: '01:08:00', description: ['<p>Noir &amp; fate.</p>'], creator: ['Edgar G. Ulmer', 'PRC'] });
  assert.equal(ok.title, 'Detour');
  assert.equal(ok.runtime, 68);
  assert.equal(ok.desc, 'Noir & fate.');
  assert.equal(ok.creator, 'Edgar G. Ulmer, PRC');
});

test('short shelves keep short runtimes', () => {
  const doc = { identifier: 'c', title: 'Betty Boop', year: '1933', runtime: '00:07:00', downloads: 800 };
  assert.equal(normalizeDoc(doc), null);
  assert.equal(normalizeDoc(doc, { short: true }).runtime, 7);
});

test('dedupeKey treats re-uploads as the same film', () => {
  const a = { id: '1', title: 'The Last Man on Earth', year: 1964 };
  const b = { id: '2', title: 'Last Man On Earth', year: 1964 };
  const c = { id: '3', title: 'The Last Man on Earth', year: 2011 };
  assert.equal(dedupeKey(a), dedupeKey(b));
  assert.notEqual(dedupeKey(a), dedupeKey(c));
  assert.equal(dedupeKey({ id: 'zz', title: '映画', year: null }), 'id:zz');
});

test('sortItems', () => {
  const list = [
    { title: 'The Zebra', year: 1950 }, { title: 'An Apple', year: 1990 }, { title: 'Mango', year: 1930 },
  ];
  assert.deepEqual(sortItems(list, 'az').map((i) => i.title), ['An Apple', 'Mango', 'The Zebra']);
  assert.deepEqual(sortItems(list, 'year').map((i) => i.year), [1930, 1950, 1990]);
  assert.deepEqual(sortItems(list, 'popular').map((i) => i.title), ['The Zebra', 'An Apple', 'Mango']);
});

test('buildQuery makes sane queries for every shelf and decade', () => {
  for (const shelf of SHELVES) {
    const q = buildQuery(shelf, null);
    assert.match(q, /mediatype:movies/);
    assert.match(q, /NOT access-restricted-item:true/);
    assert.match(q, /downloads:\[\d+ TO 999999999\]/);
    assert.ok(q.includes(`(${shelf.base})`));
    for (const decade of DECADES.slice(1)) {
      assert.match(buildQuery(shelf, decade), new RegExp(`year:\\[${decade.from} TO ${decade.to}\\]`));
    }
  }
});

test('buildSearchQuery sanitises user text', () => {
  assert.equal(buildSearchQuery('   '), null);
  assert.equal(buildSearchQuery('!!!'), null);
  const q = buildSearchQuery("Dr. Jekyll's AND Mr. Hyde (1931)");
  assert.match(q, /title:\(dr AND jekylls AND and AND mr AND hyde AND 1931\)/);
  assert.ok(!/[()]\s*OR\s*creator:\(.*\*/.test(q));
});

test('searchUrl encodes everything', () => {
  const url = new URL(searchUrl('title:(a b) AND year:[1 TO 2]', { page: 3, rows: 10 }));
  assert.equal(url.searchParams.get('output'), 'json');
  assert.equal(url.searchParams.get('page'), '3');
  assert.equal(url.searchParams.get('rows'), '10');
  assert.equal(url.searchParams.get('sort[]'), 'downloads desc');
  assert.ok(url.searchParams.getAll('fl[]').includes('identifier'));
  assert.equal(url.searchParams.get('q'), 'title:(a b) AND year:[1 TO 2]');
});

const FILES = [
  { name: 'film.mp4', format: 'h.264', size: '420000000' },
  { name: 'film_512kb.mp4', format: '512Kb MPEG4', size: '90000000' },
  { name: 'film.ogv', format: 'Ogg Video', size: '300000000' },
  { name: 'film_trailer.mp4', format: 'h.264', size: '9000000' },
  { name: 'extras/bonus.mp4', format: 'h.264', size: '12000000' },
  { name: 'film.gif', format: 'Animated GIF', size: '9000000' },
  { name: 'tiny.mp4', format: 'h.264', size: '1000' },
  { name: 'film_meta.xml', format: 'Metadata', size: '5000' },
];

test('rankSources prefers the light file by default, with fallbacks', () => {
  const out = rankSources(FILES, 'my film', 'light');
  assert.equal(out[0].label, 'light');
  assert.ok(out[0].url.endsWith('/my%20film/film_512kb.mp4'));
  assert.equal(out[1].label, 'h264');
  assert.ok(out[1].url.endsWith('/film.mp4'), 'picks the feature, not the bonus extra');
  assert.ok(out.every((o) => !/trailer|gif|ogv|tiny/.test(o.url)));
});

test('rankSources prefers standard when asked', () => {
  const out = rankSources(FILES, 'x', 'standard');
  assert.equal(out[0].label, 'h264');
  assert.equal(out[1].label, 'light');
});

test('rankSources handles nothing playable', () => {
  assert.deepEqual(rankSources([{ name: 'a.txt', size: '99999999' }], 'x'), []);
  assert.deepEqual(rankSources(undefined, 'x'), []);
});

test('rankSources encodes nested paths', () => {
  const out = rankSources([{ name: 'a b/c#d.mp4', format: 'h.264', size: '5000000' }], 'id');
  assert.ok(out[0].url.endsWith('/id/a%20b/c%23d.mp4'));
});

test('classifyFormat', () => {
  assert.equal(classifyFormat('512Kb MPEG4'), 'light');
  assert.equal(classifyFormat('h.264'), 'h264');
  assert.equal(classifyFormat('h.264 HD'), 'hd');
  assert.equal(classifyFormat('MPEG4'), 'mpeg4');
  assert.equal(classifyFormat('WebM'), 'webm');
  assert.equal(classifyFormat('', 'x_512kb.mp4'), 'light');
  assert.equal(classifyFormat('whatever'), 'other');
});

test('stripHtml', () => {
  assert.equal(stripHtml('<p>Hello<br/>there &amp; &quot;you&quot;</p>'), 'Hello there & "you"');
  assert.equal(stripHtml(null), '');
});
