# Feature map

| Feature | HTML | JavaScript | Database |
|---|---|---|---|
| Authentication | `pages/login.html`, `pages/signup.html` | `js/auth.js` | Supabase Auth + player trigger |
| Tutorial | Appears across game pages | `js/tutorial.js` | `players` tutorial columns |
| Profile | `pages/profile.html` | `js/profile.js` | `players`, `statistics`, `skills` |
| Friends & Enemies | `pages/friends-enemies.html` | `js/friends-enemies.js` | `player_relations` |
| Hall of Fame | `pages/hall-of-fame.html` | `js/hall-of-fame.js` | `players`, `skills` |
| King's Raffle | `pages/lottery.html` | `js/lottery.js` | lottery tables/views |
| Property | `pages/property.html` | `js/property.js` | property/storage/apiary tables |

## Social actions currently available

- Add or remove a friend.
- Add or remove an enemy.
- View both lists on one page.
- Open a listed player's profile.

Trade, revive, send money and attack are visible placeholders for their future systems. Revive displays `Okay` when the friend is not currently in hospital.
