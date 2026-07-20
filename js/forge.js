/* =====================================

    MIDGARD LEGACY

    File:
    forge.js

    Purpose:
    Turns raw iron into metal bars.

===================================== */


const BOG_IRON_COST = 5;
const IRON_BARS_CREATED = 1;

const NAILS_PER_BAR = 25;

const IRON_BAR_COST_FOR_AXE_HEAD = 2;
const AXE_HEAD_CREATED = 1;

const IRON_BAR_COST_FOR_HOOPS = 1;
const HOOPS_CREATED = 2;
/* =====================================
   VARIABLES
===================================== */

const forgeButton =
    document.getElementById("forge-iron-bar-button");

const forgeNailsButton =
    document.getElementById("forge-nails-button");

const forgeAxeHeadButton =
    document.getElementById("forge-axe-head-button");

const forgeHoopButton =
    document.getElementById("forge-hoop-button");


/* =====================================
   TEMPORARY MESSAGE
===================================== */

function showTemporaryMessage(id, message) {
    const element = document.getElementById(id);

    if (!element) return;

    element.innerHTML = message;

    setTimeout(function () {
        element.innerHTML = "";
    }, 3000);
}
/* =====================================
   FORGE IRON BAR
===================================== */

async function forgeIronBar() {

    /* =====================================
       GET CURRENT PLAYER
    ===================================== */

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) {
        window.location.href = "login.html";
        return;
    }


    /* =====================================
       CHECK PLAYER HAS BOG IRON
    ===================================== */

    const { data: bogIronItem, error } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", BOG_IRON)
        .maybeSingle();

    if (error) {
        document.getElementById("forge-message").innerText =
            error.message;
        return;
    }


    /* =====================================
       CHECK PLAYER HAS ENOUGH BOG IRON
    ===================================== */

    if (!bogIronItem || bogIronItem.quantity < BOG_IRON_COST) {

        document.getElementById("forge-message").innerHTML =
            "❌ You need at least 5 Bog Iron.";

        return;
    }


    /* =====================================
       REMOVE BOG IRON
    ===================================== */

    await supabaseClient
        .from("inventory")
        .update({
            quantity: bogIronItem.quantity - BOG_IRON_COST
        })
        .eq("id", bogIronItem.id);


    /* =====================================
       CHECK IF PLAYER ALREADY HAS IRON BARS
    ===================================== */

    const { data: ironBarItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", IRON_BAR)
        .maybeSingle();


    /* =====================================
       ADD IRON BAR
    ===================================== */

    if (ironBarItem) {

        await supabaseClient
            .from("inventory")
            .update({
                quantity: ironBarItem.quantity + IRON_BARS_CREATED
            })
            .eq("id", ironBarItem.id);

    } else {

        await supabaseClient
            .from("inventory")
            .insert({
                player_id: user.id,
                item_id: IRON_BAR,
                quantity: IRON_BARS_CREATED
            });

    }

    await addTutorialProgress(
    "iron_bars",
    1,
    TUTORIAL_STEPS.FORGE_IRON_BARS,
    TUTORIAL_STEPS.FORGE_IRON_HOOPS,
    TUTORIAL_TARGETS.iron_bars
);

    /* =====================================
       SHOW PLAYER MESSAGE
    ===================================== */

    await addSmithingXP(12);
    await addPlayerXP(2);
    if (typeof recordCraftingStatistics === "function") {
        await recordCraftingStatistics({
            itemsCrafted: IRON_BARS_CREATED,
            blacksmithItems: IRON_BARS_CREATED,
            barsForged: IRON_BARS_CREATED
        });
    }
    document.getElementById("forge-message").innerHTML =
        "🔥 You forge <strong>5 Bog Iron</strong> into <strong>1 Iron Bar</strong>.";


    /* =====================================
       REFRESH PLAYER INFORMATION
    ===================================== */

    loadHomePage();

}

