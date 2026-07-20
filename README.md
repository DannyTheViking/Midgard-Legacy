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


## Progression, wealth and signup update

Run `supabase/migrations/002_progression_starter_axe_net_worth.sql` once in Supabase.

Changes:
- Confirm-password field.
- Starter Rusty Axe for every tutorial player.
- Woodcutting and Mining XP bars and level-up messages.
- Long-term cubic XP curve, capped at Level 100.
- Oak requires freedom and Woodcutting Level 5.
- Total Skill is calculated from actual XP, with fresh players starting at 1.
- Net worth includes silver, inventory, storage, carts and equipment.


## Public IDs and Mining update

- Profile URLs use `players.player_number`, while UUIDs remain internal.
- Hall of Fame, Online Players, Friends and Enemies use public player numbers.
- Online players appear on one wrapping line without green circles.
- Bog Iron requires Hands.
- Iron Vein and later mining resources keep their pickaxe requirements.
- The Tool Belt separately displays the currently equipped pickaxe and durability.
- Bog Iron gives a fixed 2 Mining XP per successful action.
- Change `MINING_XP_PER_ACTION` near the top of `js/mining.js` to rebalance it.


## Apiary timer fix
- Fixed `HONEY_TIME_HOURS is not defined`.
- Apiary now uses `HONEY_TIME_SECONDS` from `js/config.js`.
- Hive cards and countdown timers load after building a hive.
