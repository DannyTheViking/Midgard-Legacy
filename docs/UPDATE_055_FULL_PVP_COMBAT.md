# Update 055 - Full PvP Combat

## Player flow

1. Search Players or open a public profile.
2. Press **Attack**.
3. Battle opens with both Vikings, equipped armour/weapons, and health shown beneath each fighter.
4. Select a body part, then Slash, Stab or Shoot.
5. Shooting consumes one Arrow immediately and the visible ammo counter falls after every shot.
6. The defender automatically counterattacks, allowing offline/inactive mission targets to be fought.
7. Use Bandage consumes one Herbal Bandage and restores 5 HP.
8. Flee attempts to escape using Agility.
9. KO sends the loser to the healer hut for 30 minutes.
10. Both players receive a notification linking to the complete permanent attack log.

## Mission support

`player_defeated_since(player_id, target_id, offered_at)` provides a server-side way for a future mission objective such as “Attack Bob and get my property back” to prove that the mission player actually defeated the requested target after accepting the mission.

## Security

The browser never calculates damage or changes health directly. Combat tables are not directly readable/writable by authenticated clients. All actions use security-definer RPCs that validate the signed-in player.

## UI placement requested

- Both Vikings are shown at the top of the arena with equipped armour/weapons around them.
- **Health sits directly underneath each Viking.**
- **Action buttons sit immediately below the health/arena.**
- **Weapons, bow, shield and live Arrow count sit below the action buttons at the bottom.**
- Clicking a body-part target changes the location named in the server-generated attack log.

## Files changed

- `pages/combat.html` (new)
- `css/combat.css` (new)
- `js/combat.js` (new)
- `js/profile.js`
- `pages/profile.html`
- `js/players.js`
- `pages/players.html`
- `css/players.css`
- `supabase/migrations/055_full_pvp_combat.sql` (new)
