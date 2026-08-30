# Update 058 — Patron Enforcement and Recovery Jobs

Run `supabase/migrations/058_patron_enforcement_recovery_jobs.sql` after Update 057.

## What changes

- Patron missions now come from varied NPC clients with missing cargo, private purchases, supply debts, failed bargains and other problems. Winter hardship remains only one possible story idea.
- Every fifth main favour is an enforcement job.
- Sigrid's first enforcement example is a client who traded 10 Birch Logs for 100 Feathers and received nothing.
- Each player receives a persistent named mission target. The target is not a real player account.
- Starting the fight copies the player's current Health, Strength, Defence, Agility and Accuracy to the target.
- The target carries a mission-only Iron Hand Axe so it can legitimately Slash or Stab.
- Winning is not enough: the player must choose **Steal** to recover the exact assigned goods.
- The database grants the guaranteed mission goods only after the correct target is beaten. The player then returns them to the patron to complete the favour and receive payment.
- Abandoning, fleeing, losing or reaching the crowd limit does not recover the goods. After a defeat, the same named target can be attacked again once the player's healer-hut timer ends; the retry takes a fresh snapshot of the player's current battle stats.

The mission fight tables are RPC-only, have RLS enabled, and expose no direct browser table permissions. Public RPCs validate `auth.uid()`, ownership, current mission, current fight state and recovery state on every action.
