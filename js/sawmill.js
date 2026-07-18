/* =====================================

    MIDGARD LEGACY

    File:
    sawmill.js

    Purpose:
    Turns Birch Logs into Birch Planks
    and updates tutorial progress.

===================================== */


/* =====================================
   SETTINGS
===================================== */

/*
    Delete these two lines if BIRCH_LOG
    and BIRCH_PLANK already exist in
    constants.js.
*/


const LOGS_REQUIRED = 1;
const PLANKS_CREATED = 2;


/* =====================================
   PAGE ELEMENTS
===================================== */

const sawBirchButton =
    document.getElementById("saw-birch-button");


/* =====================================
   SAW BIRCH LOG
===================================== */

async function sawBirchLog() {

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
       LOAD BIRCH LOGS
    ===================================== */

    const {
        data: logItem,
        error: logLoadError
    } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", BIRCH_LOG)
        .maybeSingle();

    if (logLoadError) {
        showSawmillMessage(
            "❌ Birch Logs failed to load: " +
            logLoadError.message
        );
        return;
    }


    /* =====================================
       CHECK PLAYER HAS A LOG
    ===================================== */

    if (
        !logItem ||
        logItem.quantity < LOGS_REQUIRED
    ) {
        showSawmillMessage(
            "❌ You need at least 1 Birch Log."
        );
        return;
    }


    /* =====================================
       LOAD BIRCH PLANKS
    ===================================== */

    const {
        data: plankItem,
        error: plankLoadError
    } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", BIRCH_PLANK)
        .maybeSingle();

    if (plankLoadError) {
        showSawmillMessage(
            "❌ Birch Planks failed to load: " +
            plankLoadError.message
        );
        return;
    }


    /* =====================================
       ADD BIRCH PLANKS
    ===================================== */

    if (plankItem) {

        const { error: plankUpdateError } =
            await supabaseClient
                .from("inventory")
                .update({
                    quantity:
                        plankItem.quantity +
                        PLANKS_CREATED
                })
                .eq("id", plankItem.id);

        if (plankUpdateError) {
            showSawmillMessage(
                "❌ Birch Planks failed to update: " +
                plankUpdateError.message
            );
            return;
        }

    } else {

        const { error: plankInsertError } =
            await supabaseClient
                .from("inventory")
                .insert({
                    player_id: user.id,
                    item_id: BIRCH_PLANK,
                    quantity: PLANKS_CREATED
                });

        if (plankInsertError) {
            showSawmillMessage(
                "❌ Birch Planks failed to enter inventory: " +
                plankInsertError.message
            );
            return;
        }

    }


    /* =====================================
       REMOVE BIRCH LOG
    ===================================== */

    const newLogQuantity =
        logItem.quantity - LOGS_REQUIRED;

    if (newLogQuantity > 0) {

        const { error: logUpdateError } =
            await supabaseClient
                .from("inventory")
                .update({
                    quantity: newLogQuantity
                })
                .eq("id", logItem.id);

        if (logUpdateError) {
            showSawmillMessage(
                "❌ Birch Logs failed to update: " +
                logUpdateError.message
            );
            return;
        }

    } else {

        const { error: logDeleteError } =
            await supabaseClient
                .from("inventory")
                .delete()
                .eq("id", logItem.id);

        if (logDeleteError) {
            showSawmillMessage(
                "❌ Birch Logs failed to update: " +
                logDeleteError.message
            );
            return;
        }

    }


    /* =====================================
       UPDATE TUTORIAL
    ===================================== */

    let tutorialResult = null;

    if (
        typeof addTutorialProgress === "function" &&
        typeof TUTORIAL_STEPS !== "undefined" &&
        typeof TUTORIAL_TARGETS !== "undefined"
    ) {

        tutorialResult =
            await addTutorialProgress(
                "birch_planks",
                PLANKS_CREATED,
                TUTORIAL_STEPS.MAKE_PLANKS,
                TUTORIAL_STEPS.GATHER_BOG_IRON,
                TUTORIAL_TARGETS.birch_planks
            );

    }


    /* =====================================
       CREATE ACTION MESSAGE
    ===================================== */

    let actionMessage = `
        🪚 You cut
        <strong>${LOGS_REQUIRED} Birch Log</strong>
        into
        <strong>${PLANKS_CREATED} Birch Planks</strong>.
    `;


    /* =====================================
       TUTORIAL MESSAGE
    ===================================== */

    if (
        tutorialResult &&
        tutorialResult.completed
    ) {

        actionMessage += `
            <br><br>

            ✅ <strong>Plank cutting complete!</strong>

            <br><br>

            📜 <strong>New Objective</strong><br>
            Travel into the Wilderness and gather Bog Iron
            from the Mine.

            <br><br>

            <button
                onclick="window.location.href='wildness.html'">
                🌲 Go to Wilderness
            </button>
        `;

        if (sawBirchButton) {
            sawBirchButton.disabled = true;
            sawBirchButton.innerText =
                "✅ Plank Task Complete";
        }

    } else if (tutorialResult) {

        actionMessage += `
            <br><br>

            📜 <strong>Tutorial Progress</strong><br>

            <span class="green">
                ${tutorialResult.current}
                /
                ${tutorialResult.target}
                Birch Planks
            </span>
        `;

    }


    /* =====================================
       SHOW MESSAGE
    ===================================== */

    showSawmillMessage(actionMessage);


    /* =====================================
       REFRESH PLAYER INFORMATION
    ===================================== */

    if (typeof loadHomePage === "function") {
        loadHomePage();
    }

}


/* =====================================
   SHOW SAWMILL MESSAGE
===================================== */

function showSawmillMessage(message) {

    const element =
        document.getElementById("sawmill-message");

    if (!element) return;

    element.innerHTML = message;

}


/* =====================================
   BUTTON EVENT
===================================== */

if (sawBirchButton) {

    sawBirchButton.addEventListener(
        "click",
        sawBirchLog
    );

}

const sawOakButton=document.getElementById('saw-oak-button');
async function loadOakSawmill(){const {data:{user}}=await supabaseClient.auth.getUser();if(!user)return;const {data:p}=await supabaseClient.from('players').select('oak_unlocked').eq('id',user.id).single();if(p?.oak_unlocked&&sawOakButton){document.getElementById('oak-sawmill-card')?.classList.remove('locked');sawOakButton.disabled=false;sawOakButton.innerText='🪚 Saw Oak Log';}}
async function sawOakLog(){const {data:{user}}=await supabaseClient.auth.getUser();const log=await getItemByName(ITEM_NAMES.OAK_LOG),plank=await getItemByName(ITEM_NAMES.OAK_PLANK);const {data:r}=await supabaseClient.from('inventory').select('*').eq('player_id',user.id).eq('item_id',log?.id).maybeSingle();if(!r||r.quantity<1){document.getElementById('oak-sawmill-message').innerText='❌ You need 1 Oak Log.';return;}await supabaseClient.from('inventory').update({quantity:r.quantity-1}).eq('id',r.id);await addInventoryById(user.id,plank.id,2);await addVillageReputation(2);document.getElementById('oak-sawmill-message').innerHTML='🪚 You cut <strong>1 Oak Log</strong> into <strong>2 Oak Planks</strong>.';}
sawOakButton?.addEventListener('click',sawOakLog);loadOakSawmill();
