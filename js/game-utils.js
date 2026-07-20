/* =====================================
   LONG-TERM SKILL PROGRESSION
===================================== */
const MIDGARD_SKILL_NAMES = Object.freeze([
    "woodcutting", "mining", "fishing", "hunting", "farming",
    "blacksmithing", "carpentry", "cooking", "brewing", "combat"
]);

const OAK_WOODCUTTING_LEVEL = 5;

function skillXPForLevel(level) {
    const safeLevel = Math.max(1, Math.min(100, Number(level || 1)));
    return Math.round(100 * Math.pow(safeLevel - 1, 3));
}

function skillLevelFromXP(xp) {
    const safeXP = Math.max(0, Number(xp || 0));
    return Math.max(1, Math.min(100, Math.floor(Math.cbrt(safeXP / 100)) + 1));
}

function skillProgressFromRow(row, skillName) {
    const xp = Math.max(0, Number(row?.[`${skillName}_xp`] || 0));
    const level = skillLevelFromXP(xp);
    const currentLevelXP = skillXPForLevel(level);
    const nextLevelXP = level >= 100 ? currentLevelXP : skillXPForLevel(level + 1);
    const required = Math.max(1, nextLevelXP - currentLevelXP);
    const earned = Math.max(0, xp - currentLevelXP);

    return {
        xp,
        level,
        currentLevelXP,
        nextLevelXP,
        earned,
        required,
        percent: level >= 100 ? 100 : Math.min(100, (earned / required) * 100)
    };
}

function totalSkillFromSkills(row) {
    if (!row) return 1;

    return 1 + MIDGARD_SKILL_NAMES.reduce((total, skillName) => {
        const level = skillLevelFromXP(row[`${skillName}_xp`]);
        return total + Math.max(0, level - 1);
    }, 0);
}

function reputationTitle(n){ const r=[[1000000,'Legend of Midgard'],[500000,'Jarl'],[250000,'Hersir'],[100000,'Thegn'],[50000,'Housecarl'],[25000,'Veteran'],[10000,'Raider'],[5000,'Warrior'],[2500,'Drengr'],[1000,'Freeman'],[0,'Thrall']]; return r.find(([m])=>Number(n||0)>=m)[1]; }
function wealthTitle(n){ const r=[[1000000000,"Midgard's Richest"],[500000000,"Realm's Fortune"],[250000000,"King's Wealth"],[100000000,'Dragon Hoard'],[50000000,"King's Favourite"],[25000000,'Royal Treasurer'],[10000000,'High Lord'],[5000000,'Duke'],[2500000,'Earl'],[1000000,'Lord'],[500000,'Baron'],[250000,'Noble'],[100000,'Affluent'],[50000,'Wealthy'],[25000,'Prosperous'],[10000,'Merchant'],[5000,'Tradesman'],[2500,'Commoner'],[1000,'Labourer'],[500,'Pauper'],[100,'Beggar'],[0,'Penniless']]; return r.find(([m])=>Number(n||0)>=m)[1]; }
function reviveTitle(n){return Number(n||0)>=1000?'Hand of Eir':Number(n||0)>=100?'Healer':Number(n||0)>=10?'First Aider':'Unproven';}
function jailbreakTitle(n){return Number(n||0)>=1000?'Breaker of Chains':Number(n||0)>=100?'Liberator':Number(n||0)>=10?'Lockpicker':'Lawful';}
function pvpTitle(n){return Number(n||0)>=1000?'Warlord':Number(n||0)>=100?'Berserker':Number(n||0)>=10?'Fighter':'Untested';}
async function getItemByName(name){const {data}=await supabaseClient.from('items').select('*').eq('name',name).maybeSingle();return data;}
async function addInventoryById(playerId,itemId,amount){const {data:r}=await supabaseClient.from('inventory').select('*').eq('player_id',playerId).eq('item_id',itemId).maybeSingle();if(r) return supabaseClient.from('inventory').update({quantity:Number(r.quantity||0)+Number(amount||0)}).eq('id',r.id);return supabaseClient.from('inventory').insert({player_id:playerId,item_id:itemId,quantity:amount});}
async function refreshMyNetWorth(){
 const {data:{user}}=await supabaseClient.auth.getUser(); if(!user)return 0;
 const {data,error}=await supabaseClient.rpc('recalculate_player_net_worth',{p_player_id:user.id});
 if(error){console.warn('Net worth refresh unavailable until migration is run:',error.message);return null;}
 return Number(data||0);
}
async function getBarterQuote(offeredItemId,wantedItemId,wantedQuantity=1){
 const ids=[Number(offeredItemId),Number(wantedItemId)];
 const {data,error}=await supabaseClient.from('item_values').select('item_id,silver_value').in('item_id',ids);
 if(error)throw error;
 const offered=Number(data?.find(x=>Number(x.item_id)===ids[0])?.silver_value||0);
 const wanted=Number(data?.find(x=>Number(x.item_id)===ids[1])?.silver_value||0);
 if(!offered||!wanted)throw new Error('One of these items has no hidden base value.');
 return Math.ceil((wanted*Number(wantedQuantity||1))/offered);
}


/* =====================================
   ATOMIC GAME STATISTICS
   Requires migration 004.
   Calls fail softly until the migration
   has been run, so gameplay is not blocked.
===================================== */

