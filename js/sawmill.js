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

    // Birch tutorial materials can be in the Backpack, the King's
    // Handcart, or the Storage Yard. Read the same shared total that
    // Supabase uses when crafting.
    const [birchLogsResult, birchPlanksResult] = await Promise.all([
        supabaseClient.rpc("get_my_shared_item_quantity", {
            p_name: "Birch Log"
        }),
        supabaseClient.rpc("get_my_shared_item_quantity", {
            p_name: "Birch Plank"
        })
    ]);

    if (birchLogsResult.error) {
        console.error("Could not load shared Birch Logs:", birchLogsResult.error);
    }

    if (birchPlanksResult.error) {
        console.error("Could not load shared Birch Planks:", birchPlanksResult.error);
    }

    const birchLogs = Number(birchLogsResult.data || 0);
    const birchPlanks = Number(birchPlanksResult.data || 0);

    // Oak remains post-tutorial content and keeps the existing stock path.
    const quantities =
        await getPlayerInventoryQuantities(
            user.id,
            [
                oakLogId,
                oakPlankId
            ]
        );

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
        // One server-side transaction handles shared resources, output,
        // statistics and tutorial progress. This prevents the Sawmill from
        // disagreeing with the King's Handcart totals.
        const { data, error } = await supabaseClient.rpc(
            "saw_birch_logs",
            { p_logs: logsNeeded }
        );

        if (error) {
            throw error;
        }

        const actualLogsUsed = Number(data?.logs_used || logsNeeded);
        const actualPlanksMade = Number(data?.planks_made || planksMade);
        const tutorialResult = data?.tutorial || null;

        let message = `
            🪚 You cut
            <strong>${actualLogsUsed} Birch Log${actualLogsUsed === 1 ? "" : "s"}</strong>
            into
            <strong>${actualPlanksMade} Birch Planks</strong>.
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

        /*
           The Sawmill RPC can advance the tutorial from MAKE_PLANKS to
           GATHER_BOG_IRON. Refresh the global tutorial manager immediately
           after the server transaction so the old "Saw Birch Planks" popup
           is replaced by the next objective without requiring a page change
           or manual refresh.
        */
        if (typeof refreshTutorialUI === "function") {
            await refreshTutorialUI();
        }

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


async function prepareTutorialBirchAmount() {
    const amountInput = document.getElementById("birch-saw-amount");
    if (!amountInput) return;

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const { data: player, error } = await supabaseClient
        .from("players")
        .select("tutorial_step, tutorial_complete, tutorial_progress")
        .eq("id", user.id)
        .single();

    if (error || !player || player.tutorial_complete) return;

    if (Number(player.tutorial_step) === Number(TUTORIAL_STEPS.MAKE_PLANKS)) {
        const current = Number(player.tutorial_progress?.birch_planks || 0);
        const remainingPlanks = Math.max(
            0,
            Number(TUTORIAL_TARGETS.birch_planks) - current
        );
        const logsRequired = Math.max(
            1,
            Math.ceil(remainingPlanks / PLANKS_CREATED)
        );

        amountInput.value = logsRequired;

        showSawmillMessage(
            `📜 Tutorial: saw <strong>${logsRequired} Birch Logs</strong> to make the remaining <strong>${remainingPlanks} Birch Planks</strong>. Materials can come from your Backpack, King's Handcart or Storage Yard.`
        );
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
    loadSawmillCardStock(),
    prepareTutorialBirchAmount()
]);
