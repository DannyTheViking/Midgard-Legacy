/* =====================================

    MIDGARD LEGACY

    File:
    blacksmith.js

    Purpose:
    Repairs equipped tools and assembles
    an Iron Axe.

===================================== */


/* =====================================
   SETTINGS
===================================== */

const AXE_REPAIR_COST = 25;

/*
    Remove these constants if they are
    already declared in constants.js.
*/



/* =====================================
   PAGE ELEMENTS
===================================== */

const repairButton =
    document.getElementById("repair-axe-button");

const craftIronAxeButton =
    document.getElementById("craft-iron-axe-button");


/* =====================================
   SHOW BLACKSMITH MESSAGE
===================================== */

function showBlacksmithMessage(message) {

    const element =
        document.getElementById("blacksmith-message");

    if (!element) return;

    element.innerHTML = message;
}


/* =====================================
   SHOW CRAFT AXE MESSAGE
===================================== */

function showCraftAxeMessage(message) {

    const element =
        document.getElementById("craft-axe-message");

    if (!element) return;

    element.innerHTML = message;
}



async function loadBlacksmithCardStock() {
    const { data: { user } } =
        await supabaseClient.auth.getUser();

    if (!user) return;

    const [
        quantities,
        playerResult,
        equipmentResult
    ] = await Promise.all([
        getPlayerInventoryQuantities(
            user.id,
            [
                WOODEN_SHAFT,
                IRON_AXE_HEAD
            ]
        ),
        supabaseClient
            .from("players")
            .select("silver")
            .eq("id", user.id)
            .single(),
        supabaseClient
            .from("equipment")
            .select("id")
            .eq("player_id", user.id)
            .eq("slot", "axe")
            .eq("is_equipped", true)
            .maybeSingle()
    ]);

    const shafts =
        quantities[WOODEN_SHAFT] || 0;

    const heads =
        quantities[IRON_AXE_HEAD] || 0;

    const canMake =
        Math.min(shafts, heads);

    const silver =
        Number(
            playerResult.data?.silver || 0
        );

    const axeStock =
        document.getElementById(
            "iron-axe-stock"
        );

    if (axeStock) {
        axeStock.innerHTML = `
            <span>Shafts: ${shafts.toLocaleString()}</span>
            <span>Heads: ${heads.toLocaleString()}</span>
            <span>Can make: ${canMake.toLocaleString()}</span>
        `;
    }

    const repairStock =
        document.getElementById(
            "repair-stock"
        );

    if (repairStock) {
        repairStock.innerHTML = `
            <span>Silver: ${silver.toLocaleString()}</span>
            <span>Can repair: ${
                equipmentResult.data
                    ? Math.floor(
                        silver /
                        AXE_REPAIR_COST
                    )
                    : 0
            }</span>
        `;
    }
}


/* =====================================
   LOAD AXE REPAIR INFO
===================================== */

async function loadAxeRepairInfo() {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) return;

    const {
        data: axe,
        error
    } = await supabaseClient
        .from("equipment")
        .select(`
            id,
            durability,
            max_durability,
            items (
                name
            )
        `)
        .eq("player_id", user.id)
        .eq("slot", "axe")
        .eq("is_equipped", true)
        .maybeSingle();

    const axeName =
        document.getElementById("repair-axe-name");

    const durabilityBar =
        document.getElementById(
            "repair-axe-durability-fill"
        );

    if (error) {
        console.error(
            "Equipped axe failed to load:",
            error
        );
        return;
    }

    if (!axe) {

        if (axeName) {
            axeName.innerText =
                "No Axe Equipped";
        }

        if (durabilityBar) {
            durabilityBar.style.width = "0%";
        }

        if (repairButton) {
            repairButton.disabled = true;
            repairButton.innerText =
                "❌ No Axe Equipped";
        }

        return;
    }

    if (axeName) {
        axeName.innerText = axe.items.name;
    }

    const percent =
        axe.max_durability > 0
            ? (
                axe.durability /
                axe.max_durability
            ) * 100
            : 0;

    if (durabilityBar) {

        durabilityBar.style.width =
            percent + "%";

        durabilityBar.classList.remove(
            "durability-green",
            "durability-orange",
            "durability-red"
        );

        if (percent > 50) {

            durabilityBar.classList.add(
                "durability-green"
            );

        } else if (percent > 25) {

            durabilityBar.classList.add(
                "durability-orange"
            );

        } else {

            durabilityBar.classList.add(
                "durability-red"
            );
        }
    }

    if (repairButton) {

        if (axe.durability >= axe.max_durability) {

            repairButton.disabled = true;
            repairButton.innerText =
                "✅ Axe Fully Repaired";

        } else {

            repairButton.disabled = false;
            repairButton.innerText =
                `⚒️ Repair Axe (${AXE_REPAIR_COST} Silver)`;
        }
    }
}


