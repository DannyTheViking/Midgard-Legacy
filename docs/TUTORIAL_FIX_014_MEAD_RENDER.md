# Tutorial Fix 014 - Mead Hall barrel render

## Problem
Adding an Empty Barrel succeeded in Supabase, but the Mead Hall went blank immediately afterwards.

## Cause
`renderMeadShelves()` called `buildBarrelCard(barrel)`, but `buildBarrelCard` did not exist in `js/mead.js`. As soon as a real barrel row existed, JavaScript threw a ReferenceError and stopped rendering the shelves.

## Fix
Added a single barrel-state router that supports current and legacy stage/status values:

- `barrel_added`, `empty`, `installed`, `ready_to_fill` -> installed/ready-to-fill card
- `brewing`, `fermenting` -> brewing card
- `ready`, `finished`, `complete`, `completed` -> collection card
- unknown states fall back safely to the installed barrel card instead of blanking the page

No database rollback is required. Existing barrels, including a barrel already added before this fix, render correctly after deployment and refresh.
