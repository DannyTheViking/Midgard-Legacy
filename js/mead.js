/* =====================================
    MIDGARD LEGACY

    File:
    mead.js

    Purpose:
    Adds barrels, brews young mead
    and collects finished batches.
===================================== */


/* =====================================
   SETTINGS
===================================== */

const MAX_MEAD_SHELVES = 5;
const EMPTY_BARREL_COST = 1;
const HONEY_BUCKET_COST = 1;
const WATER_BUCKET_COST = 1;


/* =====================================
   PAGE DATA
===================================== */

let currentMeadBarrels = [];

let meadTimerInterval = null;


/* =====================================
   LOAD MEAD HALL
===================================== */

async function loadMeadHall() {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) {
        window.location.href = "login.html";
        return;
    }

    const { data: barrels, error } = await supabaseClient
        .from("mead_barrels")
        .select("*")
        .eq("player_id", user.id)
        .order("slot");

    if (error) {
        showPageMessage(
            "❌ Mead Hall failed to load: " + error.message
        );
        return;
    }

    currentMeadBarrels = barrels || [];

    renderMeadShelves();
    startMeadTimers();

}


/* =====================================
   RENDER SHELVES
===================================== */

function renderMeadShelves() {

    const shelves =
        document.getElementById("mead-shelves");

    shelves.innerHTML = "";

    for (let slot = 1; slot <= MAX_MEAD_SHELVES; slot++) {

        const barrel =
            currentMeadBarrels.find(
                item => item.slot === slot
            );

        if (barrel) {
            shelves.innerHTML += buildBarrelCard(barrel);
            continue;
        }

        const previousBarrel =
            currentMeadBarrels.find(
                item => item.slot === slot - 1
            );

        if (slot === 1 || previousBarrel) {
            shelves.innerHTML += buildEmptyShelfCard(slot);
        } else {
            shelves.innerHTML += buildLockedShelfCard(slot);
        }

    }

}


/* =====================================
   EMPTY SHELF CARD
===================================== */

function buildEmptyShelfCard(slot) {

    return `
        <div class="crafting-card">

            <h3>🪵 Mead Shelf #${slot}</h3>

            <p>
                Status:
                <span class="green">Empty</span>
            </p>

            <p>
                Requires:
                <span class="green">1 Empty Barrel</span>
            </p>

            <button onclick="addBarrel(${slot})">
                🛢️ Add Barrel
            </button>

            <p id="mead-message-${slot}"></p>

        </div>
    `;

}


/* =====================================
   LOCKED SHELF CARD
===================================== */

function buildLockedShelfCard(slot) {

    return `
        <div class="crafting-card locked">

            <h3>🔒 Mead Shelf #${slot}</h3>

            <p>Status: Locked</p>

            <p>Add a barrel to the previous shelf first.</p>

        </div>
    `;

}


/* =====================================
   BARREL CARD
===================================== */

function buildBarrelCard(barrel) {

    if (barrel.stage === "barrel_added") {
        return buildReadyBarrelCard(barrel);
    }

    if (barrel.stage === "brewing") {
        return buildBrewingCard(barrel);
    }

    if (barrel.stage === "ready") {
        return buildFinishedCard(barrel);
    }

    return buildReadyBarrelCard(barrel);

}


/* =====================================
   READY BARREL CARD
===================================== */

function buildReadyBarrelCard(barrel) {

    return `
        <div class="crafting-card">

            <h3>🛢️ Mead Barrel #${barrel.slot}</h3>

            <p>
                Status:
                <span class="green">Empty Barrel</span>
            </p>

            <p>
                Requires:
                <span class="green">1 Honey Bucket</span>
            </p>

            <p>
                Requires:
                <span class="green">1 Water Bucket</span>
            </p>

            <button onclick="startBrewing(${barrel.id})">
                🍯 Add Honey and Water
            </button>

            <p id="mead-message-${barrel.slot}"></p>

        </div>
    `;

}


/* =====================================
   BREWING CARD
===================================== */

