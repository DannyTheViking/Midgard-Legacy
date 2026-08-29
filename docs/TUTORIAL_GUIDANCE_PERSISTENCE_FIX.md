# Tutorial Guidance Persistence Fix

The tutorial manager is now loaded on every protected game page.

Previously, only a subset of pages loaded `js/tutorial.js`. If a player dismissed the tutorial popup and then navigated to a page such as Profile, the target highlight disappeared because that page had no tutorial manager running.

Now the current tutorial step is read from Supabase on every protected page and the relevant sidebar destination/card/button is highlighted again automatically. The popup remains dismissed for the current browser session after the player presses **Got it**, while the guidance glow continues until the tutorial objective changes.
