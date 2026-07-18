/* =====================================
    MIDGARD LEGACY

    File:
    apiary.js

    Purpose:
    Builds beehives and collects honey.
===================================== */


/* =====================================
   SETTINGS
===================================== */

const MAX_HIVES = 5;

const PLANK_COST = 30;
const NAIL_COST = 100;




/* =====================================
   LOAD APIARY
===================================== */

async function loadApiary() {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) {
        window.location.href = "login.html";
        return;
    }

    const { data: hives } = await supabaseClient
        .from("beehives")
        .select("*")
        .eq("player_id", user.id)
        .order("slot");

        window.currentHives = hives;

    const { data: inventory } = await supabaseClient
        .from("inventory")
        .select("item_id, quantity")
        .eq("player_id", user.id);

    const getItemCount = function (itemId) {
        const item = inventory.find(i => i.item_id === itemId);
        return item ? item.quantity : 0;
    };

    const plankCount = getItemCount(BIRCH_PLANK);
    const nailCount = getItemCount(IRON_NAILS);

    const hiveSlots =
        document.getElementById("hive-slots");

    hiveSlots.innerHTML = "";

    for (let slot = 1; slot <= MAX_HIVES; slot++) {

        const hive =
            hives.find(h => h.slot === slot);

        if (hive) {
            hiveSlots.innerHTML += buildHiveCard(hive);
            continue;
        }

        const previousHive =
            hives.find(h => h.slot === slot - 1);

        if (slot === 1 || previousHive) {
            hiveSlots.innerHTML += buildEmptySlotCard(
                slot,
                plankCount,
                nailCount
            );
        } else {
            hiveSlots.innerHTML += buildLockedSlotCard(slot);
        }

    }

    startHiveTimers();

}


/* =====================================
   BUILD EMPTY SLOT CARD
===================================== */

function buildEmptySlotCard(slot, plankCount, nailCount) {

    return `
        <div class="crafting-card">
            <h3>🐝 Hive Plot #${slot}</h3>

            <p>Status: <span class="green">Empty</span></p>

            <p>Birch Planks:
                <span class="green">${plankCount} / ${PLANK_COST}</span>
            </p>

            <p>Iron Nails:
                <span class="green">${nailCount} / ${NAIL_COST}</span>
            </p>

            <button onclick="buildHive(${slot})">
                🐝 Build Hive
            </button>

            <p id="hive-message-${slot}"></p>
        </div>
    `;

}


/* =====================================
   BUILD HIVE CARD
===================================== */

function buildHiveCard(hive) {

    const ready =
        isHoneyReady(hive.last_collected);

    return `
        <div class="crafting-card">
            <h3>🐝 Hive #${hive.slot}</h3>

            <p>Status:
                <span class="green" id="hive-status-${hive.id}">
                    ${ready ? "Honey Ready" : "Producing Honey"}
                </span>
            </p>

            <p id="hive-timer-${hive.id}">
                ${ready ? "🍯 Ready to collect." : "⏳ Loading timer..."}
            </p>

            <div id="hive-button-${hive.id}">
                ${ready ? `
                    <button onclick="collectHoney(${hive.id})">
                        🍯 Collect Honey
                    </button>
                ` : `
                    <button disabled>
                        ⏳ Not Ready
                    </button>
                `}
            </div>

            <p id="hive-message-${hive.slot}"></p>
        </div>
    `;

}


/* =====================================
   BUILD LOCKED SLOT CARD
===================================== */

function buildLockedSlotCard(slot) {

    return `
        <div class="crafting-card locked">
            <h3>🔒 Hive Plot #${slot}</h3>

            <p>Status: Locked</p>

            <p>Build the previous hive first.</p>
        </div>
    `;

}


/* =====================================
   CHECK HONEY READY
===================================== */

function isHoneyReady(lastCollected) {

    const last =
        new Date(lastCollected);

    const now =
        new Date();

    const hoursPassed =
        (now - last) / 1000 / 60 / 60;

    return hoursPassed >= HONEY_TIME_HOURS;

}


/* =====================================
   GET TIME REMAINING
===================================== */

function getTimeRemaining(lastCollected) {

    const finish =
        new Date(lastCollected).getTime() +
        (HONEY_TIME_HOURS * 60 * 60 * 1000);

    const now =
        Date.now();

    const remaining =
        finish - now;

    if (remaining <= 0) {
        return null;
    }

    const hours =
        Math.floor(remaining / 1000 / 60 / 60);

    const minutes =
        Math.floor((remaining / 1000 / 60) % 60);

    const seconds =
        Math.floor((remaining / 1000) % 60);

    return hours + "h " + minutes + "m " + seconds + "s";

}


/* =====================================
   START HIVE TIMERS
===================================== */

function startHiveTimers() {

    setInterval(function () {

        const timerElements =
            document.querySelectorAll("[id^='hive-timer-']");

        timerElements.forEach(function (timerElement) {

            const hiveId =
                timerElement.id.replace("hive-timer-", "");

            const statusElement =
                document.getElementById("hive-status-" + hiveId);

            const buttonElement =
                document.getElementById("hive-button-" + hiveId);

            const hiveCard =
                timerElement.closest(".crafting-card");

            const slotTitle =
                hiveCard.querySelector("h3").innerText;

            const slot =
                slotTitle.replace("🐝 Hive #", "");

            const hive =
                window.currentHives.find(h => h.id == hiveId);

            if (!hive) return;

            const timeLeft =
                getTimeRemaining(hive.last_collected);

            if (!timeLeft) {

                statusElement.innerText =
                    "Honey Ready";

                timerElement.innerText =
                    "🍯 Ready to collect.";

                buttonElement.innerHTML =
                    `<button onclick="collectHoney(${hive.id})">
                        🍯 Collect Honey
                    </button>`;

                return;
            }

            timerElement.innerText =
                "⏳ Ready in: " + timeLeft;

        });

    }, 1000);

}


