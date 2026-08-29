/* =====================================
   MIDGARD LEGACY - BACKPACK
===================================== */

const DEFAULT_BACKPACK_CAPACITY_KG = 25;

function formatWeight(value) {
    const number = Number(value || 0);
    return `${number.toFixed(number < 10 ? 2 : 1)}kg`;
}

function getInventoryIcon(itemName) {
    const name = String(itemName || "").toLowerCase();
    if (name.includes("bucket")) return "🪣";
    if (name.includes("mead")) return "🍺";
    if (name.includes("honey")) return "🍯";
    if (name.includes("axe")) return "🪓";
    if (name.includes("pickaxe")) return "⛏️";
    if (name.includes("iron") || name.includes("nail")) return "⚒️";
    if (name.includes("barrel")) return "🛢️";
    if (name.includes("plank") || name.includes("beam") || name.includes("log")) return "🪵";
    if (name.includes("rock") || name.includes("stone") || name.includes("ore")) return "🪨";
    if (name.includes("stick")) return "🌿";
    if (name.includes("hive") || name.includes("queen bee")) return "🐝";
    return "📦";
}

async function loadInventory() {
    const inventoryList = document.getElementById("inventory-list");
    const capacityBox = document.getElementById("backpack-capacity");
    if (!inventoryList) return;

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
        window.location.href = "login.html";
        return;
    }

    const [{ data, error }, { data: player }] = await Promise.all([
        supabaseClient.from("inventory").select(`
            id,item_id,quantity,
            items(id,name,description,weight_kg)
        `).eq("player_id", user.id).gt("quantity", 0).order("item_id"),
        supabaseClient.from("players").select("backpack_capacity_kg").eq("id", user.id).single()
    ]);

    if (error) {
        inventoryList.innerText = "Backpack failed to load: " + error.message;
        return;
    }

    const capacity = Number(player?.backpack_capacity_kg || DEFAULT_BACKPACK_CAPACITY_KG);
    const used = (data || []).reduce((total, row) => total + Number(row.quantity || 0) * Number(row.items?.weight_kg || 0), 0);
    if (capacityBox) {
        const percent = Math.min(100, capacity ? used / capacity * 100 : 0);
        capacityBox.innerHTML = `<div class="backpack-capacity-row"><strong>Backpack Weight</strong><span>${formatWeight(used)} / ${formatWeight(capacity)}</span></div><div class="weight-bar"><span style="width:${percent}%"></span></div>`;
    }

    if (!data?.length) {
        inventoryList.innerHTML = "<p>Your backpack is empty. Your permanent resources are kept in the Storage Yard.</p>";
        return;
    }

    inventoryList.innerHTML = data.map(inventoryItem => {
        if (!inventoryItem.items) return "";
        const unitWeight = Number(inventoryItem.items.weight_kg || 0);
        const totalWeight = unitWeight * Number(inventoryItem.quantity || 0);
        const actionButton = inventoryItem.item_id === EMPTY_BUCKET ? `<button type="button" onclick="fillBucketWithWater(${inventoryItem.id},this)">💧 Fill With Water</button>` : "";
        return `<div class="inventory-row"><div class="item-left"><div class="item-icon">${getInventoryIcon(inventoryItem.items.name)}</div><div><div class="item-name">${inventoryItem.items.name}</div><div class="item-description">${inventoryItem.items.description || "No description available."}</div><small>${formatWeight(unitWeight)} each · ${formatWeight(totalWeight)} total</small>${actionButton}</div></div><div class="item-right"><div class="item-quantity">${inventoryItem.quantity}</div></div></div>`;
    }).join("");
}

/* =====================================
   FILL EMPTY BUCKET WITH WATER
===================================== */

