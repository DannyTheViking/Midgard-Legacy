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

const craftBirchBeamButton =
    document.getElementById("craft-birch-beam-button");

const craftOakBeamButton =
    document.getElementById("craft-oak-beam-button");

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

async function resolveBeamItemIds() {
    const [birchBeam, oakBeam] = await Promise.all([
        getItemByName("Birch Beam"),
        getItemByName("Oak Beam")
    ]);

    return {
        birchBeamId: birchBeam?.id || null,
        oakBeamId: oakBeam?.id || null
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

    const {
        birchBeamId,
        oakBeamId
    } = await resolveBeamItemIds();

    const quantities =
        await getPlayerInventoryQuantities(
            user.id,
            [
                BIRCH_LOG,
                BIRCH_PLANK,
                birchBeamId,
                oakLogId,
                oakPlankId,
                oakBeamId
            ]
        );

    const birchLogs =
        quantities[BIRCH_LOG] || 0;

    const birchPlanks =
        quantities[BIRCH_PLANK] || 0;

    setCraftingStock(
        "birch-plank-stock",
        [
            {
                name: "Birch Logs",
                quantity: birchLogs
            }
        ],
        "Birch Planks",
        Math.floor(
            birchLogs / LOGS_REQUIRED
        ) * PLANKS_CREATED
    );

    setCraftingStock(
        "birch-beam-stock",
        [
            {
                name: "Birch Logs",
                quantity: birchLogs
            }
        ],
        "Birch Beams",
        birchLogs
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
        [
            {
                name: "Oak Logs",
                quantity: oakLogs
            }
        ],
        "Oak Planks",
        Math.floor(
            oakLogs / LOGS_REQUIRED
        ) * PLANKS_CREATED
    );

    setCraftingStock(
        "oak-beam-stock",
        [
            {
                name: "Oak Logs",
                quantity: oakLogs
            }
        ],
        "Oak Beams",
        oakLogs
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

        document
            .getElementById("oak-beam-card")
            ?.classList.remove("locked");

        if (craftOakBeamButton) {
            craftOakBeamButton.disabled = false;
            craftOakBeamButton.innerText = "🪚 Craft";
        }

        const oakBeamAmount =
            document.getElementById("oak-beam-amount");

        if (oakBeamAmount) {
            oakBeamAmount.disabled = false;
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

async function craftBeam(logName, beamName, amountInputId, messageId) {
    const { data: { user } } =
        await supabaseClient.auth.getUser();

    if (!user) return;

    const amount =
        getPositiveCraftAmount(amountInputId);

    const [logItem, beamItem] = await Promise.all([
        getItemByName(logName),
        getItemByName(beamName)
    ]);

    if (!logItem?.id || !beamItem?.id) {
        throw new Error(`${beamName} is not configured in the items table.`);
    }

    const quantities =
        await getPlayerInventoryQuantities(
            user.id,
            [logItem.id]
        );

    const logsOwned =
        Number(quantities[logItem.id] || 0);

    if (logsOwned < amount) {
        const message = document.getElementById(messageId);
        if (message) {
            message.innerText =
                `❌ You need ${amount} ${logName}${amount === 1 ? "" : "s"}.`;
        }
        return;
    }

    await changeInventoryQuantity(
        user.id,
        logItem.id,
        -amount
    );

    await changeInventoryQuantity(
        user.id,
        beamItem.id,
        amount
    );

    if (typeof recordCraftingStatistics === "function") {
        await recordCraftingStatistics({
            itemsCrafted: amount
        });
    }

    const message = document.getElementById(messageId);
    if (message) {
        message.innerHTML =
            `🪚 You cut <strong>${amount} ${logName}${amount === 1 ? "" : "s"}</strong> into <strong>${amount} ${beamName}${amount === 1 ? "" : "s"}</strong>.`;
    }

    await loadSawmillCardStock();
    loadHomePage();
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

craftBirchBeamButton?.addEventListener(
    "click",
    () => craftBeam(
        "Birch Log",
        "Birch Beam",
        "birch-beam-amount",
        "birch-beam-message"
    ).catch(error => {
        const message = document.getElementById("birch-beam-message");
        if (message) message.innerText = `❌ ${error.message}`;
    })
);

craftOakBeamButton?.addEventListener(
    "click",
    () => craftBeam(
        "Oak Log",
        "Oak Beam",
        "oak-beam-amount",
        "oak-beam-message"
    ).catch(error => {
        const message = document.getElementById("oak-beam-message");
        if (message) message.innerText = `❌ ${error.message}`;
    })
);

document
    .getElementById("birch-beam-amount")
    ?.addEventListener(
        "input",
        loadSawmillCardStock
    );

document
    .getElementById("oak-beam-amount")
    ?.addEventListener(
        "input",
        loadSawmillCardStock
    );

Promise.all([
    loadOakSawmill(),
    loadSawmillCardStock()
]);