/* =====================================
   FORGE IRON nails
===================================== */
async function forgeIronNails() {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) return;

    const amount =
        parseInt(document.getElementById("nails-amount").value) || 1;

    const barsNeeded = amount;

    const nailsMade = amount * NAILS_PER_BAR;

    const { data: bars } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", IRON_BAR)
        .maybeSingle();

    if (!bars || bars.quantity < barsNeeded) {

        showTemporaryMessage(
            "nails-message",
            "❌ Not enough Iron Bars."
        );

        return;
    }

    await supabaseClient
        .from("inventory")
        .update({
            quantity: bars.quantity - barsNeeded
        })
        .eq("id", bars.id);

    const { data: nails } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", IRON_NAILS)
        .maybeSingle();

    if (nails) {

        await supabaseClient
            .from("inventory")
            .update({
                quantity: nails.quantity + nailsMade
            })
            .eq("id", nails.id);

    } else {

        await supabaseClient
            .from("inventory")
            .insert({
                player_id: user.id,
                item_id: IRON_NAILS,
                quantity: nailsMade
            });

    }

    await addTutorialProgress(
    "iron_nails",
    nailsMade,
    TUTORIAL_STEPS.FORGE_IRON_NAILS,
    TUTORIAL_STEPS.CRAFT_BUCKET,
    TUTORIAL_TARGETS.iron_nails
);

    showTemporaryMessage(
        "nails-message",
        `🔩 You forge <strong>${nailsMade}</strong> Iron Nails.`
    );

    loadHomePage();
}

/* =====================================
   FORGE IRON AXE HEAD
===================================== */

async function forgeIronAxeHead() {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) {
        window.location.href = "login.html";
        return;
    }

    const { data: ironBarItem, error } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", IRON_BAR)
        .maybeSingle();

    if (error) {
        document.getElementById("axe-head-message").innerText =
            error.message;
        return;
    }

    if (!ironBarItem || ironBarItem.quantity < IRON_BAR_COST_FOR_AXE_HEAD) {
        document.getElementById("axe-head-message").innerHTML =
            "❌ You need at least 2 Iron Bars.";
        return;
    }

    await supabaseClient
        .from("inventory")
        .update({
            quantity: ironBarItem.quantity - IRON_BAR_COST_FOR_AXE_HEAD
        })
        .eq("id", ironBarItem.id);

    const { data: axeHeadItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", IRON_AXE_HEAD)
        .maybeSingle();

    if (axeHeadItem) {
        await supabaseClient
            .from("inventory")
            .update({
                quantity: axeHeadItem.quantity + AXE_HEAD_CREATED
            })
            .eq("id", axeHeadItem.id);
    } else {
        await supabaseClient
            .from("inventory")
            .insert({
                player_id: user.id,
                item_id: IRON_AXE_HEAD,
                quantity: AXE_HEAD_CREATED
            });
    }

    document.getElementById("axe-head-message").innerHTML =
        "🔥 You forge <strong>2 Iron Bars</strong> into <strong>1 Iron Axe Head</strong>.";

    loadHomePage();
}

/* =====================================
   FORGE IRON HOOPS
===================================== */

async function forgeIronHoops() {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) return;

    const { data: ironBarItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", IRON_BAR)
        .maybeSingle();

    if (!ironBarItem || ironBarItem.quantity < IRON_BAR_COST_FOR_HOOPS) {
        document.getElementById("hoop-message").innerHTML =
            "❌ You need 1 Iron Bar.";
        return;
    }

    await supabaseClient
        .from("inventory")
        .update({
            quantity: ironBarItem.quantity - IRON_BAR_COST_FOR_HOOPS
        })
        .eq("id", ironBarItem.id);

    const { data: hoopItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", IRON_HOOP)
        .maybeSingle();

    if (hoopItem) {
        await supabaseClient
            .from("inventory")
            .update({
                quantity: hoopItem.quantity + HOOPS_CREATED
            })
            .eq("id", hoopItem.id);
    } else {
        await supabaseClient
            .from("inventory")
            .insert({
                player_id: user.id,
                item_id: IRON_HOOP,
                quantity: HOOPS_CREATED
            });
    }
await addTutorialProgress(
    "iron_hoops",
    2,
    TUTORIAL_STEPS.FORGE_IRON_HOOPS,
    TUTORIAL_STEPS.FORGE_IRON_NAILS,
    TUTORIAL_TARGETS.iron_hoops
);
    await recordCraftingStatistics({
        itemsCrafted: hoopsMade,
        blacksmithItems: hoopsMade,
        hoopsForged: hoopsMade
    });

    document.getElementById("hoop-message").innerHTML =
        "⭕ You forge <strong>2 Iron Hoops</strong>.";

    loadHomePage();
}
/* =====================================
   BUTTON EVENTS
===================================== */

if (forgeButton) {

    forgeButton.addEventListener(
        "click",
        forgeIronBar
    );

}

if (forgeAxeHeadButton) {
    forgeAxeHeadButton.addEventListener(
        "click",
        forgeIronAxeHead
    );
}

if (forgeHoopButton) {
    forgeHoopButton.addEventListener("click", forgeIronHoops);
}

if (forgeNailsButton) {
    forgeNailsButton.addEventListener("click", forgeIronNails);
}