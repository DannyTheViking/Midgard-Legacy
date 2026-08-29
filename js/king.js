/* =====================================
    MIDGARD LEGACY

    File:
    king.js

    Purpose:
    Starts and completes the tutorial.
===================================== */


/* =====================================
   LOAD KING DIALOGUE
===================================== */

async function loadKingDialogue() {

    const progress =
        await getTutorialProgress();

    if (!progress) return;

    const dialogue =
        document.getElementById("king-dialogue");

    const actions =
        document.getElementById("king-actions");

    actions.innerHTML = "";

    if (progress.tutorial_complete) {

        dialogue.innerHTML = `
            <p>
                The King nods as you enter.
            </p>

            <p>
                <strong>
                    "You are a free man now. Build your legacy."
                </strong>
            </p>

            <p>
                King's Tax:
                <span class="green">1%</span>
            </p>
        `;

        return;
    }

    if (
        progress.tutorial_step ===
        TUTORIAL_STEPS.ASK_FOR_FREEDOM
    ) {

        dialogue.innerHTML = `
            <p>
                You kneel before the King.
            </p>

            <p>
                After years of service as a thrall,
                you finally gather the courage to speak.
            </p>

            <p>
                <strong>
                    "My King, I ask for my freedom."
                </strong>
            </p>
        `;

        actions.innerHTML = `
            <button id="ask-freedom-button">
                Speak to the King
            </button>
        `;

        document
            .getElementById("ask-freedom-button")
            .addEventListener(
                "click",
                askForFreedom
            );

        return;
    }

    if (
        progress.tutorial_step <
        TUTORIAL_STEPS.RETURN_TO_KING
    ) {

        dialogue.innerHTML = `
            <p>
                The King watches you approach.
            </p>

            <p>
                <strong>
                    "Do not return until you have brewed
                    me a barrel of mead with your own hands."
                </strong>
            </p>
        `;

        return;
    }

    if (
        progress.tutorial_step ===
        TUTORIAL_STEPS.RETURN_TO_KING
    ) {

        dialogue.innerHTML = `
            <p>
                You place your Birch Mead before the King.
            </p>

            <p>
                The hall falls silent as he tastes it.
            </p>
        `;

        actions.innerHTML = `
            <button id="present-mead-button">
                🍺 Present Mead
            </button>
        `;

        document
            .getElementById("present-mead-button")
            .addEventListener(
                "click",
                presentMead
            );
    }

}


/* =====================================
   ASK FOR FREEDOM
===================================== */

async function askForFreedom() {

    const dialogue =
        document.getElementById("king-dialogue");

    const actions =
        document.getElementById("king-actions");

    dialogue.innerHTML = `
        <p>
            The King bursts into laughter.
        </p>

        <p>
            <strong>
                "Freedom? And what has a thrall done
                to deserve such a gift?"
            </strong>
        </p>

        <p>
            He leans forward on his throne.
        </p>

        <p>
            <strong>
                "Bring me a barrel of mead worthy of a King."
            </strong>
        </p>

        <p>
            <strong>
                "You will gather every log, mine every piece
                of ore, forge every hoop, build the barrel,
                raise the bees, collect the honey and draw
                the water yourself."
            </strong>
        </p>

        <p>
            <strong>
                "If you wish to be free, earn it."
            </strong>
        </p>
    `;

    actions.innerHTML = `
        <button id="accept-challenge-button">
            ⚔️ Accept the King's Challenge
        </button>
    `;

    document
        .getElementById("accept-challenge-button")
        .addEventListener(
            "click",
            acceptKingsChallenge
        );
}


/* =====================================
   ACCEPT CHALLENGE
===================================== */

async function acceptKingsChallenge() {

    /*
        The King owns the first tutorial tool grant.
        This RPC advances the tutorial and gives the temporary Rusty Axe
        in one server-side transaction so a new player cannot skip the grant.
    */
    const { data, error } = await supabaseClient.rpc(
        "accept_kings_tutorial_challenge"
    );

    if (error) {
        console.error("King challenge failed:", error);
        return;
    }

    const advanced = Boolean(data?.advanced);
    if (!advanced) return;

    if (typeof window.refreshTutorialAfterAction === "function") {
        await window.refreshTutorialAfterAction();
    } else {
        await refreshTutorialUI();
    }

   showTutorialNotice(
    TUTORIAL_STEPS.CHOP_BIRCH
);

document.getElementById("king-dialogue").innerHTML = `
    <p>
        The King leans back on his throne.
    </p>

    <p>
        <strong>
            "Your first task is simple."
        </strong>
    </p>

    <p>
        <strong>
            "Take this Rusty Axe. It will not last forever, but it will get you started."
        </strong>
    </p>

    <p>
        The King hands you a battered Rusty Axe. When it breaks, have it repaired and continue your work.
    </p>

    <p>
        Your first task is to gather Birch. Use the navigation menu to open:
    </p>

    <p class="green">
        Gathering → Trees → Birch Tree
    </p>
`;

document.getElementById("king-actions").innerHTML = `
    <button onclick="window.location.href='home.html'">
        🏠 Return Home
    </button>
`;
}


