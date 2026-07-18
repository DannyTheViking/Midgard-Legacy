/* =====================================
   SETTINGS
===================================== */

const ENERGY_COST = 5;

const gatherButton = document.getElementById("gather-bog-iron");


/* =====================================
   GATHER BOG IRON
===================================== */

async function gatherBogIron() {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) {
        window.location.href = "login.html";
        return;
    }

    /* Load Player */

    const {
        data: player,
        error: playerError
    } = await supabaseClient
        .from("players")
        .select("id, energy")
        .eq("id", user.id)
        .single();

    if (playerError) {
        showMiningMessage(playerError.message);
        return;
    }

    /* Check Energy */

    if (player.energy < ENERGY_COST) {

        showMiningMessage(
            "⚡ You do not have enough energy."
        );

        return;
    }

    /* Reward */

    const ore =
        Math.floor(Math.random() * 5) + 1;

    const newEnergy =
        player.energy - ENERGY_COST;

    /* Add Ore to Cart or Inventory */
    let sentToCart = false;
    if (typeof addResourceToCartOrInventory === "function") {
        try { sentToCart = await addResourceToCartOrInventory(user.id, BOG_IRON, ore); }
        catch (cartError) { showMiningMessage("❌ " + cartError.message); return; }
    }
    if (!sentToCart) {
        const { data: inventoryItem, error: inventoryError } = await supabaseClient.from("inventory")
            .select("*").eq("player_id", user.id).eq("item_id", BOG_IRON).maybeSingle();
        if (inventoryError) { showMiningMessage("❌ " + inventoryError.message); return; }
        if (inventoryItem) await supabaseClient.from("inventory").update({quantity:inventoryItem.quantity+ore}).eq("id",inventoryItem.id);
        else await supabaseClient.from("inventory").insert({player_id:user.id,item_id:BOG_IRON,quantity:ore});
    }

    /* Update Energy */

    await supabaseClient
        .from("players")
        .update({
            energy: newEnergy,
            last_action:
                new Date().toISOString()
        })
        .eq("id", user.id);

    /* Tutorial */

    const tutorialResult =
        await addTutorialProgress(
            "bog_iron",
            ore,
            TUTORIAL_STEPS.GATHER_BOG_IRON,
            TUTORIAL_STEPS.FORGE_IRON_BARS,
            TUTORIAL_TARGETS.bog_iron
        );

    /* Message */

    let message = `
        ⛏️ You gather
        <strong>${ore}</strong>
        Bog Iron.<br><br>${sentToCart ? "🛒 The ore was loaded into your cart." : "🎒 The ore was placed in your inventory."}
    `;

    if (
        tutorialResult &&
        tutorialResult.completed
    ) {

        message += `

            <br><br>

            ✅ You have enough Bog Iron.

            <br><br>

            📜 New Objective

            <br>

            Return to the Village Forge and
            smelt Iron Bars.

            <br><br>

            <button
                onclick="window.location.href='village.html'">

                🏘️ Go to Village

            </button>
        `;

        if (gatherButton) {

            gatherButton.disabled = true;

            gatherButton.innerText =
                "✅ Tutorial Complete";

        }

    } else if (tutorialResult) {

        message += `

            <br><br>

            📜 Tutorial Progress

            <br>

            ${tutorialResult.current}
            /
            ${tutorialResult.target}
            Bog Iron

        `;

    }

    if (typeof addVillageReputation === "function") await addVillageReputation(ore);
    await addMiningXP(ore * 5); await addPlayerXP(Math.max(1, ore));

    showMiningMessage(message);

    loadHomePage();

}

/* =====================================
   SHOW MINING MESSAGE
===================================== */

function showMiningMessage(message) {

    document.getElementById("bog-iron-log").innerHTML = message;

    let miningHistory =
        JSON.parse(localStorage.getItem("miningHistory")) || [];

    miningHistory.unshift(message);
    miningHistory = miningHistory.slice(0, 5);

    localStorage.setItem("miningHistory", JSON.stringify(miningHistory));

    document.getElementById("mining-log").innerHTML =
        miningHistory.join("<hr>");
}

/* =====================================
   LOAD EQUIPPED PICKAXE
===================================== */

async function loadMiningTool() {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) return;

    const {
        data: pickaxe,
        error
    } = await supabaseClient
        .from("equipment")
        .select(`
            durability,
            max_durability,
            items (
                name,
                description
            )
        `)
        .eq("player_id", user.id)
        .eq("slot", "pickaxe")
        .eq("is_equipped", true)
        .maybeSingle();

    const toolName =
        document.getElementById("mining-tool-name");

    const toolDescription =
        document.getElementById(
            "mining-tool-description"
        );

    if (error) {
        console.error(
            "Pickaxe failed to load:",
            error
        );
        return;
    }

    if (!pickaxe) {

        if (toolName) {
            toolName.innerText = "⛏️ Hands";
        }

        if (toolDescription) {
            toolDescription.innerText =
                "Bog Iron can be gathered by hand.";
        }

        return;
    }

    if (toolName) {
        toolName.innerText =
            "⛏️ " + pickaxe.items.name;
    }

    if (toolDescription) {
        toolDescription.innerText =
            pickaxe.items.description +
            " Durability: " +
            pickaxe.durability +
            " / " +
            pickaxe.max_durability;
    }
}

/* =====================================
   LOAD SAVED MINING MESSAGE
===================================== */

const savedMiningHistory =
    JSON.parse(localStorage.getItem("miningHistory")) || [];

if (savedMiningHistory.length > 0) {
    document.getElementById("bog-iron-log").innerHTML = savedMiningHistory[0];
    document.getElementById("mining-log").innerHTML =
        savedMiningHistory.join("<hr>");
}


/* =====================================
   BUTTON EVENTS
===================================== */

if (gatherButton) {
    gatherButton.addEventListener("click", gatherBogIron);
}

/* =====================================
   START MINING PAGE
===================================== */

loadMiningTool();