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
    const { data, error } = await supabaseClient.rpc(
        "get_my_village_carpenter_stock"
    );

    if (error) {
        console.error("Unable to load Carpenter stock:", error);
        return;
    }

    const birchPlanks = Number(data?.birch_planks || 0);
    const barrelPlanks = Number(data?.barrel_planks || 0);
    const ironHoops = Number(data?.iron_hoops || 0);
    const staves = Number(data?.barrel_staves || 0);
    const lids = Number(data?.barrel_lids || 0);
    const woodName = data?.wood_name || "Birch Plank";

    setCraftingStock(
        "shaft-stock",
        [{ name: "Birch Planks", quantity: birchPlanks }],
        "Wooden Shafts",
        birchPlanks
    );

    setCraftingStock(
        "bucket-stock",
        [
            { name: woodName + "s", quantity: barrelPlanks },
            { name: "Iron Hoops", quantity: ironHoops }
        ],
        "Empty Buckets",
        Math.min(
            Math.floor(barrelPlanks / BUCKET_PLANK_COST),
            Math.floor(ironHoops / BUCKET_HOOP_COST)
        )
    );

    setCraftingStock(
        "staves-stock",
        [{ name: woodName + "s", quantity: barrelPlanks }],
        "Barrel Staves",
        Math.floor(barrelPlanks / STAVES_PLANK_COST) * STAVES_CREATED
    );

    setCraftingStock(
        "lid-stock",
        [{ name: woodName + "s", quantity: barrelPlanks }],
        "Barrel Lids",
        Math.floor(barrelPlanks / LID_PLANK_COST)
    );

    setCraftingStock(
        "barrel-stock",
        [
            { name: "Barrel Staves", quantity: staves },
            { name: "Barrel Lids", quantity: lids },
            { name: "Iron Hoops", quantity: ironHoops }
        ],
        "Empty Barrels",
        Math.min(
            Math.floor(staves / BARREL_STAVES_COST),
            lids,
            Math.floor(ironHoops / BARREL_HOOP_COST)
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



async function craftAtVillageCarpenter(recipe, amount, messageId, successLabel) {
    const { data, error } = await supabaseClient.rpc(
        "village_carpenter_craft",
        {
            p_recipe: recipe,
            p_amount: amount
        }
    );

    if (error) {
        showTemporaryMessage(
            messageId,
            "❌ " + (error.message || "The carpenter could not complete that order.")
        );
        await loadCarpenterCardStock();
        return null;
    }

    showTemporaryMessage(
        messageId,
        "✅ " + successLabel(data)
    );

    await loadCarpenterCardStock();

    if (typeof window.refreshTutorialAfterAction === "function") {
        await window.refreshTutorialAfterAction();
    }

    if (typeof loadHomePage === "function") {
        await loadHomePage();
    }

    return data;
}

/* =====================================
   CRAFT WOODEN SHAFT
===================================== */

async function craftWoodenShaft() {
    const amount = getCraftAmount("shaft-amount");
    await craftAtVillageCarpenter(
        "shaft",
        amount,
        "carpenter-message",
        data => `You craft <strong>${data.output_quantity} Wooden Shaft${data.output_quantity > 1 ? "s" : ""}</strong>.`
    );
}

/* =====================================
   CRAFT EPTY BUCKET
===================================== */

async function craftEmptyBucket() {
    const amount = getCraftAmount("bucket-amount");
    await craftAtVillageCarpenter(
        "bucket",
        amount,
        "bucket-message",
        data => `You craft <strong>${data.output_quantity} Empty Bucket${data.output_quantity > 1 ? "s" : ""}</strong>.`
    );
}



async function getBarrelPlankForPlayer(userId){const {data:p}=await supabaseClient.from('players').select('tutorial_complete').eq('id',userId).single();if(!p?.tutorial_complete)return {id:BIRCH_PLANK,name:'Birch Planks'};const oak=await getItemByName(ITEM_NAMES.OAK_PLANK);return {id:oak?.id,name:'Oak Planks'};}

/* =====================================
   CRAFT BARREL STAVES
===================================== */

async function craftBarrelStaves() {
    const amount = getCraftAmount("staves-amount");
    await craftAtVillageCarpenter(
        "staves",
        amount,
        "staves-message",
        data => `You craft <strong>${data.output_quantity} Barrel Staves</strong>.`
    );
}


/* =====================================
   CRAFT BARREL LID
===================================== */

async function craftBarrelLid() {
    const amount = getCraftAmount("lid-amount");
    await craftAtVillageCarpenter(
        "lid",
        amount,
        "lid-message",
        data => `You craft <strong>${data.output_quantity} Barrel Lid${data.output_quantity > 1 ? "s" : ""}</strong>.`
    );
}


/* =====================================
   CRAFT EMPTY BARREL
===================================== */

async function craftEmptyBarrel() {
    const amount = getCraftAmount("barrel-amount");
    await craftAtVillageCarpenter(
        "barrel",
        amount,
        "barrel-message",
        data => `You craft <strong>${data.output_quantity} Empty Barrel${data.output_quantity > 1 ? "s" : ""}</strong>.`
    );
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


/* =====================================
   PROPERTY BEAMS
===================================== */


/* =====================================
   FIND ITEM BY NAME
===================================== */

async function getNamedItem(name) {

    const { data, error } = await supabaseClient
        .from("items")
        .select("id, name, weight_kg")
        .eq("name", name)
        .single();

    if (error) {
        throw error;
    }

    return data;
}


/* =====================================
   GET ACTIVE CART
===================================== */

async function getActivePlayerCart(playerId) {

    const { data, error } = await supabaseClient
        .from("player_carts")
        .select("id, name")
        .eq("player_id", playerId)
        .eq("is_active", true)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data;
}


/* =====================================
   GET ITEM FROM ALL LOCATIONS
===================================== */

async function getItemAcrossPlayerStorage(
    playerId,
    itemId
) {

    const activeCart =
        await getActivePlayerCart(playerId);

    const [
        backpackResult,
        storageResult,
        cartResult
    ] = await Promise.all([

        supabaseClient
            .from("inventory")
            .select("id, quantity")
            .eq("player_id", playerId)
            .eq("item_id", itemId)
            .maybeSingle(),

        supabaseClient
            .from("player_storage")
            .select("id, quantity")
            .eq("player_id", playerId)
            .eq("item_id", itemId)
            .maybeSingle(),

        activeCart
            ? supabaseClient
                .from("cart_items")
                .select("id, quantity")
                .eq("cart_id", activeCart.id)
                .eq("item_id", itemId)
                .maybeSingle()
            : Promise.resolve({
                data: null,
                error: null
            })

    ]);

    if (backpackResult.error) {
        throw backpackResult.error;
    }

    if (storageResult.error) {
        throw storageResult.error;
    }

    if (cartResult.error) {
        throw cartResult.error;
    }

    const backpackQuantity =
        Number(backpackResult.data?.quantity || 0);

    const storageQuantity =
        Number(storageResult.data?.quantity || 0);

    const cartQuantity =
        Number(cartResult.data?.quantity || 0);

    return {
        activeCart,

        backpackRow:
            backpackResult.data,

        storageRow:
            storageResult.data,

        cartRow:
            cartResult.data,

        backpackQuantity,
        storageQuantity,
        cartQuantity,

        totalQuantity:
            backpackQuantity +
            storageQuantity +
            cartQuantity
    };
}


/* =====================================
   REMOVE QUANTITY FROM A ROW
===================================== */

async function removeQuantityFromRow(
    tableName,
    row,
    amount
) {

    if (!row || amount <= 0) {
        return;
    }

    const currentQuantity =
        Number(row.quantity || 0);

    const quantityToRemove =
        Math.min(
            currentQuantity,
            Number(amount)
        );

    const remainingQuantity =
        currentQuantity - quantityToRemove;

    if (remainingQuantity > 0) {

        const { error } = await supabaseClient
            .from(tableName)
            .update({
                quantity: remainingQuantity
            })
            .eq("id", row.id);

        if (error) {
            throw error;
        }

    } else {

        const { error } = await supabaseClient
            .from(tableName)
            .delete()
            .eq("id", row.id);

        if (error) {
            throw error;
        }

    }
}


/* =====================================
   SPEND MATERIAL FROM CART,
   BACKPACK AND STORAGE
===================================== */

async function spendItemAcrossPlayerStorage(
    playerId,
    itemId,
    amount
) {

    const sources =
        await getItemAcrossPlayerStorage(
            playerId,
            itemId
        );

    const required =
        Number(amount || 0);

    if (sources.totalQuantity < required) {

        return {
            success: false,
            available: sources.totalQuantity
        };

    }

    let remaining = required;

    /*
        Use resources in this order:

        1. Active cart
        2. Backpack
        3. Storage Yard
    */

    if (
        remaining > 0 &&
        sources.cartRow
    ) {

        const used = Math.min(
            remaining,
            sources.cartQuantity
        );

        await removeQuantityFromRow(
            "cart_items",
            sources.cartRow,
            used
        );

        remaining -= used;
    }

    if (
        remaining > 0 &&
        sources.backpackRow
    ) {

        const used = Math.min(
            remaining,
            sources.backpackQuantity
        );

        await removeQuantityFromRow(
            "inventory",
            sources.backpackRow,
            used
        );

        remaining -= used;
    }

    if (
        remaining > 0 &&
        sources.storageRow
    ) {

        const used = Math.min(
            remaining,
            sources.storageQuantity
        );

        await removeQuantityFromRow(
            "player_storage",
            sources.storageRow,
            used
        );

        remaining -= used;
    }

    return {
        success: remaining === 0,
        available: sources.totalQuantity
    };
}


/* =====================================
   ADD FINISHED ITEM TO BACKPACK
===================================== */

async function addCraftedItemToBackpack(
    playerId,
    itemId,
    amount
) {

    const { data: existingItem, error } =
        await supabaseClient
            .from("inventory")
            .select("id, quantity")
            .eq("player_id", playerId)
            .eq("item_id", itemId)
            .maybeSingle();

    if (error) {
        throw error;
    }

    if (existingItem) {

        const { error: updateError } =
            await supabaseClient
                .from("inventory")
                .update({
                    quantity:
                        Number(existingItem.quantity) +
                        Number(amount)
                })
                .eq("id", existingItem.id);

        if (updateError) {
            throw updateError;
        }

        return;
    }

    const { error: insertError } =
        await supabaseClient
            .from("inventory")
            .insert({
                player_id: playerId,
                item_id: itemId,
                quantity: amount
            });

    if (insertError) {
        throw insertError;
    }
}


/* =====================================
   CRAFT PROPERTY BEAM
===================================== */

async function craftNamedBeam(
    woodName,
    beamName,
    amountInputId,
    messageId
) {

    try {

        const amount =
            getCraftAmount(amountInputId);

        const {
            data: { user }
        } = await supabaseClient.auth.getUser();

        if (!user) {
            return;
        }

        const [wood, beam] =
            await Promise.all([
                getNamedItem(woodName),
                getNamedItem(beamName)
            ]);

        /*
            One log makes one beam.
        */

        const logsRequired = amount;

        const materialResult =
            await spendItemAcrossPlayerStorage(
                user.id,
                wood.id,
                logsRequired
            );

        if (!materialResult.success) {

            showTemporaryMessage(
                messageId,
                `❌ You need ${logsRequired} ${woodName}${
                    logsRequired === 1 ? "" : "s"
                }. You currently have ${
                    materialResult.available
                } across your cart, backpack and Storage Yard.`
            );

            return;
        }

        await addCraftedItemToBackpack(
            user.id,
            beam.id,
            amount
        );

        if (
            typeof addCarpentryXP === "function"
        ) {

            await addCarpentryXP(
                amount *
                (
                    beamName.startsWith("Oak")
                        ? 20
                        : 10
                )
            );
        }

        if (
            typeof addPlayerXP === "function"
        ) {

            await addPlayerXP(
                Math.max(1, amount)
            );
        }

        if (
            typeof recordCraftingStatistics ===
            "function"
        ) {

            await recordCraftingStatistics({
                itemsCrafted: amount,
                carpentryItems: amount
            });
        }

        showTemporaryMessage(
            messageId,
            `🪚 You craft <strong>${amount} ${beamName}${
                amount === 1 ? "" : "s"
            }</strong>.`
        );

        await loadBeamStock();

        if (
            typeof loadHomePage === "function"
        ) {
            await loadHomePage();
        }

        if (
            typeof loadCartCard === "function"
        ) {
            await loadCartCard();
        }

    } catch (error) {

        console.error(
            "Beam crafting failed:",
            error
        );

        showTemporaryMessage(
            messageId,
            `❌ ${error.message}`
        );
    }
}


/* =====================================
   LOAD BEAM STOCK
===================================== */

async function loadBeamStock() {

    try {

        const {
            data: { user }
        } = await supabaseClient.auth.getUser();

        if (!user) {
            return;
        }

        const [
            birchLog,
            birchBeam,
            oakLog,
            oakBeam
        ] = await Promise.all([
            getNamedItem("Birch Log"),
            getNamedItem("Birch Beam"),
            getNamedItem("Oak Log"),
            getNamedItem("Oak Beam")
        ]);

        const [
            birchLogs,
            birchBeams,
            oakLogs,
            oakBeams
        ] = await Promise.all([

            getItemAcrossPlayerStorage(
                user.id,
                birchLog.id
            ),

            getItemAcrossPlayerStorage(
                user.id,
                birchBeam.id
            ),

            getItemAcrossPlayerStorage(
                user.id,
                oakLog.id
            ),

            getItemAcrossPlayerStorage(
                user.id,
                oakBeam.id
            )

        ]);

        const birchElement =
            document.getElementById(
                "birch-beam-stock"
            );

        const oakElement =
            document.getElementById(
                "oak-beam-stock"
            );

        if (birchElement) {

            birchElement.innerHTML = `
                <strong>
                    ${birchLogs.totalQuantity}
                    Birch Logs available
                </strong>

                <br>

                <small>
                    🛒 Cart:
                    ${birchLogs.cartQuantity}
                    · 🎒 Backpack:
                    ${birchLogs.backpackQuantity}
                    · 🏚️ Storage:
                    ${birchLogs.storageQuantity}
                </small>

                <br>

                <span>
                    ${birchBeams.totalQuantity}
                    Birch Beams owned
                </span>
            `;
        }

        if (oakElement) {

            oakElement.innerHTML = `
                <strong>
                    ${oakLogs.totalQuantity}
                    Oak Logs available
                </strong>

                <br>

                <small>
                    🛒 Cart:
                    ${oakLogs.cartQuantity}
                    · 🎒 Backpack:
                    ${oakLogs.backpackQuantity}
                    · 🏚️ Storage:
                    ${oakLogs.storageQuantity}
                </small>

                <br>

                <span>
                    ${oakBeams.totalQuantity}
                    Oak Beams owned
                </span>
            `;
        }

    } catch (error) {

        console.error(
            "Beam stock failed:",
            error
        );
    }
}


/* =====================================
   BEAM BUTTON EVENTS
===================================== */

document
    .getElementById(
        "craft-birch-beam-button"
    )
    ?.addEventListener(
        "click",
        function () {

            craftNamedBeam(
                "Birch Log",
                "Birch Beam",
                "birch-beam-amount",
                "birch-beam-message"
            );
        }
    );

document
    .getElementById(
        "craft-oak-beam-button"
    )
    ?.addEventListener(
        "click",
        function () {

            craftNamedBeam(
                "Oak Log",
                "Oak Beam",
                "oak-beam-amount",
                "oak-beam-message"
            );
        }
    );


/* =====================================
   START BEAM STOCK
===================================== */

loadBeamStock();