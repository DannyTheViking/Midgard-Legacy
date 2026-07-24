MIDGARD LEGACY - BACKPACK & WAGON UPDATE

1. Replace/upload the project files.
2. Run supabase/migrations/011_backpack_transport_weight.sql in Supabase SQL Editor.
3. IMPORTANT: the migration moves every existing inventory item into Storage Yard and empties backpacks.
4. Check item weights in the items table and rebalance any that do not suit your game.
5. Existing players do NOT receive a free cart. They repair it in Wagon Shed using 3 Birch Planks and 1 Small Wheel.
6. Serious hospital accident chance is now 0.01% (0.0001) and test mode is disabled.

Main systems:
- Inventory renamed Backpack.
- Backpack limit: 25kg.
- Wooden Handcart: 100kg.
- Storage Yard: unlimited.
- Storage can load items into Backpack or active transport.
- Tutorial says Backpack and the King hints at the Wagon Shed.


WAGON BUILDER ADDITION
- New pages/wagon-builder.html shop page.
- New css/wagon-builder.css and js/wagon-builder.js.
- Small, medium and large wheels.
- Small, medium and large axles.
- Iron axle fittings, wagon boards and leather horse harness.
- Purchases use Silver and go directly to Storage Yard.
- Run supabase/migrations/012_wagon_builder_shop.sql after migration 011.