function buildBrewingCard(barrel) {

    const ready =
        isBrewReady(barrel.started_at);

    if (ready) {
        setTimeout(function () {
            markMeadReady(barrel.id);
        }, 0);
    }

    return `
        <div class="crafting-card">

            <h3>🍺 Young Mead #${barrel.slot}</h3>

            <p>
                Status:
                <span
                    class="green"
                    id="mead-status-${barrel.id}">
                    ${ready ? "Ready" : "Brewing"}
                </span>
            </p>

            <p id="mead-timer-${barrel.id}">
                ${ready ? "🍺 Mead is ready." : "⏳ Loading timer..."}
            </p>

            <button disabled>
                ⏳ Brewing
            </button>

            <p id="mead-message-${barrel.slot}"></p>

        </div>
    `;

}


/* =====================================
   FINISHED CARD
===================================== */

function buildFinishedCard(barrel) {

    return `
        <div class="crafting-card">

            <h3>🍺 Young Mead #${barrel.slot}</h3>

            <p>
                Status:
                <span class="green">Ready</span>
            </p>

            <p>Your first batch of mead is ready.</p>

            <button onclick="collectYoungMead(${barrel.id})">
                🍺 Collect Young Mead
            </button>

            <p id="mead-message-${barrel.slot}"></p>

        </div>
    `;

}


/* =====================================
   ADD BARREL
===================================== */

async function addBarrel(slot) {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) return;

    const { data: barrelItem, error } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", EMPTY_BARREL)
        .maybeSingle();

    if (error) {
        showShelfMessage(slot, error.message);
        return;
    }

    if (!barrelItem || barrelItem.quantity < EMPTY_BARREL_COST) {
        showShelfMessage(
            slot,
            "❌ You need 1 Empty Barrel."
        );
        return;
    }

    const { error: insertError } = await supabaseClient
        .from("mead_barrels")
        .insert({
            player_id: user.id,
            slot: slot,
            stage: "barrel_added",
            started_at: null
        });

    if (insertError) {
        showShelfMessage(
            slot,
            "❌ Barrel failed to save: " + insertError.message
        );
        return;
    }

    const { error: removeError } = await supabaseClient
        .from("inventory")
        .update({
            quantity: barrelItem.quantity - EMPTY_BARREL_COST
        })
        .eq("id", barrelItem.id);

    if (removeError) {
        showShelfMessage(
            slot,
            "❌ Barrel failed to leave inventory: " +
            removeError.message
        );
        return;
    }

    loadHomePage();
    loadMeadHall();

}


/* =====================================
   START BREWING
===================================== */

