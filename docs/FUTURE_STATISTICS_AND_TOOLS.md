# Future statistics and tools

Run:

`supabase/migrations/004_statistics_tools_and_blueprints.sql`

## Adding a statistic to a future action

After the action has succeeded:

```javascript
await incrementGameStatistics({
    arrows_shot: 1,
    arrows_hit: didHit ? 1 : 0,
    arrows_missed: didHit ? 0 : 1,
    damage_done: damage
});
```

Cooking:

```javascript
await incrementGameStatistics({
    food_cooked: burnt ? 0 : quantity,
    food_burnt: burnt ? quantity : 0
});
```

Trades:

```javascript
await incrementGameStatistics({
    trades_completed: 1
});
```

The RPC is atomic, so rapid actions cannot overwrite one another.

## Tool fields

Every item can now have:

- `tool_tier`
- `tool_power`
- `durability_loss_per_use`
- `is_divine`

Iron Axe and Iron Pickaxe are normal long-term tools. The final hidden
tree and mine should require an item where `is_divine = true`.

## Level 10 mentor blueprints

At Blacksmithing Level 10:

- `personal_smithy`

At Carpentry Level 10:

- `carpentry_workshop`

The database unlocks these once. A future mailbox page can show a message
when `message_seen = false`, then mark it true.
