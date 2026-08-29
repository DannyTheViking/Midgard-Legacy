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

/*
   Safe brewing timer.
   Uses BREW_TIME_SECONDS from config.js when available.
   Falls back to 5 minutes in TEST_MODE or 24 hours in production.
*/
const MEAD_BREW_TIME_SECONDS =
    typeof getGameTimerSeconds === "function"
        ? getGameTimerSeconds(
            "young_mead_seconds",
            24 * 60 * 60
        )
        : (
            typeof YOUNG_MEAD_TIME_SECONDS !== "undefined"
                ? Number(YOUNG_MEAD_TIME_SECONDS)
                : 24 * 60 * 60
        );

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
        <article class="mead-card empty">

            <div class="mead-card-image mead-empty-area">
                🪵
            </div>

            <header class="mead-card-header">

                <div>

                    <h2>
                        Mead Shelf #${slot}
                    </h2>

                    <p>
                        Place an empty barrel onto this shelf
                        to begin brewing.
                    </p>

                </div>

                <span class="mead-status-badge empty">
                    Empty
                </span>

            </header>

            <div class="mead-card-body">

                <div class="mead-requirements">

                    <p>

                        <span>
                            🛢️ Empty Barrel
                        </span>

                        <span class="green">
                            1
                        </span>

                    </p>

                </div>

                <button
                    type="button"
                    class="mead-button"
                    onclick="addBarrel(${slot})"
                >
                    🛢️ Add Barrel
                </button>

                <div class="mead-action">

                    <h4>
                        Latest Action
                    </h4>

                    <p id="mead-message-${slot}">
                        Shelf ready for a barrel.
                    </p>

                </div>

            </div>

        </article>
    `;

}


/* =====================================
   LOCKED SHELF CARD
===================================== */

function buildLockedShelfCard(slot) {

    return `
        <article class="mead-card locked">

            <div class="mead-card-image mead-locked-area">
                🔒
            </div>

            <header class="mead-card-header">

                <div>

                    <h2>
                        Mead Shelf #${slot}
                    </h2>

                    <p>
                        This brewing shelf has not yet
                        been unlocked.
                    </p>

                </div>

                <span class="mead-status-badge locked">
                    Locked
                </span>

            </header>

            <div class="mead-card-body">

                <div class="mead-requirements">

                    <p>

                        <span>
                            🔓 Unlock Requirement
                        </span>

                        <span>
                            Fill the previous shelf
                        </span>

                    </p>

                </div>

                <button
                    type="button"
                    class="mead-button"
                    disabled
                >
                    🔒 Shelf Locked
                </button>

                <div class="mead-action">

                    <h4>
                        How to Unlock
                    </h4>

                    <p>
                        Add a barrel to the previous shelf first.
                    </p>

                </div>

            </div>

        </article>
    `;

}


/* =====================================
   READY BARREL CARD
===================================== */

function buildReadyBarrelCard(barrel) {

    return `
        <article class="mead-card">

            <div class="mead-card-image mead-barrel-area">
                🛢️
            </div>

            <header class="mead-card-header">

                <div>

                    <h2>
                        Mead Barrel #${barrel.slot}
                    </h2>

                    <p>
                        The barrel is installed and ready
                        to be filled.
                    </p>

                </div>

                <span class="mead-status-badge empty">
                    Empty Barrel
                </span>

            </header>

            <div class="mead-card-body">

                <div class="mead-requirements">

                    <p>

                        <span>
                            🍯 Honey Bucket
                        </span>

                        <span class="green">
                            ${HONEY_BUCKET_COST}
                        </span>

                    </p>

                    <p>

                        <span>
                            💧 Water Bucket
                        </span>

                        <span class="green">
                            ${WATER_BUCKET_COST}
                        </span>

                    </p>

                    <p>

                        <span>
                            🍺 Produces
                        </span>

                        <span class="green">
                            1 Young Mead
                        </span>

                    </p>

                </div>

                <button
                    type="button"
                    class="mead-button"
                    onclick="startBrewing(${barrel.id})"
                >
                    🍯 Add Honey and Water
                </button>

                <div class="mead-action">

                    <h4>
                        Latest Action
                    </h4>

                    <p id="mead-message-${barrel.slot}">
                        Ready to begin brewing.
                    </p>

                </div>

            </div>

        </article>
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
        <article class="mead-card brewing">

            <div class="mead-card-image mead-brewing-area">
                🍺
            </div>

            <header class="mead-card-header">

                <div>

                    <h2>
                        Young Mead #${barrel.slot}
                    </h2>

                    <p>
                        Honey and water slowly ferment
                        inside the barrel.
                    </p>

                </div>

                <span
                    class="mead-status-badge brewing"
                    id="mead-status-${barrel.id}"
                >
                    ${ready ? "Ready" : "Brewing"}
                </span>

            </header>

            <div class="mead-card-body">

                <div class="mead-brewing-status">

                    <span>
                        ⏳ Brewing Timer
                    </span>

                    <strong id="mead-timer-${barrel.id}">
                        ${
                            ready
                                ? "🍺 Mead is ready."
                                : "Loading timer..."
                        }
                    </strong>

                </div>

                <div class="mead-progress">

                    <div
                        class="mead-progress-fill brewing-animation"
                    ></div>

                </div>

                <button
                    type="button"
                    class="mead-button"
                    disabled
                >
                    ⏳ Brewing
                </button>

                <div class="mead-action">

                    <h4>
                        Brewing Activity
                    </h4>

                    <p id="mead-message-${barrel.slot}">
                        The barrel is fermenting.
                    </p>

                </div>

            </div>

        </article>
    `;

}


/* =====================================
   FINISHED CARD
===================================== */

function buildFinishedCard(barrel) {

    return `
        <article class="mead-card ready">

            <div class="mead-card-image mead-ready-area">
                🍺
            </div>

            <header class="mead-card-header">

                <div>

                    <h2>
                        Young Mead #${barrel.slot}
                    </h2>

                    <p>
                        The finished batch is ready
                        to be collected.
                    </p>

                </div>

                <span class="mead-status-badge ready">
                    Ready
                </span>

            </header>

            <div class="mead-card-body">

                <div class="mead-requirements">

                    <p>

                        <span>
                            🍺 Finished Batch
                        </span>

                        <span class="green">
                            1 Young Mead
                        </span>

                    </p>

                    <p>

                        <span>
                            ⭐ Brewing XP
                        </span>

                        <span class="green">
                            25 XP
                        </span>

                    </p>

                </div>

                <button
                    type="button"
                    class="mead-button"
                    onclick="collectYoungMead(${barrel.id})"
                >
                    🍺 Collect Young Mead
                </button>

                <div class="mead-action">

                    <h4>
                        Latest Action
                    </h4>

                    <p id="mead-message-${barrel.slot}">
                        Your mead is ready to collect.
                    </p>

                </div>

            </div>

        </article>
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
    if (typeof logGameActivity === "function") {
        await logGameActivity("mead_barrel_added", {
            slot
        });
    }

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
    if (typeof logGameActivity === "function") {
        await logGameActivity(
            "mead_brewing_started",
            {
                barrel_id: barrel.id,
                slot: barrel.slot,
                ready_in_seconds:
                    MEAD_BREW_TIME_SECONDS
            }
        );
    }


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
        (MEAD_BREW_TIME_SECONDS * 1000);

    return Date.now() >= finishTime;

}


/* =====================================
   TIME REMAINING
===================================== */

function getTimeRemaining(startedAt) {

    const finishTime =
        new Date(startedAt).getTime() +
        (MEAD_BREW_TIME_SECONDS * 1000);

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

    await addBrewingXP(25);
    await incrementGameStatistics({
        mead_brewed: 1,
        drinks_brewed: 1
    }); await addPlayerXP(5);
    await advanceTutorial(
    TUTORIAL_STEPS.BREW_YOUNG_MEAD,
    TUTORIAL_STEPS.RETURN_TO_KING
);

    if (typeof window.refreshTutorialAfterAction === "function") {
        await window.refreshTutorialAfterAction();
    }

    if (typeof logGameActivity === "function") {
        await logGameActivity(
            "young_mead_collected",
            {
                quantity: 1,
                barrel_id: barrel.id
            }
        );
    }

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