# Update 054 - Viking Missions and Players

## New systems

- `pages/missions.html` - 10-contact Viking contract system.
- `pages/players.html` - global player directory and username search.
- `js/missions.js`, `css/missions.css`.
- `js/players.js`, `css/players.css`.
- `supabase/migrations/054_viking_missions_and_player_directory.sql`.

## Mission rules

- 10 named Viking contacts.
- 100 sequential main missions per contact (1,000 main missions total).
- Only contact 1 starts unlocked.
- Finish all 100 for one contact to unlock the next.
- 5 main missions may be completed per player per day; the server enforces the cap and it resets at midnight.
- Every 10th mission unlocks an optional bonus favour.
- Bonus favours do not consume the five-per-day allowance.
- Contact 1 pays 10 Silver per normal mission, contact 2 pays 20, through contact 10 paying 100, plus an item reward.
- Bonus favours pay base Silver + 15 plus an item reward.
- Mission item hand-ins accept stock from Backpack + active transport + Storage Yard.
- Every bonus tries to attach an inactive player cameo (last online more than 30 days ago). If none exists, the bonus remains a normal NPC favour.

## Players page

- Username search.
- Pagination.
- Online-only filter.
- Online status, last-online age, Total Skill, Skill Rank, Freeman/Thrall status, reputation.
- Every result links to the existing public profile using player number.
- Only public-safe fields are returned by the database RPC.