/* =====================================
   REPAIR AXE
===================================== */

async function repairAxe() {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) return;


    /* =====================================
       LOAD EQUIPPED AXE
    ===================================== */

    const {
        data: axe,
        error: axeError
    } = await supabaseClient
        .from("equipment")
        .select(`
            id,
            durability,
            max_durability
        `)
        .eq("player_id", user.id)
        .eq("slot", "axe")
        .eq("is_equipped", true)
        .maybeSingle();

    if (axeError) {
        showBlacksmithMessage(
            "❌ Axe failed to load: " +
            axeError.message
        );
        return;
    }

    if (!axe) {
        showBlacksmithMessage(
            "❌ You do not have an axe equipped."
        );
        return;
    }


    /* =====================================
       CHECK CURRENT CONDITION
    ===================================== */

    if (axe.durability >= axe.max_durability) {

        showBlacksmithMessage(
            "🪓 Your axe is fine. Stop wasting my time."
        );

        return;
    }


    /* =====================================
       LOAD PLAYER SILVER
    ===================================== */

    const {
        data: player,
        error: playerError
    } = await supabaseClient
        .from("players")
        .select("silver")
        .eq("id", user.id)
        .single();

    if (playerError || !player) {
        showBlacksmithMessage(
            "❌ Player failed to load: " +
            (playerError?.message || "Unknown error.")
        );
        return;
    }


    /* =====================================
       CHECK SILVER
    ===================================== */

    if (player.silver < AXE_REPAIR_COST) {

        showBlacksmithMessage(
            `❌ You need ${AXE_REPAIR_COST} Silver to repair your axe.`
        );

        return;
    }


    /* =====================================
       REPAIR AXE
    ===================================== */

    const { error: repairError } =
        await supabaseClient
            .from("equipment")
            .update({
                durability: axe.max_durability
            })
            .eq("id", axe.id);

    if (repairError) {
        showBlacksmithMessage(
            "❌ Axe repair failed: " +
            repairError.message
        );
        return;
    }


    /* =====================================
       REMOVE SILVER
    ===================================== */

    const { error: silverError } =
        await supabaseClient
            .from("players")
            .update({
                silver:
                    player.silver -
                    AXE_REPAIR_COST
            })
            .eq("id", user.id);

    if (silverError) {
        showBlacksmithMessage(
            "❌ Silver failed to update: " +
            silverError.message
        );
        return;
    }


    /* =====================================
       SHOW SUCCESS
    ===================================== */

    if (typeof incrementGameStatistics === "function") {
        await incrementGameStatistics({
            tools_repaired: 1,
            silver_spent: AXE_REPAIR_COST
        });
    }

    if (typeof logGameActivity === "function") {
        await logGameActivity("tool_repaired", {
            tool: axe.items?.name || "axe",
            silver_spent: AXE_REPAIR_COST
        });
    }

    showBlacksmithMessage(
        `⚒️ Your axe has been repaired for
        <strong>${AXE_REPAIR_COST} Silver</strong>.`
    );

    await Promise.all([
        loadAxeRepairInfo(),
        loadBlacksmithCardStock()
    ]);

    if (typeof loadHomePage === "function") {
        loadHomePage();
    }
}


/* =====================================
   CRAFT IRON AXE
===================================== */

