-- Run this only after migration 004.
-- It confirms that the important counters exist.

select
    column_name,
    data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'statistics'
  and column_name in (
      'ore_mined',
      'mining_actions',
      'resources_gathered',
      'items_crafted',
      'blacksmith_items_crafted',
      'bars_forged'
  )
order by column_name;
