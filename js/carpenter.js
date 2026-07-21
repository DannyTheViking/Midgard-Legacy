/* =====================================
    MIDGARD LEGACY

    File:
    carpenter.js

    Purpose:
    Turns planks into wooden parts.
===================================== */


/* =====================================
   SETTINGS
===================================== */



const PLANK_COST = 1;
const SHAFT_CREATED = 1;

const STAVES_PLANK_COST = 30;
const STAVES_CREATED = 30;

const LID_PLANK_COST = 5;
const LID_CREATED = 1;

const BARREL_STAVES_COST = 30;
const BARREL_LID_COST = 1;
const BARREL_HOOP_COST = 6;
const EMPTY_BARREL_CREATED = 1;

const BUCKET_PLANK_COST = 5;
const BUCKET_HOOP_COST = 3;
const EMPTY_BUCKET_CREATED = 1;



/* =====================================
   VARIABLES
===================================== */

const craftButton =
    document.getElementById("craft-shaft-button");

const craftStavesButton =
    document.getElementById("craft-staves-button");

const craftLidButton =
    document.getElementById("craft-lid-button");

const craftBarrelButton =
    document.getElementById("craft-barrel-button");

    const craftBucketButton =
    document.getElementById("craft-bucket-button");


/* =====================================
   TEMPORARY MESSAGE
===================================== */


async function loadCarpenterCardStock() {
    const { data: { user } } =
        await supabaseClient.auth.getUser();

    if (!user) return;

    const barrelWood =
        await getBarrelPlankForPlayer(user.id);

    const quantities =
        await getPlayerInventoryQuantities(
            user.id,
            [
                BIRCH_PLANK,
                IRON_HOOP,
                barrelWood.id,
                BARREL_STAVES,
                BARREL_LID
            ]
        );

    const birchPlanks =
        Number(quantities[BIRCH_PLANK] || 0);

    const barrelPlanks =
        Number(quantities[barrelWood.id] || 0);

    const ironHoops =
        Number(quantities[IRON_HOOP] || 0);

    const staves =
        Number(quantities[BARREL_STAVES] || 0);

    const lids =
        Number(quantities[BARREL_LID] || 0);

    setCraftingStock(
        "shaft-stock",
        [
            {
                name: "Birch Planks",
                quantity: birchPlanks
            }
        ],
        "Wooden Shafts",
        birchPlanks
    );

    setCraftingStock(
        "bucket-stock",
        [
            {
                name: barrelWood.name,
                quantity: barrelPlanks
            },
            {
                name: "Iron Hoops",
                quantity: ironHoops
            }
        ],
        "Empty Buckets",
        Math.min(
            Math.floor(barrelPlanks / 5),
            Math.floor(ironHoops / 3)
        )
    );

    setCraftingStock(
        "staves-stock",
        [
            {
                name: barrelWood.name,
                quantity: barrelPlanks
            }
        ],
        "Barrel Staves",
        Math.floor(barrelPlanks / 30) * 30
    );

    setCraftingStock(
        "lid-stock",
        [
            {
                name: barrelWood.name,
                quantity: barrelPlanks
            }
        ],
        "Barrel Lids",
        Math.floor(barrelPlanks / 5)
    );

    setCraftingStock(
        "barrel-stock",
        [
            {
                name: "Barrel Staves",
                quantity: staves
            },
            {
                name: "Barrel Lids",
                quantity: lids
            },
            {
                name: "Iron Hoops",
                quantity: ironHoops
            }
        ],
        "Empty Barrels",
        Math.min(
            Math.floor(staves / 30),
            lids,
            Math.floor(ironHoops / 6)
        )
    );
}


function showTemporaryMessage(id, message) {

    const element = document.getElementById(id);

    if (!element) return;

    element.innerHTML = message;

    setTimeout(function () {
        element.innerHTML = "";
    }, 3000);

}


/* =====================================
   GET CRAFT AMOUNT
===================================== */

function getCraftAmount(inputId) {

    const input =
        document.getElementById(inputId);

    if (!input) return 1;

    const amount =
        Number(input.value);

    if (!amount || amount < 1) return 1;

    return Math.floor(amount);

}


