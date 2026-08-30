# Update 057 — Character Figures, Weapon Rules and Patron Favours

Run `supabase/migrations/057_character_dolls_patron_favours_weapon_rules.sql` in Supabase after Update 056.

## What changes

- Bedroom and PvP combat now use a full-body male or female Viking figure.
- Equipped helmets, body armour, leg armour, footwear, shields, melee weapons, bows, arrows, accessories and utility gear appear as visual layers on the figure.
- Players choose their male or female Viking body in the Bedroom; this is saved and shown to opponents in combat.
- Slash and Stab require an equipped main-hand weapon in both the browser and the database. Unarmed defenders cannot produce fake Slash/Stab counterattacks.
- The existing victory choice is fully backed by the database. Winners may abandon the defeated Viking or steal 10% of eligible Backpack/active-cart resource stacks; Storage Yard items and equipment are safe.
- Mission contacts are reframed as powerful village patrons. A player may ask an unlocked patron for a Silver advance, then repay the favour across the next ten main jobs while keeping normal job rewards.

The new RPCs are restricted to signed-in players and validate the current player with `auth.uid()`.
