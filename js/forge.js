/* =====================================
   MIDGARD LEGACY - FORGE
   Bulk crafting and live stock cards.
===================================== */

const BOG_IRON_COST = 5;
const IRON_BARS_CREATED = 1;
const NAILS_PER_BAR = 25;
const IRON_BAR_COST_FOR_AXE_HEAD = 2;
const AXE_HEAD_CREATED = 1;
const IRON_BAR_COST_FOR_HOOPS = 1;
const HOOPS_CREATED = 2;

const forgeButton =
    document.getElementById("forge-iron-bar-button");
const forgeNailsButton =
    document.getElementById("forge-nails-button");
const forgeAxeHeadButton =
    document.getElementById("forge-axe-head-button");
const forgeHoopButton =
    document.getElementById("forge-hoop-button");

function showTemporaryMessage(id, message) {
    const element = document.getElementById(id);
    if (!element) return;

    element.innerHTML = message;

    setTimeout(() => {
        element.innerHTML = "";
    }, 4000);
}

async function loadForgeCardStock() {
    const { data: { user } } =
        await supabaseClient.auth.getUser();

    if (!user) return;

    const quantities =
        await getPlayerInventoryQuantities(
            user.id,
            [
                BOG_IRON,
                IRON_BAR,
                IRON_NAILS,
                IRON_AXE_HEAD,
                IRON_HOOP
            ]
        );

    const bogIron = quantities[BOG_IRON] || 0;
    const bars = quantities[IRON_BAR] || 0;
    const nails = quantities[IRON_NAILS] || 0;
    const axeHeads = quantities[IRON_AXE_HEAD] || 0;
    const hoops = quantities[IRON_HOOP] || 0;

    setCraftingStock(
        "iron-bar-stock",
        "Bog Iron",
        bogIron,
        Math.floor(bogIron / BOG_IRON_COST)
    );

    setCraftingStock(
        "iron-nails-stock",
        "Iron Bars",
        bars,
        bars
    );

    setCraftingStock(
        "axe-head-stock",
        "Iron Bars",
        bars,
        Math.floor(
            bars / IRON_BAR_COST_FOR_AXE_HEAD
        )
    );

    setCraftingStock(
        "iron-hoop-stock",
        "Iron Bars",
        bars,
        Math.floor(
            bars / IRON_BAR_COST_FOR_HOOPS
        )
    );
}

async function forgeIronBar() {
    const { data: { user } } =
        await supabaseClient.auth.getUser();

    if (!user) return;

    const amount =
        getPositiveCraftAmount("iron-bar-amount");

    const bogIronNeeded =
        amount * BOG_IRON_COST;

    try {
        const quantities =
            await getPlayerInventoryQuantities(
                user.id,
                [BOG_IRON]
            );

        if (
            Number(quantities[BOG_IRON] || 0) <
            bogIronNeeded
        ) {
            showTemporaryMessage(
                "forge-message",
                `❌ You need ${bogIronNeeded} Bog Iron.`
            );
            return;
        }

        await changeInventoryQuantity(
            user.id,
            BOG_IRON,
            -bogIronNeeded
        );

        await changeInventoryQuantity(
            user.id,
            IRON_BAR,
            amount * IRON_BARS_CREATED
        );

        await addTutorialProgress(
            "iron_bars",
            amount,
            TUTORIAL_STEPS.FORGE_IRON_BARS,
            TUTORIAL_STEPS.FORGE_IRON_HOOPS,
            TUTORIAL_TARGETS.iron_bars
        );

        await addSmithingXP(12 * amount);
        await addPlayerXP(2 * amount);

        if (
            typeof recordCraftingStatistics ===
            "function"
        ) {
            await recordCraftingStatistics({
                itemsCrafted: amount,
                blacksmithItems: amount,
                barsForged: amount
            });
        }

        if (typeof logGameActivity === "function") {
            await logGameActivity(
                "iron_bars_forged",
                {
                    batches: amount,
                    bog_iron_used: bogIronNeeded,
                    iron_bars_made: amount
                }
            );
        }

        showTemporaryMessage(
            "forge-message",
            `🔥 You forge <strong>${bogIronNeeded} Bog Iron</strong> into <strong>${amount} Iron Bar${amount === 1 ? "" : "s"}</strong>.`
        );

        await loadForgeCardStock();
        loadHomePage();
    } catch (error) {
        showTemporaryMessage(
            "forge-message",
            "❌ Forging failed: " + error.message
        );
    }
}

