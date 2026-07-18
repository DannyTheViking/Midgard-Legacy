/* =====================================

    MIDGARD LEGACY

    File:
    forest.js

    Purpose:
    Allows the player to chop Birch Trees,
    gain logs, XP and tutorial progress.

===================================== */


/* =====================================
   SETTINGS
===================================== */

/*
    Delete this line if BIRCH_LOG is
    already declared inside constants.js.
*/


const ENERGY_COST = 5;


/* =====================================
   PAGE ELEMENTS
===================================== */

const chopButton =
    document.getElementById("chop-birch");


/* =====================================
   CHOP BIRCH TREE
===================================== */

async function chopBirchTree() {

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
       LOAD PLAYER DATA
    ===================================== */

    const {
        data: player,
        error: playerError
    } = await supabaseClient
        .from("players")
        .select("id, energy")
        .eq("id", user.id)
        .single();

    if (playerError || !player) {
        showForestMessage(
            "❌ Player failed to load: " +
            (playerError?.message || "Unknown error.")
        );
        return;
    }


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
        showForestMessage(
            "❌ Axe failed to load: " +
            axeError.message
        );
        return;
    }

    if (!axe) {
        showForestMessage(
            "❌ You need to equip an axe before chopping."
        );
        return;
    }

    if (axe.durability <= 0) {

        showForestMessage(
            "💀 Your axe is broken.<br><br>" +
            "Visit the Blacksmith to repair it."
        );

        await loadToolBeltAxe();
        return;
    }


    /* =====================================
       CHECK ENERGY
    ===================================== */

    if (player.energy < ENERGY_COST) {

        showForestMessage(
            "⚡ You do not have enough energy.<br><br>" +
            `You need ${ENERGY_COST} energy to chop Birch.`
        );

        return;
    }


    /* =====================================
       CALCULATE REWARD
    ===================================== */

    const logs =
        Math.floor(Math.random() * 5) + 1;

    const newEnergy =
        player.energy - ENERGY_COST;


    /* =====================================
       ADD LOGS TO CART OR INVENTORY
    ===================================== */

    let sentToCart = false;
    if (typeof addResourceToCartOrInventory === "function") {
        try { sentToCart = await addResourceToCartOrInventory(user.id, BIRCH_LOG, logs); }
        catch (cartError) { showForestMessage("❌ " + cartError.message); return; }
    }

    if (!sentToCart) {
        const { data: inventoryItem, error: inventoryLoadError } = await supabaseClient
            .from("inventory").select("*").eq("player_id", user.id).eq("item_id", BIRCH_LOG).maybeSingle();
        if (inventoryLoadError) { showForestMessage("❌ Inventory failed to load: " + inventoryLoadError.message); return; }
        if (inventoryItem) {
            const { error: inventoryUpdateError } = await supabaseClient.from("inventory")
                .update({ quantity: inventoryItem.quantity + logs }).eq("id", inventoryItem.id);
            if (inventoryUpdateError) { showForestMessage("❌ Logs failed to enter inventory: " + inventoryUpdateError.message); return; }
        } else {
            const { error: inventoryInsertError } = await supabaseClient.from("inventory")
                .insert({ player_id: user.id, item_id: BIRCH_LOG, quantity: logs });
            if (inventoryInsertError) { showForestMessage("❌ Logs failed to enter inventory: " + inventoryInsertError.message); return; }
        }
    }

    /* =====================================
       UPDATE PLAYER ENERGY
    ===================================== */

    const { error: playerUpdateError } =
        await supabaseClient
            .from("players")
            .update({
                energy: newEnergy,
                last_action:
                    new Date().toISOString()
            })
            .eq("id", user.id);

    if (playerUpdateError) {
        showForestMessage(
            "❌ Energy failed to update: " +
            playerUpdateError.message
        );
        return;
    }


    /* =====================================
       GIVE XP
    ===================================== */

    /* XP must never stop a successful chop from updating the page. */
    try {
        if (typeof addWoodcuttingXP === "function") {
            await addWoodcuttingXP(WOODCUTTING_XP_PER_BIRCH);
        }

        if (typeof addPlayerXP === "function") {
            await addPlayerXP(PLAYER_XP_PER_BIRCH);
        }
    } catch (xpError) {
        console.error("Birch XP failed:", xpError);
    }


    /* =====================================
       DAMAGE EQUIPPED AXE
    ===================================== */

    await damageEquippedTool("axe", 1);


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
                "birch_logs",
                logs,
                TUTORIAL_STEPS.CHOP_BIRCH,
                TUTORIAL_STEPS.MAKE_PLANKS,
                TUTORIAL_TARGETS.birch_logs
            );

    }


    /* =====================================
       CREATE ACTION MESSAGE
    ===================================== */

    let actionMessage = `
        🪓 You spend
        <strong>${ENERGY_COST} energy</strong>
        chopping down a Birch Tree.<br><br>

        🪵 You gather
        <strong>${logs} Birch Logs</strong>.<br><br>

        Your Woodcutting skill improves.<br><br>${sentToCart ? "🛒 The logs were loaded into your cart." : "🎒 The logs were placed in your inventory."}
    `;


    /* =====================================
       TUTORIAL PROGRESS MESSAGE
    ===================================== */

    if (
        tutorialResult &&
        tutorialResult.completed
    ) {

        actionMessage += `
            <br><br>

            ✅ <strong>Birch gathering complete!</strong>

            <br><br>

            📜 <strong>New Objective</strong><br>
            Take your Birch Logs to the Village
            Sawmill and turn them into Birch Planks.

            <br><br>

            <button
                onclick="window.location.href='village.html'">
                🏘️ Go to Village
            </button>
        `;

    } else if (tutorialResult) {

        actionMessage += `
            <br><br>

            📜 <strong>Tutorial Progress</strong><br>

            <span class="green">
                ${tutorialResult.current}
                /
                ${tutorialResult.target}
                Birch Logs
            </span>
        `;

    }


    /* =====================================
       SHOW ACTION MESSAGE
    ===================================== */

    setBirchMessage(actionMessage, true);


    /* =====================================
       REFRESH PAGE DATA
    ===================================== */

    // Update the visible page immediately instead of waiting for a refresh.
    const energyElement = document.getElementById("energy");
    if (energyElement) {
        energyElement.textContent = `${newEnergy} / 100`;
    }

    await Promise.all([
        typeof updateTopBarPlayer === "function" ? updateTopBarPlayer() : Promise.resolve(),
        typeof loadToolBeltAxe === "function" ? loadToolBeltAxe() : Promise.resolve(),
        typeof loadCartCard === "function" ? loadCartCard() : Promise.resolve()
    ]);

    // Reputation is useful, but it must never block the chop result from appearing.
    if (typeof addVillageReputation === "function") {
        try {
            await addVillageReputation(logs);
        } catch (reputationError) {
            console.error("Birch reputation failed:", reputationError);
        }
    }

}