async function startBrewing(barrelId) {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) return;

    const barrel =
        currentMeadBarrels.find(
            item => item.id === barrelId
        );

    if (!barrel) return;

    const { data: honeyItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", HONEY_BUCKET)
        .maybeSingle();

    const { data: waterItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", WATER_BUCKET)
        .maybeSingle();

    if (!honeyItem || honeyItem.quantity < HONEY_BUCKET_COST) {
        showShelfMessage(
            barrel.slot,
            "❌ You need 1 Honey Bucket."
        );
        return;
    }

    if (!waterItem || waterItem.quantity < WATER_BUCKET_COST) {
        showShelfMessage(
            barrel.slot,
            "❌ You need 1 Water Bucket."
        );
        return;
    }

    const { error: brewError } = await supabaseClient
        .from("mead_barrels")
        .update({
            stage: "brewing",
            started_at: new Date().toISOString()
        })
        .eq("id", barrel.id)
        .eq("player_id", user.id);

    if (brewError) {
        showShelfMessage(
            barrel.slot,
            "❌ Brewing failed: " + brewError.message
        );
        return;
    }

    await reduceInventoryItem(
        honeyItem,
        HONEY_BUCKET_COST
    );

    await reduceInventoryItem(
        waterItem,
        WATER_BUCKET_COST
    );

    showPageMessage(
        "🍯 Honey and water added. Your mead has started brewing."
    );

    loadHomePage();
    loadMeadHall();

}


/* =====================================
   CHECK BREW READY
===================================== */

function isBrewReady(startedAt) {

    if (!startedAt) return false;

    const finishTime =
        new Date(startedAt).getTime() +
        (BREW_TIME_HOURS * 60 * 60 * 1000);

    return Date.now() >= finishTime;

}


/* =====================================
   TIME REMAINING
===================================== */

function getTimeRemaining(startedAt) {

    const finishTime =
        new Date(startedAt).getTime() +
        (BREW_TIME_HOURS * 60 * 60 * 1000);

    const remaining =
        finishTime - Date.now();

    if (remaining <= 0) {
        return null;
    }

    const hours =
        Math.floor(remaining / 1000 / 60 / 60);

    const minutes =
        Math.floor((remaining / 1000 / 60) % 60);

    const seconds =
        Math.floor((remaining / 1000) % 60);

    return (
        hours + "h " +
        minutes + "m " +
        seconds + "s"
    );

}


/* =====================================
   START TIMERS
===================================== */

function startMeadTimers() {

    if (meadTimerInterval) {
        clearInterval(meadTimerInterval);
    }

    updateMeadTimers();

    meadTimerInterval =
        setInterval(updateMeadTimers, 1000);

}


/* =====================================
   UPDATE TIMERS
===================================== */

function updateMeadTimers() {

    currentMeadBarrels.forEach(function (barrel) {

        if (barrel.stage !== "brewing") {
            return;
        }

        const timerElement =
            document.getElementById(
                "mead-timer-" + barrel.id
            );

        if (!timerElement) return;

        const timeLeft =
            getTimeRemaining(barrel.started_at);

        if (!timeLeft) {
            markMeadReady(barrel.id);
            return;
        }

        timerElement.innerText =
            "⏳ Ready in: " + timeLeft;

    });

}


/* =====================================
   MARK MEAD READY
===================================== */

async function markMeadReady(barrelId) {

    const barrel =
        currentMeadBarrels.find(
            item => item.id === barrelId
        );

    if (!barrel || barrel.stage !== "brewing") {
        return;
    }

    const { error } = await supabaseClient
        .from("mead_barrels")
        .update({
            stage: "ready"
        })
        .eq("id", barrel.id);

    if (error) {
        console.error(error);
        return;
    }

    loadMeadHall();

}


/* =====================================
   COLLECT YOUNG MEAD
===================================== */

async function collectYoungMead(barrelId) {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) return;

    const barrel =
        currentMeadBarrels.find(
            item => item.id === barrelId
        );

    if (!barrel) return;

    const { data: meadItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", YOUNG_MEAD)
        .maybeSingle();

    if (meadItem) {

        const { error } = await supabaseClient
            .from("inventory")
            .update({
                quantity: meadItem.quantity + 1
            })
            .eq("id", meadItem.id);

        if (error) {
            showShelfMessage(
                barrel.slot,
                "❌ Mead failed to enter inventory: " +
                error.message
            );
            return;
        }

    } else {

        const { error } = await supabaseClient
            .from("inventory")
            .insert({
                player_id: user.id,
                item_id: YOUNG_MEAD,
                quantity: 1
            });

        if (error) {
            showShelfMessage(
                barrel.slot,
                "❌ Mead failed to enter inventory: " +
                error.message
            );
            return;
        }

    }

    const { error: shelfError } = await supabaseClient
        .from("mead_barrels")
        .delete()
        .eq("id", barrel.id)
        .eq("player_id", user.id);

    if (shelfError) {
        showShelfMessage(
            barrel.slot,
            "❌ Shelf failed to reset: " +
            shelfError.message
        );
        return;
    }

    await addBrewingXP(25); await addPlayerXP(5);
    await advanceTutorial(
    TUTORIAL_STEPS.BREW_YOUNG_MEAD,
    TUTORIAL_STEPS.RETURN_TO_KING
);

    showPageMessage(
        "🍺 You collected 1 Young Mead. The empty shelf needs another barrel."
    );

    loadHomePage();
    loadMeadHall();

}


/* =====================================
   REDUCE INVENTORY ITEM
===================================== */

async function reduceInventoryItem(item, amount) {

    const newQuantity =
        item.quantity - amount;

    await supabaseClient
        .from("inventory")
        .update({
            quantity: newQuantity
        })
        .eq("id", item.id);

}


/* =====================================
   SHELF MESSAGE
===================================== */

function showShelfMessage(slot, message) {

    const element =
        document.getElementById(
            "mead-message-" + slot
        );

    if (!element) {
        showPageMessage(message);
        return;
    }

    element.innerHTML = message;

    setTimeout(function () {
        element.innerHTML = "";
    }, 4000);

}


/* =====================================
   PAGE MESSAGE
===================================== */

function showPageMessage(message) {

    const element =
        document.getElementById("mead-page-message");

    if (!element) return;

    element.innerHTML = message;

    setTimeout(function () {
        element.innerHTML = "";
    }, 4000);

}


/* =====================================
   START PAGE
===================================== */

loadMeadHall();