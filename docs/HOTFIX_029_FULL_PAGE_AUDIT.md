# Hotfix 029 – Full Page Loading Audit

## Fault found

`bedroom.html`, `tasks.html`, and `map.html` loaded `components.js` without first loading:

- `auth.js`, which creates `supabaseClient`
- `game-utils.js`, which provides shared skill helpers used by the top bar

This caused an immediate JavaScript reference error. The visible result was:

- player name staying as `Loading...`
- all top-bar stats staying blank
- Bedroom equipment never leaving its loading state
- Warrior Tasks showing an empty panel
- Map shared layout failing as well

## Fix

The three affected pages now load the common scripts in this order:

1. Supabase library
2. `config.js`
3. `auth.js`
4. `game-utils.js`
5. `components.js`
6. page-specific JavaScript

Cache versions were increased on the affected pages.

## Audit completed

- All page HTML files checked for missing local scripts, stylesheets, images, and links.
- All pages using `components.js` checked for the required authentication and shared utility scripts.
- Script ordering checked.
- Every JavaScript file passed `node --check` syntax validation.
- Duplicate HTML IDs checked.
- Supabase RPC functions for Bedroom and Warrior Tasks confirmed present.

## Files changed

- `pages/bedroom.html`
- `pages/tasks.html`
- `pages/map.html`
