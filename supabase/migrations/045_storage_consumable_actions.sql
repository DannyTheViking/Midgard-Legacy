ALTER TABLE public.items ADD COLUMN IF NOT EXISTS consume_action text;

UPDATE public.items
SET consume_action = NULL;

UPDATE public.items i
SET consume_action = 'use'
WHERE EXISTS (
    SELECT 1
    FROM public.item_consumable_effects e
    WHERE e.item_id = i.id
)
AND (
    lower(coalesce(i.type, '')) = 'medicine'
    OR lower(coalesce(i.category, '')) IN ('medicine', 'healing')
    OR lower(i.name) LIKE '%bandage%'
    OR lower(i.name) LIKE '%poultice%'
    OR lower(i.name) LIKE '%salve%'
);

UPDATE public.items i
SET consume_action = 'drink'
WHERE consume_action IS NULL
AND EXISTS (
    SELECT 1
    FROM public.item_consumable_effects e
    WHERE e.item_id = i.id
)
AND (
    lower(i.name) LIKE '%mead%'
    OR lower(i.name) LIKE '%ale%'
    OR lower(i.name) LIKE '%broth%'
);

UPDATE public.items i
SET consume_action = 'eat'
WHERE consume_action IS NULL
AND EXISTS (
    SELECT 1
    FROM public.item_consumable_effects e
    WHERE e.item_id = i.id
);

UPDATE public.items
SET usable = true
WHERE consume_action IS NOT NULL;