/* =====================================
   BIRCH ACTION MESSAGE
===================================== */

function setBirchMessage(message, addToHistory = false) {
    const birchLog = document.getElementById("birch-log");

    if (birchLog) {
        birchLog.innerHTML = message;
    }

    if (addToHistory) {
        const forestLog = document.getElementById("forest-log");
        let history =
            JSON.parse(localStorage.getItem("forestHistory")) || [];

        history.unshift(message);
        history = history.slice(0, 5);

        localStorage.setItem(
            "forestHistory",
            JSON.stringify(history)
        );

        if (forestLog) {
            forestLog.innerHTML = history.join("<hr>");
        }
    }
}


/* =====================================
   SHOW FOREST MESSAGE
===================================== */

function showForestMessage(message) {

    const birchLog =
        document.getElementById("birch-log");

    const forestLog =
        document.getElementById("forest-log");

    if (birchLog) {
        birchLog.innerHTML = message;
    }

    let forestHistory =
        JSON.parse(
            localStorage.getItem("forestHistory")
        ) || [];

    forestHistory.unshift(message);

    forestHistory =
        forestHistory.slice(0, 5);

    localStorage.setItem(
        "forestHistory",
        JSON.stringify(forestHistory)
    );

    if (forestLog) {
        forestLog.innerHTML =
            forestHistory.join("<hr>");
    }

}


/* =====================================
   LOAD SAVED FOREST HISTORY
===================================== */

function loadSavedForestHistory() {

    const savedForestHistory =
        JSON.parse(
            localStorage.getItem("forestHistory")
        ) || [];

    if (savedForestHistory.length === 0) {
        return;
    }

    const forestLog =
        document.getElementById("forest-log");

    /*
        Saved history belongs only in Recent Loot.
        Do not copy the newest Oak action into the Birch card.
        Each tree card keeps its own current message.
    */
    if (forestLog) {
        forestLog.innerHTML =
            savedForestHistory.join("<hr>");
    }

}


