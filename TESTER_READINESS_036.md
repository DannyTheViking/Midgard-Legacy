# Midgard Legacy — Tester Readiness 036

Database changes are already installed in the connected Supabase project.

## Fixed

- Woodcutting and mining now reduce Iron Axe/Iron Pickaxe durability by one per action.
- Gathering is rolled back when a cart cannot hold the complete reward, so energy and materials are not lost.
- Hunting requires the permanent Hunting Knife and an equipped crafted bow.
- Nettle Patch now gives Nettle Stems and Nettle Leaves.
- Blackberry gathering can provide Blackberry Stems.
- Workbench recipes added for Nettle Cordage and Bramble Cordage.
- Forge recipes added for 25 Iron Arrowheads and one Iron Spearhead from Iron Bars.
- The shared Healer Hut ward is maintained by the database every ten minutes rather than by opening the page.
- Training Grounds shows Total Warrior Stats.
- Trading Post now supports value-based dropdown trading across the current tradeable item catalogue.
- Raffle quantity automatically changes to the minimum amount worth 1,000 Silver.
- Core item values were normalised for gathering, crafting, hunting, trading and raffle goods.

## Retest order

1. Use 10 woodcutting actions and confirm Axe durability falls by 10.
2. Fill the cart near capacity and confirm an oversized haul is rejected without spending energy.
3. Confirm three shared NPC patients exist without opening the Healer Hut first.
4. Gather nettles and confirm both stems and leaves are awarded.
5. Craft Nettle Cordage at the Workbench.
6. Forge Arrowheads and a Spearhead.
7. Try hunting without a knife, without an equipped bow, and then with both.
8. Open Training Grounds and confirm the combined total.
9. Complete a value-based trade.
10. Select raffle items and confirm quantity reaches at least 1,000 guide value automatically.
