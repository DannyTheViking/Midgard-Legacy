# Adding new trees, mines, hunting and other skills

## One source of truth

Unlock levels and XP rewards live in:

`js/game-utils.js` → `MIDGARD_CONTENT_RULES`

Do not scatter level requirements and XP amounts across several files.

## Adding a new tree

1. Add the tree to `MIDGARD_CONTENT_RULES.trees`.
2. Give it:
   - `skill`
   - `levelRequired`
   - `xpPerAction`
3. Add its item to `items`.
4. Add its hidden value to `item_values`.
5. Build the page card using the configuration values.
6. Award XP through `addWoodcuttingXP(...)`.

## Adding a new mine

Follow the same pattern under `MIDGARD_CONTENT_RULES.mines`.

Bog Iron is gathered by hand. Iron Vein and later deposits require pickaxes.

## Adding Hunting

1. The `hunting_xp` database column already exists.
2. Add hunting actions to a Hunting page.
3. Award XP with `addHuntingXP(amount)`.
4. Never update `hunting_xp` directly from page code.

## Important rules

- All XP updates must call `add_skill_xp` through `addSkillXP`.
- Do not perform read-then-write XP updates.
- Gym/combat stats are endless numeric stats and are not Level 1-100 skills.
- Village NPC Carpenter and Forge services do not award personal skill XP.
- Personal Carpentry and Blacksmithing XP begins only after the player builds their own workshop/smithy.
- Disable an action button while its request is running to avoid duplicate actions.