async function craftIronAxe() {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) return;


    /* =====================================
       LOAD MATERIALS
    ===================================== */

    const {
        data: shaftItem,
        error: shaftError
    } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", WOODEN_SHAFT)
        .maybeSingle();

    if (shaftError) {
        showCraftAxeMessage(
            "❌ Wooden Shaft failed to load: " +
            shaftError.message
        );
        return;
    }

    const {
        data: axeHeadItem,
        error: axeHeadError
    } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", IRON_AXE_HEAD)
        .maybeSingle();

    if (axeHeadError) {
        showCraftAxeMessage(
            "❌ Iron Axe Head failed to load: " +
            axeHeadError.message
        );
        return;
    }


    /* =====================================
       CHECK MATERIALS
    ===================================== */

    if (!shaftItem || shaftItem.quantity < 1) {
        showCraftAxeMessage(
            "❌ You need 1 Wooden Shaft."
        );
        return;
    }

    if (!axeHeadItem || axeHeadItem.quantity < 1) {
        showCraftAxeMessage(
            "❌ You need 1 Iron Axe Head."
        );
        return;
    }


    /* =====================================
       LOAD EQUIPPED AXE SLOT
    ===================================== */

    const {
        data: equippedAxe,
        error: equipmentError
    } = await supabaseClient
        .from("equipment")
        .select("*")
        .eq("player_id", user.id)
        .eq("slot", "axe")
        .eq("is_equipped", true)
        .maybeSingle();

    if (equipmentError) {
        showCraftAxeMessage(
            "❌ Equipment failed to load: " +
            equipmentError.message
        );
        return;
    }


    /* =====================================
       EQUIP IRON AXE
    ===================================== */

    if (equippedAxe) {

        const { error: equipError } =
            await supabaseClient
                .from("equipment")
                .update({
                    item_id: IRON_AXE,
                    durability: 100,
                    max_durability: 100
                })
                .eq("id", equippedAxe.id);

        if (equipError) {
            showCraftAxeMessage(
                "❌ Iron Axe failed to equip: " +
                equipError.message
            );
            return;
        }

    } else {

        const { error: equipInsertError } =
            await supabaseClient
                .from("equipment")
                .insert({
                    player_id: user.id,
                    item_id: IRON_AXE,
                    slot: "axe",
                    durability: 100,
                    max_durability: 100,
                    is_equipped: true
                });

        if (equipInsertError) {
            showCraftAxeMessage(
                "❌ Iron Axe failed to equip: " +
                equipInsertError.message
            );
            return;
        }
    }


    /* =====================================
       REMOVE WOODEN SHAFT
    ===================================== */

    const newShaftQuantity =
        shaftItem.quantity - 1;

    if (newShaftQuantity > 0) {

        const { error: shaftUpdateError } =
            await supabaseClient
                .from("inventory")
                .update({
                    quantity: newShaftQuantity
                })
                .eq("id", shaftItem.id);

        if (shaftUpdateError) {
            showCraftAxeMessage(
                "❌ Wooden Shaft failed to update: " +
                shaftUpdateError.message
            );
            return;
        }

    } else {

        const { error: shaftDeleteError } =
            await supabaseClient
                .from("inventory")
                .delete()
                .eq("id", shaftItem.id);

        if (shaftDeleteError) {
            showCraftAxeMessage(
                "❌ Wooden Shaft failed to update: " +
                shaftDeleteError.message
            );
            return;
        }
    }


    /* =====================================
       REMOVE IRON AXE HEAD
    ===================================== */

    const newAxeHeadQuantity =
        axeHeadItem.quantity - 1;

    if (newAxeHeadQuantity > 0) {

        const { error: headUpdateError } =
            await supabaseClient
                .from("inventory")
                .update({
                    quantity: newAxeHeadQuantity
                })
                .eq("id", axeHeadItem.id);

        if (headUpdateError) {
            showCraftAxeMessage(
                "❌ Iron Axe Head failed to update: " +
                headUpdateError.message
            );
            return;
        }

    } else {

        const { error: headDeleteError } =
            await supabaseClient
                .from("inventory")
                .delete()
                .eq("id", axeHeadItem.id);

        if (headDeleteError) {
            showCraftAxeMessage(
                "❌ Iron Axe Head failed to update: " +
                headDeleteError.message
            );
            return;
        }
    }


    /* =====================================
       SHOW SUCCESS
    ===================================== */

    if (typeof incrementGameStatistics === "function") {
        await incrementGameStatistics({
            items_crafted: 1,
            blacksmith_items_crafted: 1
        });
    }

    if (typeof logGameActivity === "function") {
        await logGameActivity(
            "iron_axe_crafted",
            {
                equipped: true
            }
        );
    }

    showCraftAxeMessage(
        "⚒️ You craft and equip your first " +
        "<strong>Iron Axe</strong>!"
    );

    await Promise.all([
        loadAxeRepairInfo(),
        loadBlacksmithCardStock()
    ]);

    if (typeof loadHomePage === "function") {
        loadHomePage();
    }
}


/* =====================================
   BUTTON EVENTS
===================================== */

if (repairButton) {

    repairButton.addEventListener(
        "click",
        repairAxe
    );
}

if (craftIronAxeButton) {

    craftIronAxeButton.addEventListener(
        "click",
        craftIronAxe
    );
}


/* =====================================
   START BLACKSMITH PAGE
===================================== */

Promise.all([
    loadAxeRepairInfo(),
    loadBlacksmithCardStock()
]);