/* =====================================
   BUILD HIVE
===================================== */

async function buildHive(slot) {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) return;

    const { data: plankItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", BIRCH_PLANK)
        .maybeSingle();

    const { data: nailItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", IRON_NAILS)
        .maybeSingle();

    if (!plankItem || plankItem.quantity < PLANK_COST) {
        showMessage(slot, "❌ You need 30 Birch Planks.");
        return;
    }

    if (!nailItem || nailItem.quantity < NAIL_COST) {
        showMessage(slot, "❌ You need 100 Hand-Forged Iron Nails.");
        return;
    }

    await supabaseClient
        .from("inventory")
        .update({
            quantity: plankItem.quantity - PLANK_COST
        })
        .eq("id", plankItem.id);

    await supabaseClient
        .from("inventory")
        .update({
            quantity: nailItem.quantity - NAIL_COST
        })
        .eq("id", nailItem.id);

    const { data: playerState } = await supabaseClient
        .from("players").select("tutorial_complete").eq("id", user.id).single();

    const { error: hiveError } = await supabaseClient
        .from("beehives")
        .insert({
            player_id: user.id,
            slot: slot,
            queen_installed: !playerState?.tutorial_complete,
            last_collected: new Date().toISOString()
        });

    if (hiveError) {
        showMessage(slot, "❌ Hive save failed: " + hiveError.message);
        return;
    }

    await advanceTutorial(
    TUTORIAL_STEPS.BUILD_BEEHIVE,
    TUTORIAL_STEPS.COLLECT_HONEY
);

    loadHomePage();
    loadApiary();

    

}


/* =====================================
   COLLECT HONEY
===================================== */

async function collectHoney(hiveId) {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) return;

    const { data: hive } = await supabaseClient
        .from("beehives")
        .select("*")
        .eq("id", hiveId)
        .single();

    if (!isHoneyReady(hive.last_collected)) {
        showMessage(hive.slot, "⏳ This hive is not ready yet.");
        return;
    }

    const { data: bucketItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", EMPTY_BUCKET)
        .maybeSingle();

    if (!bucketItem || bucketItem.quantity < 1) {
        showMessage(hive.slot, "❌ You need 1 Empty Bucket.");
        return;
    }

    await supabaseClient
        .from("inventory")
        .update({
            quantity: bucketItem.quantity - 1
        })
        .eq("id", bucketItem.id);

    const { data: honeyItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", HONEY_BUCKET)
        .maybeSingle();

    if (honeyItem) {
        await supabaseClient
            .from("inventory")
            .update({
                quantity: honeyItem.quantity + 1
            })
            .eq("id", honeyItem.id);
    } else {
        await supabaseClient
            .from("inventory")
            .insert({
                player_id: user.id,
                item_id: HONEY_BUCKET,
                quantity: 1
            });
    }

    await supabaseClient
        .from("beehives")
        .update({
            last_collected: new Date().toISOString()
        })
        .eq("id", hiveId);

   showMessage(
    hive.slot,
    "🍯 Honey collected! Come back in 12 hours for the next batch."
);

await advanceTutorial(
    TUTORIAL_STEPS.COLLECT_HONEY,
    TUTORIAL_STEPS.FILL_WATER_BUCKET
);

setTimeout(() => {
    loadHomePage();
    loadApiary();
}, 1200);

}


/* =====================================
   SHOW MESSAGE
===================================== */

function showMessage(slot, message) {

    const element =
        document.getElementById("hive-message-" + slot);

    if (!element) return;

    element.innerHTML = message;

    setTimeout(function () {
        element.innerHTML = "";
    }, 3000);

}


/* =====================================
   START PAGE
===================================== */

window.currentHives = [];

loadApiary();

/* PERSONAL BEE YARD OVERRIDE */
async function installQueen(hiveId,slot){
 const {data:{user}}=await supabaseClient.auth.getUser(); const {data:queenItemDef}=await supabaseClient.from('items').select('id').eq('name',ITEM_NAMES.QUEEN_BEE).maybeSingle();
 const {data:queen}=await supabaseClient.from('inventory').select('*').eq('player_id',user.id).eq('item_id',queenItemDef?.id).maybeSingle();
 if(!queen||queen.quantity<1){showMessage(slot,'❌ You need a captured Queen Bee.');return;}
 await supabaseClient.from('inventory').update({quantity:queen.quantity-1}).eq('id',queen.id); await supabaseClient.from('beehives').update({queen_installed:true,last_collected:new Date().toISOString()}).eq('id',hiveId);loadApiary();
}
const originalBuildHiveCard=buildHiveCard;
buildHiveCard=function(hive){
 if(hive.queen_installed===false){return `<div class="crafting-card"><h3>🐝 Hive #${hive.slot}</h3><p>Status: <span class="green">Empty Hive</span></p><p>Capture a Queen Bee while woodcutting.</p><button onclick="installQueen(${hive.id},${hive.slot})">👑 Add Queen Bee</button><p id="hive-message-${hive.slot}"></p></div>`;}
 return originalBuildHiveCard(hive);
};