async function fillBucketWithWater(
    inventoryId,
    button
) {

    if (button) {
        button.disabled = true;
        button.innerText = "💧 Filling...";
    }

    const {
        data: { user },
        error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {

        showInventoryMessage(
            "❌ Player failed to load."
        );

        await loadInventory();
        return;
    }

    /*
        Load the exact inventory row that
        was clicked.
    */

    const {
        data: emptyBucket,
        error: emptyError
    } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("id", inventoryId)
        .eq("player_id", user.id)
        .eq("item_id", EMPTY_BUCKET)
        .maybeSingle();

    if (emptyError || !emptyBucket) {

        showInventoryMessage(
            "❌ Empty Bucket could not be found."
        );

        await loadInventory();
        return;
    }

    if (emptyBucket.quantity < 1) {

        showInventoryMessage(
            "❌ You do not have an Empty Bucket."
        );

        await loadInventory();
        return;
    }

    /*
        Load an existing Water Bucket row.
    */

    const {
        data: waterBucket,
        error: waterLoadError
    } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", WATER_BUCKET)
        .maybeSingle();

    if (waterLoadError) {

        showInventoryMessage(
            "❌ Water Bucket failed to load: " +
            waterLoadError.message
        );

        await loadInventory();
        return;
    }


    /* =====================================
       REMOVE ONE EMPTY BUCKET
    ===================================== */

    const newEmptyQuantity =
        emptyBucket.quantity - 1;

    if (newEmptyQuantity > 0) {

        const { error: updateEmptyError } =
            await supabaseClient
                .from("inventory")
                .update({
                    quantity: newEmptyQuantity
                })
                .eq("id", emptyBucket.id)
                .eq("player_id", user.id);

        if (updateEmptyError) {

            showInventoryMessage(
                "❌ Empty Bucket failed to update: " +
                updateEmptyError.message
            );

            await loadInventory();
            return;
        }

    } else {

        const { error: deleteEmptyError } =
            await supabaseClient
                .from("inventory")
                .delete()
                .eq("id", emptyBucket.id)
                .eq("player_id", user.id);

        if (deleteEmptyError) {

            showInventoryMessage(
                "❌ Empty Bucket failed to remove: " +
                deleteEmptyError.message
            );

            await loadInventory();
            return;
        }

    }


    /* =====================================
       ADD ONE WATER BUCKET
    ===================================== */

    if (waterBucket) {

        const { error: updateWaterError } =
            await supabaseClient
                .from("inventory")
                .update({
                    quantity:
                        waterBucket.quantity + 1
                })
                .eq("id", waterBucket.id)
                .eq("player_id", user.id);

        if (updateWaterError) {

            await returnEmptyBucket(user.id);

            showInventoryMessage(
                "❌ Water Bucket failed to update: " +
                updateWaterError.message
            );

            await loadInventory();
            return;
        }

    } else {

        const { error: insertWaterError } =
            await supabaseClient
                .from("inventory")
                .insert({
                    player_id: user.id,
                    item_id: WATER_BUCKET,
                    quantity: 1
                });

        if (insertWaterError) {

            await returnEmptyBucket(user.id);

            showInventoryMessage(
                "❌ Water Bucket failed to enter inventory: " +
                insertWaterError.message
            );

            await loadInventory();
            return;
        }

    }


    /* =====================================
       UPDATE TUTORIAL
    ===================================== */

    if (
        typeof advanceTutorial === "function" &&
        typeof TUTORIAL_STEPS !== "undefined"
    ) {

        await advanceTutorial(
            TUTORIAL_STEPS.FILL_WATER_BUCKET,
            TUTORIAL_STEPS.BREW_YOUNG_MEAD
        );

        if (typeof window.refreshTutorialAfterAction === "function") {
            await window.refreshTutorialAfterAction();
        }

    }


    /* =====================================
       SUCCESS
    ===================================== */

    showInventoryMessage(
        "💧 You fill 1 Empty Bucket with fresh water."
    );

    if (typeof loadHomePage === "function") {
        await loadHomePage();
    }

    await loadInventory();

}


/* =====================================
   RETURN EMPTY BUCKET AFTER AN ERROR
===================================== */

async function returnEmptyBucket(playerId) {

    const {
        data: existingBucket
    } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", playerId)
        .eq("item_id", EMPTY_BUCKET)
        .maybeSingle();

    if (existingBucket) {

        await supabaseClient
            .from("inventory")
            .update({
                quantity:
                    existingBucket.quantity + 1
            })
            .eq("id", existingBucket.id);

    } else {

        await supabaseClient
            .from("inventory")
            .insert({
                player_id: playerId,
                item_id: EMPTY_BUCKET,
                quantity: 1
            });

    }

}


/* =====================================
   INVENTORY MESSAGE
===================================== */

function showInventoryMessage(message) {

    const element =
        document.getElementById("inventory-message");

    if (!element) {
        console.log(message);
        return;
    }

    element.innerHTML = message;

    setTimeout(function () {
        element.innerHTML = "";
    }, 4000);

}


/* =====================================
   START INVENTORY PAGE
===================================== */

loadInventory();