# Midgard Legacy

A browser-based Viking MMO built with HTML, CSS, JavaScript and Supabase.

## Start here

- Open `pages/index.html` for the public landing page.
- Game pages are in `pages/`.
- Page behaviour is in `js/` and normally has the same name as its HTML page.
- Shared layout files are in `components/`.
- Shared styling is in `css/style.css`.
- Supabase changes are in `supabase/migrations/`.

## Friends and enemies setup

Before testing the social page, run this file in Supabase SQL Editor:

`supabase/migrations/001_player_relations.sql`

The new page is:

`pages/friends-enemies.html`

The matching code is:

`js/friends-enemies.js`

## Deploying

1. Replace the files in the GitHub repository with this clean build.
2. Commit and push to the `main` branch.
3. Vercel will deploy the new commit.
4. Hard-refresh the browser after deployment.

Do not upload the `.git` folder inside a ZIP. GitHub already stores project history separately.
