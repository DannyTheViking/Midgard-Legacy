/* =====================================

    MIDGARD LEGACY

    File:
    inventory.js

    Purpose:
    Loads inventory and allows Empty
    Buckets to be filled with water.

===================================== */


/* =====================================
   LOAD INVENTORY
===================================== */

async function loadInventory() {

    const inventoryList =
        document.getElementById("inventory-list");

    if (!inventoryList) {
        console.error(
            'Missing HTML element: id="inventory-list"'
        );
        return;
    }

    const {
        data: { user },
        error: userError
    } = await supabaseClient.auth.getUser();

    if (userError) {
        inventoryList.innerText =
            userError.message;
        return;
    }

    if (!user) {
        window.location.href = "login.html";
        return;
    }

    const {
        data,
        error
    } = await supabaseClient
        .from("inventory")
        .select(`
            id,
            item_id,
            quantity,
            items (
                id,
                name,
                description
            )
        `)
        .eq("player_id", user.id)
        .gt("quantity", 0)
        .order("item_id");

    if (error) {
        inventoryList.innerText =
            "Inventory failed to load: " +
            error.message;
        return;
    }

    inventoryList.innerHTML = "";

    if (!data || data.length === 0) {
        inventoryList.innerHTML =
            "<p>Your inventory is empty.</p>";
        return;
    }

    data.forEach(function (inventoryItem) {

        /*
            Protect the page from an inventory row
            whose matching item was deleted.
        */

        if (!inventoryItem.items) {

            console.warn(
                "Missing item record for inventory row:",
                inventoryItem
            );

            return;
        }

        let actionButton = "";

        /*
            Only show Fill With Water
            on the Empty Bucket.
        */

        if (inventoryItem.item_id === EMPTY_BUCKET) {

            actionButton = `
                <button
                    type="button"
                    onclick="fillBucketWithWater(
                        ${inventoryItem.id},
                        this
                    )"
                >
                    💧 Fill With Water
                </button>
            `;

        }

        inventoryList.innerHTML += `
            <div class="inventory-row">

                <div class="item-left">

                    <div class="item-icon">
                        ${getInventoryIcon(
                            inventoryItem.items.name
                        )}
                    </div>

                    <div>

                        <div class="item-name">
                            ${inventoryItem.items.name}
                        </div>

                        <div class="item-description">
                            ${
                                inventoryItem.items.description ||
                                "No description available."
                            }
                        </div>

                        ${actionButton}

                    </div>

                </div>

                <div class="item-right">

                    <div class="item-quantity">
                        ${inventoryItem.quantity}
                    </div>

                </div>

            </div>
        `;

    });

}


/* =====================================
   INVENTORY ICON
===================================== */

function getInventoryIcon(itemName) {

    const name =
        String(itemName || "").toLowerCase();

    if (name.includes("bucket")) return "🪣";
    if (name.includes("mead")) return "🍺";
    if (name.includes("honey")) return "🍯";
    if (name.includes("axe")) return "🪓";
    if (name.includes("iron")) return "⚒️";
    if (name.includes("barrel")) return "🛢️";
    if (name.includes("plank")) return "🪵";
    if (name.includes("log")) return "🪵";
    if (name.includes("hive")) return "🐝";

    return "📦";
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