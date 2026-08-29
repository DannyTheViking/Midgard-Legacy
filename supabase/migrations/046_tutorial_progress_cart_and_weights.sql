-- Midgard Legacy: tutorial progression reliability
-- Applies to every current and future tutorial player.

CREATE OR REPLACE FUNCTION public.tutorial_named_item_quantity(p_player uuid, p_name text)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
    SELECT COALESCE(SUM(total_qty),0)::bigint
    FROM (
        SELECT COALESCE(SUM(inv.quantity),0)::bigint AS total_qty
        FROM public.inventory inv
        JOIN public.items i ON i.id=inv.item_id
        WHERE inv.player_id=p_player AND lower(i.name)=lower(p_name)
        UNION ALL
        SELECT COALESCE(SUM(ci.quantity),0)::bigint
        FROM public.player_carts pc
        JOIN public.cart_items ci ON ci.cart_id=pc.id
        JOIN public.items i ON i.id=ci.item_id
        WHERE pc.player_id=p_player AND pc.is_active=true AND lower(i.name)=lower(p_name)
        UNION ALL
        SELECT COALESCE(SUM(ps.quantity),0)::bigint
        FROM public.player_storage ps
        JOIN public.items i ON i.id=ps.item_id
        WHERE ps.player_id=p_player AND lower(i.name)=lower(p_name)
    ) q;
$function$;

-- Agreed realistic barrel weights.
UPDATE public.items SET weight_kg=0.5 WHERE lower(name)='barrel staves';
UPDATE public.items SET weight_kg=5.0 WHERE lower(name)='barrel lid';
UPDATE public.items SET weight_kg=30.0 WHERE lower(name)='empty barrel';

-- Tutorial handcart is a temporary King's cart and must carry the whole tutorial chain.
UPDATE public.player_carts
SET capacity=1000, capacity_kg=1000
WHERE transport_type='tutorial_handcart';