async function incrementGameStatistics(changes = {}) {
    const cleanChanges = Object.fromEntries(
        Object.entries(changes)
            .map(([key, value]) => [
                key,
                Math.max(0, Math.floor(Number(value || 0)))
            ])
            .filter(([, value]) => value > 0)
    );

    if (!Object.keys(cleanChanges).length) {
        return true;
    }

    try {
        const { data: { user } } =
            await supabaseClient.auth.getUser();

        if (!user) return false;

        const { error } = await supabaseClient.rpc(
            "increment_player_statistics_json",
            {
                p_player_id: user.id,
                p_changes: cleanChanges
            }
        );

        if (error) {
            console.warn(
                "Statistics update unavailable:",
                error.message
            );
            return false;
        }

        return true;
    } catch (error) {
        console.warn(
            "Statistics update failed safely:",
            error
        );
        return false;
    }
}

async function recordCraftingStatistics({
    itemsCrafted = 0,
    carpentryItems = 0,
    blacksmithItems = 0,
    barsForged = 0,
    nailsForged = 0,
    hoopsForged = 0,
    bucketsCrafted = 0,
    barrelsCrafted = 0,
    planksSawn = 0
} = {}) {
    return incrementGameStatistics({
        items_crafted: itemsCrafted,
        carpentry_items_crafted: carpentryItems,
        blacksmith_items_crafted: blacksmithItems,
        bars_forged: barsForged,
        nails_forged: nailsForged,
        hoops_forged: hoopsForged,
        buckets_crafted: bucketsCrafted,
        barrels_crafted: barrelsCrafted,
        planks_sawn: planksSawn
    });
}


/* =====================================
   GAME ACTIVITY DATABASE LOG
   Requires migration 006.

   This is deliberately fail-soft:
   game actions remain successful if the
   optional activity log is unavailable.
===================================== */

async function logGameActivity(
    activityType,
    details = {}
) {
    try {
        const { data: { user } } =
            await supabaseClient.auth.getUser();

        if (!user || !activityType) return false;

        const { error } = await supabaseClient.rpc(
            "log_player_activity",
            {
                p_player_id: user.id,
                p_activity_type: String(activityType),
                p_details: details || {}
            }
        );

        if (error) {
            console.warn(
                "Activity log unavailable:",
                error.message
            );
            return false;
        }

        return true;
    } catch (error) {
        console.warn(
            "Activity logging failed safely:",
            error
        );
        return false;
    }
}

async function createPlayerNotification({
    type = "system",
    title,
    message,
    icon = "🔔",
    link = null,
    uniqueKey = null
}) {
    try {
        const { data: { user } } =
            await supabaseClient.auth.getUser();

        if (!user || !title || !message) {
            return false;
        }

        const { error } = await supabaseClient.rpc(
            "create_player_notification",
            {
                p_player_id: user.id,
                p_type: type,
                p_title: title,
                p_message: message,
                p_icon: icon,
                p_link: link,
                p_unique_key: uniqueKey
            }
        );

        if (error) {
            console.warn(
                "Notification unavailable:",
                error.message
            );
            return false;
        }

        return true;
    } catch (error) {
        console.warn(
            "Notification failed safely:",
            error
        );
        return false;
    }
}


/* =====================================
   CRAFTING CARD INVENTORY HELPERS
===================================== */

function getPositiveCraftAmount(inputId, fallback = 1) {
    const input = document.getElementById(inputId);
    const amount = Math.floor(Number(input?.value || fallback));

    return Math.max(1, Math.min(9999, amount));
}

async function getPlayerInventoryQuantities(
    playerId,
    itemIds
) {
    const uniqueIds = [
        ...new Set(
            itemIds
                .map(Number)
                .filter(Number.isFinite)
        )
    ];

    if (!uniqueIds.length) return {};

    const { data, error } = await supabaseClient
        .from("inventory")
        .select("item_id, quantity")
        .eq("player_id", playerId)
        .in("item_id", uniqueIds);

    if (error) {
        console.warn(
            "Crafting inventory failed to load:",
            error.message
        );
        return {};
    }

    return Object.fromEntries(
        (data || []).map(row => [
            Number(row.item_id),
            Number(row.quantity || 0)
        ])
    );
}

function setCraftingStock(
    elementId,
    owned,
    canMake,
    outputOwned = null
) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const outputText =
        outputOwned === null
            ? ""
            : ` · Made item: ${Number(outputOwned).toLocaleString()}`;

    element.innerHTML = `
        <span>Owned: ${Number(owned || 0).toLocaleString()}</span>
        <span>Can make: ${Number(canMake || 0).toLocaleString()}</span>
        ${outputText ? `<span>${outputText}</span>` : ""}
    `;
}

async function changeInventoryQuantity(
    playerId,
    itemId,
    amount
) {
    const safeAmount = Math.trunc(Number(amount || 0));
    if (!safeAmount) return true;

    const { data: row, error: loadError } =
        await supabaseClient
            .from("inventory")
            .select("id, quantity")
            .eq("player_id", playerId)
            .eq("item_id", itemId)
            .maybeSingle();

    if (loadError) throw loadError;

    const current = Number(row?.quantity || 0);
    const next = current + safeAmount;

    if (next < 0) {
        throw new Error("Not enough materials.");
    }

    if (row && next === 0) {
        const { error } = await supabaseClient
            .from("inventory")
            .delete()
            .eq("id", row.id);

        if (error) throw error;
        return true;
    }

    if (row) {
        const { error } = await supabaseClient
            .from("inventory")
            .update({ quantity: next })
            .eq("id", row.id);

        if (error) throw error;
        return true;
    }

    const { error } = await supabaseClient
        .from("inventory")
        .insert({
            player_id: playerId,
            item_id: itemId,
            quantity: next
        });

    if (error) throw error;
    return true;
}
