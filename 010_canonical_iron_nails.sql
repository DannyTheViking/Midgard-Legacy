-- MIDGARD LEGACY
-- Canonical Iron Nails item fix
-- Run this once in the Supabase SQL Editor.

begin;

-- Keep the existing item ID (34) so every player inventory row, forge recipe,
-- apiary requirement and future reference continues to use the same item.
update public.items
set
    name = 'Iron Nails',
    description = 'Iron nails forged by hand.'
where id = 34
   or lower(name) in ('hand-forged iron nails', 'iron nails');

-- Property requirements use the same canonical display name.
update public.property_upgrade_requirements
set item_name = 'Iron Nails'
where lower(item_name) in ('hand-forged iron nails', 'iron nails');

commit;
