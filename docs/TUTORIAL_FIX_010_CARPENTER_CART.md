# Tutorial Fix 010 - Village Carpenter Shared Cart Resources

The Village Carpenter now uses server-side shared resources instead of backpack-only inventory checks.

Shared stock includes:
- Backpack
- Active cart / King's Handcart
- Storage Yard

The fix also handles duplicate legacy item rows with the same item name (for example Birch Plank) by consuming across all matching item IDs.

Affected Village Carpenter recipes:
- Wooden Shaft
- Empty Bucket
- Barrel Staves
- Barrel Lid
- Empty Barrel

Tutorial progress is synced after each successful Carpenter craft.