/* =====================================
   LOAD TOOL BELT AXE
===================================== */

async function loadToolBeltAxe() {

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
            durability,
            max_durability,
            items (
                name,
                description
            )
        `)
        .eq("player_id", user.id)
        .eq("slot", "axe")
        .eq("is_equipped", true)
        .maybeSingle();

    const axeName =
        document.getElementById("axe-name");

    const axeBonus =
        document.getElementById("axe-bonus");

    const durabilityFill =
        document.getElementById(
            "axe-durability-fill"
        );

    if (error) {
        console.error(
            "Axe failed to load:",
            error
        );
        return;
    }

    if (!axe) {

        if (axeName) {
            axeName.innerText =
                "No Axe Equipped";
        }

        if (axeBonus) {
            axeBonus.innerText =
                "Equip an axe to chop trees.";
        }

        if (durabilityFill) {
            durabilityFill.style.width = "0%";
        }

        if (chopButton) {
            chopButton.disabled = true;
            chopButton.innerText =
                "❌ No Axe Equipped";
        }

        return;
    }


    /* =====================================
       CALCULATE DURABILITY
    ===================================== */

    const durabilityPercent =
        axe.max_durability > 0
            ? (
                axe.durability /
                axe.max_durability
            ) * 100
            : 0;


    /* =====================================
       DISPLAY AXE DETAILS
    ===================================== */

    if (axe.durability <= 0) {

        if (axeName) {
            axeName.innerText =
                "💀 Broken " + axe.items.name;
        }

        if (axeBonus) {
            axeBonus.innerText =
                "Visit the Blacksmith to repair this tool.";
        }

        if (chopButton) {
            chopButton.disabled = true;
            chopButton.innerText =
                "💀 Axe Broken";
        }

    } else {

        if (axeName) {
            axeName.innerText =
                axe.items.name;
        }

        if (axeBonus) {
            axeBonus.innerText =
                axe.items.description;
        }

        if (chopButton) {
            chopButton.disabled = false;
            chopButton.innerText =
                "🪓 Chop Birch";
        }

    }


    /* =====================================
       UPDATE DURABILITY BAR
    ===================================== */

    if (durabilityFill) {

        durabilityFill.style.width =
            durabilityPercent + "%";

        durabilityFill.classList.remove(
            "durability-green",
            "durability-orange",
            "durability-red"
        );

        if (durabilityPercent > 50) {

            durabilityFill.classList.add(
                "durability-green"
            );

        } else if (durabilityPercent > 25) {

            durabilityFill.classList.add(
                "durability-orange"
            );

        } else {

            durabilityFill.classList.add(
                "durability-red"
            );

        }

    }

}


/* =====================================
   BUTTON EVENT
===================================== */

if (chopButton) {

    chopButton.addEventListener(
        "click",
        chopBirchTree
    );

}


/* =====================================
   START FOREST PAGE
===================================== */



/* WILD BEE ENCOUNTER - after tutorial only */
async function maybeTriggerWildBeeEncounter(){
 const {data:{user}}=await supabaseClient.auth.getUser(); if(!user)return;
 const {data:p}=await supabaseClient.from('players').select('tutorial_complete').eq('id',user.id).single();
 if(!p?.tutorial_complete||Math.random()>=WILD_BEE_CHANCE)return;
 showWildBeeEncounter();
}
function showWildBeeEncounter(){
 let box=document.getElementById('wild-bee-modal'); if(!box){box=document.createElement('div');box.id='wild-bee-modal';box.className='game-modal';document.body.appendChild(box);}
 box.innerHTML=`<div class="modal-card"><h2>🐝 A Wild Colony!</h2><p>You hear a furious buzzing inside the tree.</p><button onclick="collectWildQueen()">👑 Collect the Queen</button><button onclick="ignoreWildBees()">🪓 Keep Chopping</button><button onclick="closeWildBeeEncounter()">🚶 Walk Away</button></div>`;
}
function closeWildBeeEncounter(){document.getElementById('wild-bee-modal')?.remove();}
async function collectWildQueen(){
 const {data:{user}}=await supabaseClient.auth.getUser(); const {data:items}=await supabaseClient.from('items').select('id,name').in('name',[ITEM_NAMES.QUEEN_BEE,ITEM_NAMES.BEE_SUIT,ITEM_NAMES.SMOKER]);
 const queen=items?.find(x=>x.name===ITEM_NAMES.QUEEN_BEE); if(!queen)return;
 const {data:owned}=await supabaseClient.from('inventory').select('item_id,quantity').eq('player_id',user.id).in('item_id',(items||[]).map(x=>x.id));
 const hasSuit=owned?.some(x=>x.item_id===items.find(i=>i.name===ITEM_NAMES.BEE_SUIT)?.id), hasSmoker=owned?.some(x=>x.item_id===items.find(i=>i.name===ITEM_NAMES.SMOKER)?.id);
 const successChance = hasSuit && hasSmoker ? 0.95 : hasSmoker ? 0.75 : hasSuit ? 0.60 : 0.35;
 if(Math.random()<=successChance){const {data:row}=await supabaseClient.from('inventory').select('*').eq('player_id',user.id).eq('item_id',queen.id).maybeSingle(); if(row)await supabaseClient.from('inventory').update({quantity:row.quantity+1}).eq('id',row.id);else await supabaseClient.from('inventory').insert({player_id:user.id,item_id:queen.id,quantity:1});showForestMessage('👑 You capture the Queen Bee! Return to your Bee Yard and install her in an empty hive.');}
 else {await supabaseClient.rpc('damage_player_health',{p_player_id:user.id,p_damage:20});showForestMessage('🐝 The swarm drives you away. You lose 20 health. A Bee Suit and Smoker would help.');}
 closeWildBeeEncounter(); if(typeof loadHomePage==='function')loadHomePage();
}
async function ignoreWildBees(){const {data:{user}}=await supabaseClient.auth.getUser();if(Math.random()<.7){await supabaseClient.from('players').update({health:0,hospital_until:new Date(Date.now()+30*60000).toISOString()}).eq('id',user.id);showForestMessage('🏥 The swarm overwhelms you. You wake in hospital.');}else showForestMessage('🐝 You somehow escape the angry swarm.');closeWildBeeEncounter();if(typeof loadHomePage==='function')loadHomePage();}


/* OAK WOODCUTTING - unlocked after tutorial */
const oakButton = document.getElementById("chop-oak");

function setOakMessage(message, addToHistory = false) {
    const oakLog = document.getElementById("oak-log");
    if (oakLog) oakLog.innerHTML = message;

    if (addToHistory) {
        const forestLog = document.getElementById("forest-log");
        let history = JSON.parse(localStorage.getItem("forestHistory")) || [];
        history.unshift(message);
        history = history.slice(0, 5);
        localStorage.setItem("forestHistory", JSON.stringify(history));
        if (forestLog) forestLog.innerHTML = history.join("<hr>");
    }
}

async function loadOakTree() {
    const oakCard = document.getElementById("oak-card");

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;

        const { data: player, error } = await supabaseClient
            .from("players")
            .select("oak_unlocked")
            .eq("id", user.id)
            .single();

        if (error) throw error;

        oakCard?.classList.remove("oak-loading");

        if (player?.oak_unlocked && oakButton) {
            oakCard?.classList.remove("locked");
            const image = document.getElementById("oak-image");
            if (image) image.innerHTML = "🌳";
            oakButton.disabled = false;
            oakButton.innerText = "🪓 Chop Oak";
            setOakMessage("Ready to chop Oak.");
        } else {
            oakCard?.classList.add("locked");
        }
    } catch (error) {
        console.error("Oak access failed to load:", error);
        oakCard?.classList.remove("oak-loading");
        oakCard?.classList.add("locked");
        setOakMessage("❌ Oak access failed to load.");
    }
}

async function chopOakTree() {
    if (!oakButton || oakButton.disabled) return;
    oakButton.disabled = true;

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;

        const { data: player, error: playerError } = await supabaseClient
            .from("players")
            .select("energy, oak_unlocked")
            .eq("id", user.id)
            .single();

        if (playerError || !player) throw playerError || new Error("Player failed to load.");
        if (!player.oak_unlocked) {
            setOakMessage("🔒 Oak is still locked.");
            return;
        }
        if (Number(player.energy) < 10) {
            setOakMessage("⚡ You need 10 energy to chop Oak.", true);
            return;
        }

        const { data: axe, error: axeError } = await supabaseClient
            .from("equipment")
            .select("id, durability, max_durability")
            .eq("player_id", user.id)
            .eq("slot", "axe")
            .eq("is_equipped", true)
            .maybeSingle();

        if (axeError) throw axeError;
        if (!axe) {
            setOakMessage("❌ Equip an Iron Axe or better before chopping Oak.", true);
            return;
        }
        if (Number(axe.durability) <= 0) {
            setOakMessage("💀 Your axe is broken. Visit the Blacksmith.", true);
            return;
        }

        const item = await getItemByName(ITEM_NAMES.OAK_LOG);
        if (!item) throw new Error("Oak Log item is missing from the database.");

        const amount = Math.floor(Math.random() * 6) + 3;
        let sentToCart = false;
        if (typeof addResourceToCartOrInventory === "function") {
            sentToCart = await addResourceToCartOrInventory(user.id, item.id, amount);
        }
        if (!sentToCart) await addInventoryById(user.id, item.id, amount);

        const newEnergy = Number(player.energy) - 10;
        const newDurability = Math.max(0, Number(axe.durability) - 1);

        const [{ error: energyError }, { error: durabilityError }] = await Promise.all([
            supabaseClient.from("players").update({
                energy: newEnergy,
                last_action: new Date().toISOString()
            }).eq("id", user.id),
            supabaseClient.from("equipment").update({
                durability: newDurability
            }).eq("id", axe.id)
        ]);

        if (energyError) throw energyError;
        if (durabilityError) throw durabilityError;

        /* Oak now awards both Woodcutting XP and Player XP.
           Dedicated Oak constants are used when available; otherwise Oak
           safely falls back to twice the Birch reward. */
        try {
            const oakWoodcuttingXP =
                typeof WOODCUTTING_XP_PER_OAK !== "undefined"
                    ? WOODCUTTING_XP_PER_OAK
                    : (
                        typeof WOODCUTTING_XP_PER_BIRCH !== "undefined"
                            ? WOODCUTTING_XP_PER_BIRCH * 2
                            : 2
                    );

            const oakPlayerXP =
                typeof PLAYER_XP_PER_OAK !== "undefined"
                    ? PLAYER_XP_PER_OAK
                    : (
                        typeof PLAYER_XP_PER_BIRCH !== "undefined"
                            ? PLAYER_XP_PER_BIRCH * 2
                            : 2
                    );

            if (typeof addWoodcuttingXP === "function") {
                await addWoodcuttingXP(oakWoodcuttingXP);
            }

            if (typeof addPlayerXP === "function") {
                await addPlayerXP(oakPlayerXP);
            }
        } catch (xpError) {
            console.error("Oak XP failed:", xpError);
        }

        const brokenText = newDurability === 0
            ? "<br>💀 Your axe has broken."
            : `<br>🪓 Axe durability: <strong>${newDurability}/${Number(axe.max_durability || 0)}</strong>.`;

        // Show the result before any optional reputation work can delay the UI.
        setOakMessage(
            `🌳 You spend <strong>10 energy</strong> and gather <strong>${amount} Oak Logs</strong>. ` +
            `${sentToCart ? "Loaded into your cart." : "Placed in your inventory."}${brokenText}`,
            true
        );

        // Change the visible number instantly, then reload the authoritative values.
        const energyElement = document.getElementById("energy");
        if (energyElement) {
            energyElement.textContent = `${newEnergy} / 100`;
        }

        await Promise.all([
            typeof updateTopBarPlayer === "function" ? updateTopBarPlayer() : Promise.resolve(),
            typeof loadToolBeltAxe === "function" ? loadToolBeltAxe() : Promise.resolve(),
            typeof loadCartCard === "function" ? loadCartCard() : Promise.resolve()
        ]);

        // Reputation must not prevent the successful chop message from appearing.
        if (typeof addVillageReputation === "function") {
            try {
                await addVillageReputation(amount * 2);
            } catch (reputationError) {
                console.error("Oak reputation failed:", reputationError);
            }
        }
    } catch (error) {
        console.error("Oak chopping failed:", error);
        setOakMessage(`❌ Oak chopping failed: ${error.message}`, true);
    } finally {
        if (oakButton) oakButton.disabled = false;
    }
}

oakButton?.addEventListener("click", chopOakTree);

/* Load all player-dependent forest data before showing the page. */
async function initialiseForestPage() {
    try {
        loadSavedForestHistory();

        await Promise.all([
            loadToolBeltAxe(),
            loadOakTree()
        ]);
    } catch (error) {
        console.error("Forest failed to initialise:", error);
    } finally {
        document.body.classList.remove("forest-data-loading");
        document.getElementById("forest-loading-screen")?.remove();
    }
}

initialiseForestPage();

