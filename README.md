# Matinee

Classic films from the [Internet Archive](https://archive.org), tidied up and sorted for the
**Meta Ray-Ban Display** glasses. A plain HTML/CSS/JS web app: no build step, no framework,
no API keys, no accounts.

The Archive is enormous and messy. Matinee doesn't show you its raw search. It shows
hand-picked **shelves** (Top Picks, Film Noir, Sci-Fi & Horror, Comedy, Westerns, Mystery &
Crime, Silent Classics, Cartoons), and cleans up what comes back:

- Re-uploads of the same film are collapsed into one.
- Trailers, clips, previews and commentary tracks are dropped; so are feature shelves' sub-40-minute entries.
- Titles are tidied: `Little Princess, The` becomes *The Little Princess*; `DETOUR (1945) - Full Movie [HD]`
  becomes *Detour*; rip tags, stray years and odd spacing are removed.
- Only popular uploads are shown (a download floor per shelf), which keeps junk uploads out.
- Adult exploitation titles are filtered out (see `HIDDEN_TITLE_WORDS` in `js/config.js`).
- Each shelf has **decade chips** (20s, 30s, 40s, 50s, 60s+) and a **sort** button (Popular, A–Z, Year).

## Controls

Everything is a native `<button>`/`<input>`, so the glasses' own directional navigation and Select
work with no custom key handling. The system **Back** gesture steps back one screen from anywhere
(screens are browser history entries; Matinee never goes deeper than 4, under Meta's limit of 5).

- **Home:** pick a shelf, search (activating the field opens the system composer for handwriting or
  dictation), or open *Recently watched* / *Settings*.
- **Shelf:** browse films, filter by decade, change the sort order, *More films* at the end.
- **Film:** art, year, runtime, description and **Play**.
- **Player:** full screen. Select shows **−15s · Play/Pause · +15s · Exit**; the bar hides itself
  after a few seconds and Select brings it back. Every play starts from the beginning.
- **Settings:** *Light* (the Archive's small 512kb version, fast to start) or *Standard*.

Back and scroll position are restored when you return to a screen.

## Put it on GitHub and onto the glasses

1. Create a GitHub repo and push this folder to it.
2. In the repo: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**.
   Keep the empty `.nojekyll` file: without it GitHub Pages hides the `.well-known` folder that holds
   the app manifest.
3. Your app lives at `https://<you>.github.io/<repo>/` (keep the trailing slash).
4. Turn on developer mode in the **Meta AI** app, then **App Settings → Apps → Web Apps →
   Connect Web App**, enter that URL and Save. Matinee appears at the bottom of the glasses' app grid.

The app name and icon come from `.well-known/meta-wearables-manifest.json` (icon: `icons/icon.svg`,
a single-colour mask). Meta's docs: <https://wearables.developer.meta.com/docs/develop/webapps>

### Try it on a computer first

Open the page in Chrome at a 600 × 600 window, or use Meta's *Meta Ray-Ban Display Simulator*
Chrome extension. `npm run serve` (needs Python 3) serves the folder locally on port 8080.

## Customising

Everything you'd want to change is in **`js/config.js`**:

- `SHELVES`: add, remove or reorder shelves. Each is an Archive search clause plus a popularity
  floor. `short: true` allows short runtimes (cartoons, silents).
- `DECADES`, `SORTS`, `SEEK_SECONDS`, `CONTROLS_HIDE_MS`, `HIDDEN_TITLE_WORDS`.
- Shelf results are cached on the glasses for 12 hours so the app opens quickly. Bump `CACHE_VERSION`
  to clear them.

## Tests

`npm test` (Node 20+, no dependencies) runs the unit tests for the clean-up and query logic.

## Notes

- Films are streamed straight from archive.org. Matinee has no server and stores only your quality
  setting, a short *Recently watched* list and cached shelf results, all on the device.
- Matinee is not affiliated with the Internet Archive. Rights information for each film belongs to
  the Archive and its uploaders; the collections used here are largely public-domain or
  freely-shared, but that isn't guaranteed for every item.