/* =====================================
   PRESENT MEAD
===================================== */

async function presentMead() {
    const button = document.getElementById("present-mead-button");
    const message = document.getElementById("king-message");

    if (button) button.disabled = true;
    if (message) message.textContent = "Presenting your mead to the King...";

    const { data, error } = await supabaseClient.rpc(
        "complete_tutorial_with_royal_tools"
    );

    if (error) {
        if (message) message.textContent = `❌ ${error.message}`;
        if (button) button.disabled = false;
        return;
    }

    if (typeof logGameActivity === "function") {
        await logGameActivity("freeman_unlocked", {});
    }

    document.getElementById("king-dialogue").innerHTML = `
        <p>The King drinks from the Birch Mead.</p>
        <p>The hall waits in silence.</p>
        <p>He finally nods.</p>
        <p><strong>"You have kept your word. From this day forward, you are a free man."</strong></p>
        <p>A royal guard places a permanent Iron Axe before you.</p>
        <p><strong>"This woodcutting axe is yours for life. Keep it repaired and it will serve you well."</strong></p>
        <p>The King points beyond the village.</p>
        <p><strong>"The old shack and the land around it are yours."</strong></p>
        <p>He gestures to the royal handcart you borrowed for the challenge.</p>
        <p><strong>"My men will take my cart back. Anything of yours still inside it will be delivered to the Storage Yard at your new property."</strong></p>
        <p>The Young Mead was made for the King, so the royal barrel and its mead remain with him.</p>
        <p class="green">
            Property Unlocked<br>
            Oak Wood and Oak Barrels Unlocked<br>
            Personal Bee Yard Unlocked<br>
            +100 Village Reputation<br>
            Iron Axe — 100/100 durability<br>
            King's Tax: 1%
        </p>
    `;

    document.getElementById("king-actions").innerHTML = `
        <button onclick="window.location.href='property.html'">
            🏡 Visit Your Land
        </button>
    `;

    clearTutorialHighlights();
    removeTutorialGuide();
    if (typeof updateNotificationBell === "function") {
        await updateNotificationBell();
    }
}



async function grantFreedomRewards(playerId) {
    const { data: rewards } = await supabaseClient.from('items').select('id,name').in('name',['Iron Axe']);
    for (const item of rewards || []) {
        const slot = 'axe';
        const { data: existing } = await supabaseClient.from('equipment').select('id').eq('player_id',playerId).eq('slot',slot).maybeSingle();
        const payload={item_id:item.id,durability:30,max_durability:100,is_equipped:true};
        if(existing) await supabaseClient.from('equipment').update(payload).eq('id',existing.id);
        else await supabaseClient.from('equipment').insert({player_id:playerId,slot,...payload});
    }
}

async function giveTutorialTool(
    playerId,
    itemName,
    slot
) {

    const { data: item, error: itemError } =
        await supabaseClient
            .from("items")
            .select("id")
            .eq("name", itemName)
            .single();

    if (itemError || !item) {
        console.error(
            `${itemName} could not be found:`,
            itemError
        );
        return false;
    }

    /*
        Remove equipped status from the old tool
        in this slot.
    */

    await supabaseClient
        .from("equipment")
        .update({
            is_equipped: false
        })
        .eq("player_id", playerId)
        .eq("slot", slot);

    /*
        Look for an existing equipment row.
    */

    const {
        data: existingTool,
        error: existingError
    } = await supabaseClient
        .from("equipment")
        .select("id")
        .eq("player_id", playerId)
        .eq("item_id", item.id)
        .maybeSingle();

    if (existingError) {
        console.error(existingError);
        return false;
    }

    if (existingTool) {

        const { error } =
            await supabaseClient
                .from("equipment")
                .update({
                    slot: slot,
                    durability: 30,
                    max_durability: 100,
                    is_equipped: true
                })
                .eq("id", existingTool.id);

        return !error;

    }

    const { error: insertError } =
        await supabaseClient
            .from("equipment")
            .insert({
                player_id: playerId,
                item_id: item.id,
                slot: slot,
                durability: 30,
                max_durability: 100,
                is_equipped: true
            });

    if (insertError) {
        console.error(
            `${itemName} reward failed:`,
            insertError
        );
        return false;
    }

    return true;
}

/* =====================================
   START PAGE
===================================== */

loadKingDialogue();