/* =====================================
   CRAFT WOODEN SHAFT
===================================== */

async function craftWoodenShaft() {

    const amount =
        getCraftAmount("shaft-amount");

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) return;

    const totalPlanksNeeded =
        PLANK_COST * amount;

    const totalShaftsMade =
        SHAFT_CREATED * amount;

    const { data: plankItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", BIRCH_PLANK)
        .maybeSingle();

    if (!plankItem || plankItem.quantity < totalPlanksNeeded) {
        showTemporaryMessage(
            "carpenter-message",
            "❌ You need " + totalPlanksNeeded + " Birch Plank."
        );
        return;
    }

    await supabaseClient
        .from("inventory")
        .update({
            quantity: plankItem.quantity - totalPlanksNeeded
        })
        .eq("id", plankItem.id);

    const { data: shaftItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", WOODEN_SHAFT)
        .maybeSingle();

    if (shaftItem) {
        await supabaseClient
            .from("inventory")
            .update({
                quantity: shaftItem.quantity + totalShaftsMade
            })
            .eq("id", shaftItem.id);
    } else {
        await supabaseClient
            .from("inventory")
            .insert({
                player_id: user.id,
                item_id: WOODEN_SHAFT,
                quantity: totalShaftsMade
            });
    }

    await addCarpentryXP(totalShaftsMade * 4);
    await addPlayerXP(Math.max(1, amount));
    await recordCraftingStatistics({
        itemsCrafted: totalShaftsMade,
        carpentryItems: totalShaftsMade
    });
    showTemporaryMessage(
        "carpenter-message",
        "🪵 You craft <strong>" + totalShaftsMade + " Wooden Shaft" +
        (totalShaftsMade > 1 ? "s" : "") + "</strong>."
    );

    loadHomePage();

}

/* =====================================
   CRAFT EPTY BUCKET
===================================== */

async function craftEmptyBucket() {

    const amount = getCraftAmount("bucket-amount");

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) return;

    const totalPlanksNeeded = BUCKET_PLANK_COST * amount;
    const totalHoopsNeeded = BUCKET_HOOP_COST * amount;
    const totalBucketsMade = EMPTY_BUCKET_CREATED * amount;

    const { data: plankItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", BIRCH_PLANK)
        .maybeSingle();

    const { data: hoopItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", IRON_HOOP)
        .maybeSingle();

    if (!plankItem || plankItem.quantity < totalPlanksNeeded) {
        showTemporaryMessage(
            "bucket-message",
            "❌ You need " + totalPlanksNeeded + " Birch Planks."
        );
        return;
    }

    if (!hoopItem || hoopItem.quantity < totalHoopsNeeded) {
        showTemporaryMessage(
            "bucket-message",
            "❌ You need " + totalHoopsNeeded + " Iron Hoops."
        );
        return;
    }

    await supabaseClient
        .from("inventory")
        .update({
            quantity: plankItem.quantity - totalPlanksNeeded
        })
        .eq("id", plankItem.id);

    await supabaseClient
        .from("inventory")
        .update({
            quantity: hoopItem.quantity - totalHoopsNeeded
        })
        .eq("id", hoopItem.id);

    const { data: bucketItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", EMPTY_BUCKET)
        .maybeSingle();

    if (bucketItem) {
        await supabaseClient
            .from("inventory")
            .update({
                quantity: bucketItem.quantity + totalBucketsMade
            })
            .eq("id", bucketItem.id);
    } else {
        await supabaseClient
            .from("inventory")
            .insert({
                player_id: user.id,
                item_id: EMPTY_BUCKET,
                quantity: totalBucketsMade
            });
    }

    await addTutorialProgress(
    "empty_buckets",
    amount,
    TUTORIAL_STEPS.CRAFT_BUCKET,
    TUTORIAL_STEPS.CRAFT_BARREL_PARTS,
    TUTORIAL_TARGETS.empty_buckets
);
    await recordCraftingStatistics({
        itemsCrafted: totalBucketsMade,
        carpentryItems: totalBucketsMade,
        bucketsCrafted: totalBucketsMade
    });

    await addCarpentryXP(totalBucketsMade * 10); await addPlayerXP(Math.max(1, amount));
    showTemporaryMessage(
        "bucket-message",
        "🪣 You craft <strong>" + totalBucketsMade + " Empty Bucket" +
        (totalBucketsMade > 1 ? "s" : "") + "</strong>."
    );

    loadHomePage();
}



async function getBarrelPlankForPlayer(userId){const {data:p}=await supabaseClient.from('players').select('tutorial_complete').eq('id',userId).single();if(!p?.tutorial_complete)return {id:BIRCH_PLANK,name:'Birch Planks'};const oak=await getItemByName(ITEM_NAMES.OAK_PLANK);return {id:oak?.id,name:'Oak Planks'};}

/* =====================================
   CRAFT BARREL STAVES
===================================== */

async function craftBarrelStaves() {

    const amount =
        getCraftAmount("staves-amount");

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) return;

    const barrelWood = await getBarrelPlankForPlayer(user.id);

    const totalPlanksNeeded =
        STAVES_PLANK_COST * amount;

    const totalStavesMade =
        STAVES_CREATED * amount;

    const { data: plankItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", barrelWood.id)
        .maybeSingle();

    if (!plankItem || plankItem.quantity < totalPlanksNeeded) {
        showTemporaryMessage(
            "staves-message",
            "❌ You need " + totalPlanksNeeded + " " + barrelWood.name + "."
        );
        return;
    }

    await supabaseClient
        .from("inventory")
        .update({
            quantity: plankItem.quantity - totalPlanksNeeded
        })
        .eq("id", plankItem.id);

    const { data: stavesItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", BARREL_STAVES)
        .maybeSingle();

    if (stavesItem) {
        await supabaseClient
            .from("inventory")
            .update({
                quantity: stavesItem.quantity + totalStavesMade
            })
            .eq("id", stavesItem.id);
    } else {
        await supabaseClient
            .from("inventory")
            .insert({
                player_id: user.id,
                item_id: BARREL_STAVES,
                quantity: totalStavesMade
            });
    }

await checkTutorialBarrelParts();

    showTemporaryMessage(
        "staves-message",
        "🛢️ You craft <strong>" + totalStavesMade + " Barrel Staves</strong>."
    );

    loadHomePage();

}


/* =====================================
   CRAFT BARREL LID
===================================== */

async function craftBarrelLid() {

    const amount =
        getCraftAmount("lid-amount");

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) return;

    const barrelWood = await getBarrelPlankForPlayer(user.id);

    const totalPlanksNeeded =
        LID_PLANK_COST * amount;

    const totalLidsMade =
        LID_CREATED * amount;

    const { data: plankItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", barrelWood.id)
        .maybeSingle();

    if (!plankItem || plankItem.quantity < totalPlanksNeeded) {
        showTemporaryMessage(
            "lid-message",
            "❌ You need " + totalPlanksNeeded + " " + barrelWood.name + "."
        );
        return;
    }

    await supabaseClient
        .from("inventory")
        .update({
            quantity: plankItem.quantity - totalPlanksNeeded
        })
        .eq("id", plankItem.id);

    const { data: lidItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", BARREL_LID)
        .maybeSingle();

    if (lidItem) {
        await supabaseClient
            .from("inventory")
            .update({
                quantity: lidItem.quantity + totalLidsMade
            })
            .eq("id", lidItem.id);
    } else {
        await supabaseClient
            .from("inventory")
            .insert({
                player_id: user.id,
                item_id: BARREL_LID,
                quantity: totalLidsMade
            });
    }

    await checkTutorialBarrelParts();

    showTemporaryMessage(
        "lid-message",
        "🛢️ You craft <strong>" + totalLidsMade + " Barrel Lid" +
        (totalLidsMade > 1 ? "s" : "") + "</strong>."
    );

    loadHomePage();

}


/* =====================================
   CRAFT EMPTY BARREL
===================================== */

async function craftEmptyBarrel() {

    const amount =
        getCraftAmount("barrel-amount");

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) return;

    const totalStavesNeeded =
        BARREL_STAVES_COST * amount;

    const totalLidsNeeded =
        BARREL_LID_COST * amount;

    const totalHoopsNeeded =
        BARREL_HOOP_COST * amount;

    const totalBarrelsMade =
        EMPTY_BARREL_CREATED * amount;

    const { data: stavesItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", BARREL_STAVES)
        .maybeSingle();

    const { data: lidItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", BARREL_LID)
        .maybeSingle();

    const { data: hoopItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", IRON_HOOP)
        .maybeSingle();

    if (!stavesItem || stavesItem.quantity < totalStavesNeeded) {
        showTemporaryMessage(
            "barrel-message",
            "❌ You need " + totalStavesNeeded + " Barrel Staves."
        );
        return;
    }

    if (!lidItem || lidItem.quantity < totalLidsNeeded) {
        showTemporaryMessage(
            "barrel-message",
            "❌ You need " + totalLidsNeeded + " Barrel Lid" +
            (totalLidsNeeded > 1 ? "s" : "") + "."
        );
        return;
    }

    if (!hoopItem || hoopItem.quantity < totalHoopsNeeded) {
        showTemporaryMessage(
            "barrel-message",
            "❌ You need " + totalHoopsNeeded + " Iron Hoops."
        );
        return;
    }

    await supabaseClient
        .from("inventory")
        .update({
            quantity: stavesItem.quantity - totalStavesNeeded
        })
        .eq("id", stavesItem.id);

    await supabaseClient
        .from("inventory")
        .update({
            quantity: lidItem.quantity - totalLidsNeeded
        })
        .eq("id", lidItem.id);

    await supabaseClient
        .from("inventory")
        .update({
            quantity: hoopItem.quantity - totalHoopsNeeded
        })
        .eq("id", hoopItem.id);

    const { data: barrelItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", EMPTY_BARREL)
        .maybeSingle();

    if (barrelItem) {
        await supabaseClient
            .from("inventory")
            .update({
                quantity: barrelItem.quantity + totalBarrelsMade
            })
            .eq("id", barrelItem.id);
    } else {
        await supabaseClient
            .from("inventory")
            .insert({
                player_id: user.id,
                item_id: EMPTY_BARREL,
                quantity: totalBarrelsMade
            });
    }

    await advanceTutorial(
    TUTORIAL_STEPS.CRAFT_BIRCH_BARREL,
    TUTORIAL_STEPS.VISIT_VILLAGE_APIARY
);

    showTemporaryMessage(
        "barrel-message",
        "🛢️ You craft <strong>" + totalBarrelsMade + " Empty Barrel" +
        (totalBarrelsMade > 1 ? "s" : "") + "</strong>."
    );

    loadHomePage();

}


/* =====================================
   BUTTON EVENTS
===================================== */

if (craftButton) {
    craftButton.addEventListener("click", craftWoodenShaft);
}

if (craftBucketButton) {
    craftBucketButton.addEventListener("click", craftEmptyBucket);
}

if (craftStavesButton) {
    craftStavesButton.addEventListener("click", craftBarrelStaves);
}

if (craftLidButton) {
    craftLidButton.addEventListener("click", craftBarrelLid);
}

if (craftBarrelButton) {
    craftBarrelButton.addEventListener("click", craftEmptyBarrel);
}


async function updateCarpenterWoodLabels(){
 const {data:{user}}=await supabaseClient.auth.getUser(); if(!user)return;
 const {data:p}=await supabaseClient.from('players').select('tutorial_complete').eq('id',user.id).single();
 if(!p?.tutorial_complete)return;
 const set=(id,text)=>{const el=document.getElementById(id);if(el)el.innerText=text;};
 set('staves-title','🛢️ Oak Barrel Staves'); set('staves-wood-label','30 Oak Planks');
 set('lid-title','🛢️ Oak Barrel Lid'); set('lid-wood-label','5 Oak Planks'); set('barrel-title','🛢️ Oak Barrel');
}
updateCarpenterWoodLabels();
    loadCarpenterCardStock();