async function forgeIronNails() {
    const { data: { user } } =
        await supabaseClient.auth.getUser();

    if (!user) return;

    const amount =
        getPositiveCraftAmount("nails-amount");

    const barsNeeded = amount;
    const nailsMade =
        amount * NAILS_PER_BAR;

    try {
        const quantities =
            await getPlayerInventoryQuantities(
                user.id,
                [IRON_BAR]
            );

        if (
            Number(quantities[IRON_BAR] || 0) <
            barsNeeded
        ) {
            showTemporaryMessage(
                "nails-message",
                `❌ You need ${barsNeeded} Iron Bar${barsNeeded === 1 ? "" : "s"}.`
            );
            return;
        }

        await changeInventoryQuantity(
            user.id,
            IRON_BAR,
            -barsNeeded
        );

        await changeInventoryQuantity(
            user.id,
            IRON_NAILS,
            nailsMade
        );

        await addTutorialProgress(
            "iron_nails",
            nailsMade,
            TUTORIAL_STEPS.FORGE_IRON_NAILS,
            TUTORIAL_STEPS.CRAFT_BUCKET,
            TUTORIAL_TARGETS.iron_nails
        );

        await addSmithingXP(4 * amount);

        if (
            typeof recordCraftingStatistics ===
            "function"
        ) {
            await recordCraftingStatistics({
                itemsCrafted: nailsMade,
                blacksmithItems: nailsMade,
                nailsForged: nailsMade
            });
        }

        showTemporaryMessage(
            "nails-message",
            `🔩 You forge <strong>${nailsMade}</strong> Iron Nails.`
        );

        await loadForgeCardStock();
        loadHomePage();
    } catch (error) {
        showTemporaryMessage(
            "nails-message",
            "❌ Forging failed: " + error.message
        );
    }
}

async function forgeIronAxeHead() {
    const { data: { user } } =
        await supabaseClient.auth.getUser();

    if (!user) return;

    const amount =
        getPositiveCraftAmount("axe-head-amount");

    const barsNeeded =
        amount * IRON_BAR_COST_FOR_AXE_HEAD;

    try {
        const quantities =
            await getPlayerInventoryQuantities(
                user.id,
                [IRON_BAR]
            );

        if (
            Number(quantities[IRON_BAR] || 0) <
            barsNeeded
        ) {
            showTemporaryMessage(
                "axe-head-message",
                `❌ You need ${barsNeeded} Iron Bars.`
            );
            return;
        }

        await changeInventoryQuantity(
            user.id,
            IRON_BAR,
            -barsNeeded
        );

        await changeInventoryQuantity(
            user.id,
            IRON_AXE_HEAD,
            amount * AXE_HEAD_CREATED
        );

        await addSmithingXP(10 * amount);

        if (
            typeof recordCraftingStatistics ===
            "function"
        ) {
            await recordCraftingStatistics({
                itemsCrafted: amount,
                blacksmithItems: amount
            });
        }

        showTemporaryMessage(
            "axe-head-message",
            `🔥 You forge <strong>${barsNeeded} Iron Bars</strong> into <strong>${amount} Iron Axe Head${amount === 1 ? "" : "s"}</strong>.`
        );

        await loadForgeCardStock();
        loadHomePage();
    } catch (error) {
        showTemporaryMessage(
            "axe-head-message",
            "❌ Forging failed: " + error.message
        );
    }
}

async function forgeIronHoops() {
    const { data: { user } } =
        await supabaseClient.auth.getUser();

    if (!user) return;

    const amount =
        getPositiveCraftAmount("hoop-amount");

    const barsNeeded =
        amount * IRON_BAR_COST_FOR_HOOPS;

    const hoopsMade =
        amount * HOOPS_CREATED;

    try {
        const quantities =
            await getPlayerInventoryQuantities(
                user.id,
                [IRON_BAR]
            );

        if (
            Number(quantities[IRON_BAR] || 0) <
            barsNeeded
        ) {
            showTemporaryMessage(
                "hoop-message",
                `❌ You need ${barsNeeded} Iron Bar${barsNeeded === 1 ? "" : "s"}.`
            );
            return;
        }

        await changeInventoryQuantity(
            user.id,
            IRON_BAR,
            -barsNeeded
        );

        await changeInventoryQuantity(
            user.id,
            IRON_HOOP,
            hoopsMade
        );

        await addTutorialProgress(
            "iron_hoops",
            hoopsMade,
            TUTORIAL_STEPS.FORGE_IRON_HOOPS,
            TUTORIAL_STEPS.FORGE_IRON_NAILS,
            TUTORIAL_TARGETS.iron_hoops
        );

        await addSmithingXP(6 * amount);

        if (
            typeof recordCraftingStatistics ===
            "function"
        ) {
            await recordCraftingStatistics({
                itemsCrafted: hoopsMade,
                blacksmithItems: hoopsMade,
                hoopsForged: hoopsMade
            });
        }

        showTemporaryMessage(
            "hoop-message",
            `⭕ You forge <strong>${hoopsMade}</strong> Iron Hoops.`
        );

        await loadForgeCardStock();
        loadHomePage();
    } catch (error) {
        showTemporaryMessage(
            "hoop-message",
            "❌ Forging failed: " + error.message
        );
    }
}

forgeButton?.addEventListener(
    "click",
    forgeIronBar
);
forgeNailsButton?.addEventListener(
    "click",
    forgeIronNails
);
forgeAxeHeadButton?.addEventListener(
    "click",
    forgeIronAxeHead
);
forgeHoopButton?.addEventListener(
    "click",
    forgeIronHoops
);

document
    .querySelectorAll(".craft-amount")
    .forEach(input => {
        input.addEventListener(
            "input",
            loadForgeCardStock
        );
    });

loadForgeCardStock();
