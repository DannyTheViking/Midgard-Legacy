/* =====================================
   MIDGARD LEGACY - SAWMILL
   Bulk sawing and live stock cards.
===================================== */

const LOGS_REQUIRED = 1;
const PLANKS_CREATED = 2;

const sawBirchButton =
    document.getElementById("saw-birch-button");

const sawOakButton =
    document.getElementById("saw-oak-button");

function showSawmillMessage(message) {
    const element =
        document.getElementById("sawmill-message");

    if (element) element.innerHTML = message;
}

async function resolveOakItemIds() {
    const [log, plank] = await Promise.all([
        getItemByName(ITEM_NAMES.OAK_LOG),
        getItemByName(ITEM_NAMES.OAK_PLANK)
    ]);

    return {
        oakLogId: log?.id || null,
        oakPlankId: plank?.id || null
    };
}

async function loadSawmillCardStock() {
    const { data: { user } } =
        await supabaseClient.auth.getUser();

    if (!user) return;

    const {
        oakLogId,
        oakPlankId
    } = await resolveOakItemIds();

    const quantities =
        await getPlayerInventoryQuantities(
            user.id,
            [
                BIRCH_LOG,
                BIRCH_PLANK,
                oakLogId,
                oakPlankId
            ]
        );

    const birchLogs =
        quantities[BIRCH_LOG] || 0;

    const birchPlanks =
        quantities[BIRCH_PLANK] || 0;

    setCraftingStock(
        "birch-plank-stock",
        birchLogs,
        Math.floor(birchLogs / LOGS_REQUIRED),
        birchPlanks
    );

    const oakLogs =
        oakLogId
            ? quantities[oakLogId] || 0
            : 0;

    const oakPlanks =
        oakPlankId
            ? quantities[oakPlankId] || 0
            : 0;

    setCraftingStock(
        "oak-plank-stock",
        oakLogs,
        Math.floor(oakLogs / LOGS_REQUIRED),
        oakPlanks
    );
}

async function sawBirchLog() {
    const { data: { user } } =
        await supabaseClient.auth.getUser();

    if (!user) return;

    const amount =
        getPositiveCraftAmount(
            "birch-saw-amount"
        );

    const logsNeeded =
        amount * LOGS_REQUIRED;

    const planksMade =
        amount * PLANKS_CREATED;

    try {
        const quantities =
            await getPlayerInventoryQuantities(
                user.id,
                [BIRCH_LOG]
            );

        if (
            Number(quantities[BIRCH_LOG] || 0) <
            logsNeeded
        ) {
            showSawmillMessage(
                `❌ You need ${logsNeeded} Birch Log${logsNeeded === 1 ? "" : "s"}.`
            );
            return;
        }

        await changeInventoryQuantity(
            user.id,
            BIRCH_LOG,
            -logsNeeded
        );

        await changeInventoryQuantity(
            user.id,
            BIRCH_PLANK,
            planksMade
        );

        if (
            typeof recordCraftingStatistics ===
            "function"
        ) {
            await recordCraftingStatistics({
                itemsCrafted: planksMade,
                planksSawn: planksMade
            });
        }

        const tutorialResult =
            await addTutorialProgress(
                "birch_planks",
                planksMade,
                TUTORIAL_STEPS.MAKE_PLANKS,
                TUTORIAL_STEPS.GATHER_BOG_IRON,
                TUTORIAL_TARGETS.birch_planks
            );

        let message = `
            🪚 You cut
            <strong>${logsNeeded} Birch Log${logsNeeded === 1 ? "" : "s"}</strong>
            into
            <strong>${planksMade} Birch Planks</strong>.
        `;

        if (tutorialResult?.completed) {
            message += `
                <br><br>
                ✅ You have enough Birch Planks.
                Travel to the mine and gather Bog Iron.
            `;
        }

        showSawmillMessage(message);

        await loadSawmillCardStock();
        loadHomePage();
    } catch (error) {
        showSawmillMessage(
            "❌ Sawmill failed: " +
            error.message
        );
    }
}

async function loadOakSawmill() {
    const { data: { user } } =
        await supabaseClient.auth.getUser();

    if (!user) return;

    const { data: player } =
        await supabaseClient
            .from("players")
            .select("oak_unlocked")
            .eq("id", user.id)
            .single();

    const amountInput =
        document.getElementById(
            "oak-saw-amount"
        );

    if (
        player?.oak_unlocked &&
        sawOakButton
    ) {
        document
            .getElementById("oak-sawmill-card")
            ?.classList.remove("locked");

        sawOakButton.disabled = false;
        sawOakButton.innerText =
            "🪚 Craft";

        if (amountInput) {
            amountInput.disabled = false;
        }
    }
}

async function sawOakLog() {
    const { data: { user } } =
        await supabaseClient.auth.getUser();

    if (!user) return;

    const amount =
        getPositiveCraftAmount(
            "oak-saw-amount"
        );

    const logsNeeded = amount;
    const planksMade =
        amount * PLANKS_CREATED;

    const {
        oakLogId,
        oakPlankId
    } = await resolveOakItemIds();

    if (!oakLogId || !oakPlankId) {
        document
            .getElementById(
                "oak-sawmill-message"
            )
            .innerText =
                "❌ Oak items are not configured.";
        return;
    }

    try {
        const quantities =
            await getPlayerInventoryQuantities(
                user.id,
                [oakLogId]
            );

        if (
            Number(quantities[oakLogId] || 0) <
            logsNeeded
        ) {
            document
                .getElementById(
                    "oak-sawmill-message"
                )
                .innerText =
                    `❌ You need ${logsNeeded} Oak Log${logsNeeded === 1 ? "" : "s"}.`;
            return;
        }

        await changeInventoryQuantity(
            user.id,
            oakLogId,
            -logsNeeded
        );

        await changeInventoryQuantity(
            user.id,
            oakPlankId,
            planksMade
        );

        await addVillageReputation(
            planksMade
        );

        if (
            typeof recordCraftingStatistics ===
            "function"
        ) {
            await recordCraftingStatistics({
                itemsCrafted: planksMade,
                planksSawn: planksMade
            });
        }

        document
            .getElementById(
                "oak-sawmill-message"
            )
            .innerHTML =
                `🪚 You cut <strong>${logsNeeded} Oak Log${logsNeeded === 1 ? "" : "s"}</strong> into <strong>${planksMade} Oak Planks</strong>.`;

        await loadSawmillCardStock();
        loadHomePage();
    } catch (error) {
        document
            .getElementById(
                "oak-sawmill-message"
            )
            .innerText =
                "❌ Sawmill failed: " +
                error.message;
    }
}

sawBirchButton?.addEventListener(
    "click",
    sawBirchLog
);

sawOakButton?.addEventListener(
    "click",
    sawOakLog
);

document
    .getElementById("birch-saw-amount")
    ?.addEventListener(
        "input",
        loadSawmillCardStock
    );

document
    .getElementById("oak-saw-amount")
    ?.addEventListener(
        "input",
        loadSawmillCardStock
    );

Promise.all([
    loadOakSawmill(),
    loadSawmillCardStock()
]);
