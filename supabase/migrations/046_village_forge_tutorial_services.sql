-- Village Forge tutorial services.
-- The Village Forge is separate from the player's Property Forge.
-- Players supply materials; Bjørn/village supply fuel and tools.

CREATE OR REPLACE FUNCTION public.village_forge_make_iron_bars(p_batches integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
    v_player uuid := auth.uid();
    v_batches integer := greatest(1, coalesce(p_batches,1));
    v_bog_id bigint; v_bar_id bigint; v_bog_needed bigint; v_bars_made bigint;
    v_destination text; v_tutorial jsonb;
BEGIN
    IF v_player IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;
    IF v_batches > 100 THEN RAISE EXCEPTION 'Choose between 1 and 100 batches.'; END IF;
    SELECT id INTO v_bog_id FROM public.items WHERE lower(name)='bog iron' ORDER BY id LIMIT 1;
    SELECT id INTO v_bar_id FROM public.items WHERE lower(name)='iron bar' ORDER BY id LIMIT 1;
    IF v_bog_id IS NULL OR v_bar_id IS NULL THEN RAISE EXCEPTION 'Forge materials are missing.'; END IF;
    v_bog_needed := v_batches * 5; v_bars_made := v_batches;
    IF public.carried_item_quantity(v_player,v_bog_id) < v_bog_needed THEN
        RAISE EXCEPTION 'You need % Bog Iron in your backpack or active cart.', v_bog_needed;
    END IF;
    PERFORM public.consume_carried_item(v_player,v_bog_id,v_bog_needed);
    v_destination := public.grant_gathered_item(v_player,v_bar_id,v_bars_made);
    PERFORM public.add_statistics(v_player,jsonb_build_object('items_crafted',v_bars_made,'bars_forged',v_bars_made));
    BEGIN v_tutorial := public.sync_my_tutorial_progress(); EXCEPTION WHEN others THEN v_tutorial := NULL; END;
    RETURN jsonb_build_object('bog_iron_used',v_bog_needed,'iron_bars_made',v_bars_made,'destination',v_destination,'tutorial',v_tutorial);
END;
$function$;

CREATE OR REPLACE FUNCTION public.village_forge_make_iron_hoops(p_batches integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
    v_player uuid := auth.uid();
    v_batches integer := greatest(1, coalesce(p_batches,1));
    v_bar_id bigint; v_hoop_id bigint; v_bars_needed bigint; v_hoops_made bigint;
    v_destination text; v_tutorial jsonb;
BEGIN
    IF v_player IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;
    IF v_batches > 100 THEN RAISE EXCEPTION 'Choose between 1 and 100 batches.'; END IF;
    SELECT id INTO v_bar_id FROM public.items WHERE lower(name)='iron bar' ORDER BY id LIMIT 1;
    SELECT id INTO v_hoop_id FROM public.items WHERE lower(name)='iron hoop' ORDER BY id LIMIT 1;
    IF v_bar_id IS NULL OR v_hoop_id IS NULL THEN RAISE EXCEPTION 'Forge materials are missing.'; END IF;
    v_bars_needed := v_batches; v_hoops_made := v_batches * 2;
    IF public.carried_item_quantity(v_player,v_bar_id) < v_bars_needed THEN
        RAISE EXCEPTION 'You need % Iron Bars in your backpack or active cart.', v_bars_needed;
    END IF;
    PERFORM public.consume_carried_item(v_player,v_bar_id,v_bars_needed);
    v_destination := public.grant_gathered_item(v_player,v_hoop_id,v_hoops_made);
    PERFORM public.add_statistics(v_player,jsonb_build_object('items_crafted',v_hoops_made,'hoops_forged',v_hoops_made));
    BEGIN v_tutorial := public.sync_my_tutorial_progress(); EXCEPTION WHEN others THEN v_tutorial := NULL; END;
    RETURN jsonb_build_object('iron_bars_used',v_bars_needed,'iron_hoops_made',v_hoops_made,'destination',v_destination,'tutorial',v_tutorial);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_village_forge_materials()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
    v_player uuid := auth.uid(); v_bog_id bigint; v_bar_id bigint; v_hoop_id bigint;
BEGIN
    IF v_player IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;
    SELECT id INTO v_bog_id FROM public.items WHERE lower(name)='bog iron' ORDER BY id LIMIT 1;
    SELECT id INTO v_bar_id FROM public.items WHERE lower(name)='iron bar' ORDER BY id LIMIT 1;
    SELECT id INTO v_hoop_id FROM public.items WHERE lower(name)='iron hoop' ORDER BY id LIMIT 1;
    RETURN jsonb_build_object(
        'bog_iron',coalesce(public.carried_item_quantity(v_player,v_bog_id),0),
        'iron_bars',coalesce(public.carried_item_quantity(v_player,v_bar_id),0),
        'iron_hoops',coalesce(public.carried_item_quantity(v_player,v_hoop_id),0)
    );
END;
$function$;
