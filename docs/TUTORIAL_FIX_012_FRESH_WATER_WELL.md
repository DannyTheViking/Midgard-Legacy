# Tutorial Fix 012 - Fresh Water Well

- Added Village Well world location and village card.
- Tutorial water step now sends players to a fresh-water source rather than filling a bucket from Backpack UI.
- Added server RPC `fill_fresh_water_bucket` which consumes an Empty Bucket from Backpack + active cart + Storage Yard and places the Water Bucket into the active cart when available.
- Removed the Backpack Fill With Water button from rendered inventory cards.
- Redesigned Backpack inventory UI for responsive card layout.
- Apiary now sends tutorial players to the Village Well after collecting Royal Honey.
