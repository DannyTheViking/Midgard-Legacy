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

    const advanced =
        await advanceTutorial(
            TUTORIAL_STEPS.ASK_FOR_FREEDOM,
            TUTORIAL_STEPS.CHOP_BIRCH
        );

    if (!advanced) return;

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
            "Go into the Wilderness and chop Birch."
        </strong>
    </p>

    <p>
        Use the navigation menu to open:
    </p>

    <p class="green">
        Wilderness → Forest
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

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) return;

    const { data: meadItem, error: meadError } =
        await supabaseClient
            .from("inventory")
            .select("*")
            .eq("player_id", user.id)
            .eq("item_id", YOUNG_MEAD)
            .maybeSingle();

    if (meadError || !meadItem || meadItem.quantity < 1) {

        document.getElementById("king-message").innerHTML =
            "❌ You do not have the Mead.";

        return;
    }

    const newQuantity =
        meadItem.quantity - 1;

    if (newQuantity > 0) {

        await supabaseClient
            .from("inventory")
            .update({
                quantity: newQuantity
            })
            .eq("id", meadItem.id);

    } else {

        await supabaseClient
            .from("inventory")
            .delete()
            .eq("id", meadItem.id);

    }

    const completed =
        await completeTutorial();

    if (!completed) return;

    await grantFreedomRewards(user.id);
    if (typeof logGameActivity === "function") {
        await logGameActivity("freeman_unlocked", {});
    }

    if (typeof createPlayerNotification === "function") {
        await createPlayerNotification({
            type: "achievement",
            title: "You Are a Freeman!",
            message:
                "Congratulations. The King has released you from thralldom. Your saga truly begins now.",
            icon: "🏠",
            link: "home.html",
            uniqueKey: "freeman"
        });
    }

    document.getElementById("king-dialogue").innerHTML = `
        <p>
            The King drinks from the Birch Mead.
        </p>

        <p>
            The hall waits in silence.
        </p>

        <p>
            He finally nods.
        </p>

        <p>
            <strong>
                "You have kept your word."
            </strong>
        </p>

        <p>
            <strong>
                "From this day forward, you are a free man."
            </strong>
        </p>

        <p>
            He taps the side of the Birch Barrel.
        </p>

        <p>
            <strong>
                "The mead is good, but Birch is a beginner's wood."
            </strong>
        </p>

        <p>
            <strong>
                "From now on, brew only in Oak."
            </strong>
        </p>

        <p>
            The King points beyond the village.
        </p>

        <p>
            <strong>
                "The old shack and the land around it are yours."
            </strong>
        </p>

        <p>
            <strong>
                "Like every free man, you shall return
                one part in one hundred of your earnings
                to the Crown."
            </strong>
        </p>

        <p class="green">
            Property Unlocked<br>Oak Wood and Oak Barrels Unlocked<br>Personal Bee Yard Unlocked<br>+100 Village Reputation<br>Iron Axe (30%)<br>Iron Pickaxe (30%)<br>King's Tax: 1%
        </p>
    `;

    document.getElementById("king-actions").innerHTML = `
        <button onclick="window.location.href='property.html'">
            🏡 Visit Your Land
        </button>
    `;

    loadHomePage();
}



async function grantFreedomRewards(playerId) {
    const { data: rewards } = await supabaseClient.from('items').select('id,name').in('name',['Iron Axe','Iron Pickaxe']);
    for (const item of rewards || []) {
        const slot = item.name === 'Iron Pickaxe' ? 'pickaxe' : 'axe';
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