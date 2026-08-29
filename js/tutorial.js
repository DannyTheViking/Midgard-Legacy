/* =====================================
    MIDGARD LEGACY - TUTORIAL MANAGER
===================================== */

const TUTORIAL_STEPS = Object.freeze({
    ASK_FOR_FREEDOM: 0,
    CHOP_BIRCH: 1,
    MAKE_PLANKS: 2,
    GATHER_BOG_IRON: 3,
    FORGE_IRON_BARS: 4,
    FORGE_IRON_HOOPS: 5,
    FORGE_IRON_NAILS: 6, // retired tutorial step; repaired to CRAFT_BUCKET
    CRAFT_BUCKET: 7,
    CRAFT_BARREL_PARTS: 8,
    CRAFT_BIRCH_BARREL: 9,
    VISIT_VILLAGE_APIARY: 10,
    BUILD_BEEHIVE: 10, // backwards-compatible alias
    COLLECT_HONEY: 11,
    FILL_WATER_BUCKET: 12,
    BREW_YOUNG_MEAD: 13,
    RETURN_TO_KING: 14,
    COMPLETE: 15
});

const TUTORIAL_TARGETS = Object.freeze({
    birch_logs: 23,
    birch_planks: 46,
    bog_iron: 30,
    iron_bars: 6,
    iron_hoops: 12,
    iron_nails: 0,
    empty_buckets: 2,
    barrel_staves: 30,
    barrel_lids: 1,
    empty_barrels: 1,
    village_apiary_visits: 1,
    honey_buckets: 1,
    water_buckets: 1,
    young_mead: 1
});

const TUTORIAL_OBJECTIVES = Object.freeze({
    0: { title: "Ask for your freedom", text: "Visit the King's Longhall and ask the King to release you from thraldom.", route: "Village → King's Longhall", href: "village.html", button: "🏘️ Open Village", nav: "village.html", card: "king-building-card" },
    1: { title: "Gather Birch Logs", text: "Chop enough Birch for two buckets and the tutorial barrel.", progressKey: "birch_logs", target: 23, unit: "Birch Logs", route: "Gathering → Trees → Birch Tree", href: "gathering.html", button: "🧺 Open Gathering", nav: "gathering.html" },
    2: { title: "Saw Birch Planks", text: "Turn the Birch Logs into the planks needed for two buckets and the tutorial barrel.", progressKey: "birch_planks", target: 46, unit: "Birch Planks", route: "Village → Sawmill", href: "village.html", button: "🏘️ Open Village", nav: "village.html", card: "sawmill-building-card" },
    3: { title: "Gather Bog Iron", text: "Collect enough Bog Iron to forge six Iron Bars for twelve hoops. Bog Iron is gathered by hand, so you do not need a pickaxe yet.", progressKey: "bog_iron", target: 30, unit: "Bog Iron", route: "Gathering → Mining → Bog Iron Deposit", href: "gathering.html", button: "🧺 Open Gathering", nav: "gathering.html" },
    4: { title: "Forge Iron Bars", text: "Forge six Iron Bars. They will become twelve hoops for two buckets and the barrel.", progressKey: "iron_bars", target: 6, unit: "Iron Bars", route: "Village → Forge", href: "village.html", button: "🏘️ Open Village", nav: "village.html", card: "forge-building-card" },
    5: { title: "Forge Iron Hoops", text: "Forge six batches to make twelve hoops: six for two buckets and six for the barrel.", progressKey: "iron_hoops", target: 12, unit: "Iron Hoops", route: "Village → Forge", href: "forge.html", button: "🔥 Open Forge", nav: "village.html", card: "forge-building-card" },
    6: { title: "Continue to Carpentry", text: "The King’s village hives are already built, so no nails are required. Continue to the Carpenter.", route: "Village → Carpenter", href: "carpenter.html", button: "🪵 Open Carpenter", nav: "village.html", card: "carpenter-building-card" },
    7: { title: "Craft Two Empty Buckets", text: "One bucket will collect honey and the other will be filled with water.", progressKey: "empty_buckets", target: 2, unit: "Empty Buckets", route: "Village → Carpenter", href: "village.html", button: "🏘️ Open Village", nav: "village.html", card: "carpenter-building-card" },
    8: { title: "Craft Barrel Parts", text: "Craft thirty Barrel Staves and one Barrel Lid.", route: "Village → Carpenter", href: "carpenter.html", button: "🪵 Open Carpenter", nav: "village.html", card: "carpenter-building-card", compound: true },
    9: { title: "Build the Birch Barrel", text: "Combine the staves, lid and six hoops into the one-off tutorial barrel.", progressKey: "empty_barrels", target: 1, unit: "Birch Barrel", route: "Village → Carpenter", href: "carpenter.html", button: "🪵 Open Carpenter", nav: "village.html", card: "carpenter-building-card" },
    10: { title: "Visit Ragnhild’s Village Apiary", text: "The five royal hives are already established. Bring an Empty Bucket and Ragnhild will lend you one hive.", progressKey: "village_apiary_visits", target: 1, unit: "Visit", route: "Village → Ragnhild’s Apiary", href: "village-apiary.html", button: "🐝 Visit Village Apiary", nav: "village.html", card: "apiary-building-card" },
    11: { title: "Collect Royal Honey", text: "Collect honey from the village hive with one Empty Bucket. The hive already has its Queen Bee.", progressKey: "honey_buckets", target: 1, unit: "Honey Bucket", route: "Village → Ragnhild’s Apiary", href: "village-apiary.html", button: "🐝 Open Village Apiary", nav: "village.html", card: "apiary-building-card" },
    12: { title: "Fill a Bucket with Water", text: "Open your Backpack and use Fill With Water on the remaining Empty Bucket.", progressKey: "water_buckets", target: 1, unit: "Water Bucket", route: "Backpack", href: "inventory.html", button: "🎒 Open Backpack", nav: "inventory.html" },
    13: { title: "Brew Young Mead", text: "Add the Birch Barrel, Honey Bucket and Water Bucket. Collect the mead when the timer finishes.", progressKey: "young_mead", target: 1, unit: "Young Mead", route: "Village → Mead Hall", href: "village.html", button: "🏘️ Open Village", nav: "village.html", card: "mead-building-card" },
    14: { title: "Return to the King", text: "Take the Young Mead to the King's Longhall and present it to earn your freedom.", route: "Village → King's Longhall", href: "king.html", button: "👑 Return to the King", nav: "village.html", card: "king-building-card" }
});

async function getTutorialProgress() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return null;

    /*
       Always reconcile the tutorial against the player's real items first.
       The backend counts Backpack + active cart + Storage Yard, so tutorial
       progress can never get stuck simply because the item is in a different
       carried/storage location. This applies to every player, including new
       accounts created after this update.
    */
    const { error: syncError } = await supabaseClient.rpc(
        "sync_my_tutorial_progress"
    );

    if (syncError) {
        console.warn(
            "Tutorial progress sync failed safely:",
            syncError.message
        );
    }

    const { data, error } = await supabaseClient
        .from("players")
        .select("id, tutorial_step, tutorial_complete, tutorial_progress, is_free_man, kings_tax_rate")
        .eq("id", user.id)
        .single();

    if (error) {
        console.error("Tutorial load failed:", error);
        return null;
    }

    return data;
}

async function advanceTutorial(expectedStep, nextStep) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return false;
    const { data: player, error } = await supabaseClient
        .from("players")
        .select("tutorial_step, tutorial_complete")
        .eq("id", user.id)
        .single();
    if (error || !player || player.tutorial_complete || player.tutorial_step !== expectedStep) return false;
    const { error: updateError } = await supabaseClient
        .from("players")
        .update({ tutorial_step: nextStep })
        .eq("id", user.id)
        .eq("tutorial_step", expectedStep);
    if (updateError) {
        console.error("Tutorial update failed:", updateError);
        return false;
    }
    await refreshTutorialUI();
    return true;
}

async function addTutorialProgress(progressKey, amount, expectedStep, nextStep, target) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return null;
    const { data: player, error } = await supabaseClient
        .from("players")
        .select("tutorial_step, tutorial_complete, tutorial_progress")
        .eq("id", user.id)
        .single();
    if (error || !player || player.tutorial_complete || player.tutorial_step !== expectedStep) return null;
    const progress = { ...(player.tutorial_progress || {}) };
    const current = Math.min(Number(progress[progressKey] || 0) + Number(amount || 0), target);
    progress[progressKey] = current;
    const payload = { tutorial_progress: progress };
    if (current >= target) payload.tutorial_step = nextStep;
    const { error: updateError } = await supabaseClient.from("players").update(payload).eq("id", user.id);
    if (updateError) {
        console.error("Tutorial progress update failed:", updateError);
        return null;
    }
    await refreshTutorialUI();
    return { current, target, completed: current >= target };
}

async function setTutorialProgress(progressKey, current, expectedStep, nextStep, target) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return null;
    const { data: player, error } = await supabaseClient.from("players")
        .select("tutorial_step, tutorial_complete, tutorial_progress")
        .eq("id", user.id).single();
    if (error || !player || player.tutorial_complete || player.tutorial_step !== expectedStep) return null;
    const progress = { ...(player.tutorial_progress || {}) };
    const safeCurrent = Math.min(Number(current || 0), target);
    progress[progressKey] = safeCurrent;
    const payload = { tutorial_progress: progress };
    if (safeCurrent >= target) payload.tutorial_step = nextStep;
    const { error: updateError } = await supabaseClient.from("players").update(payload).eq("id", user.id);
    if (updateError) return null;
    await refreshTutorialUI();
    return { current: safeCurrent, target, completed: safeCurrent >= target };
}

async function checkTutorialBarrelParts() {
    /*
       Barrel parts may live in the King's Handcart, Backpack or Storage Yard.
       Let the server reconcile the compound objective instead of reading only
       the Backpack table.
    */
    const { data, error } = await supabaseClient.rpc(
        "sync_my_tutorial_progress"
    );

    if (error) {
        console.error("Tutorial barrel progress sync failed:", error);
        return null;
    }

    await refreshTutorialUI();

    const progress = data?.tutorial_progress || {};
    const staves = Number(progress.barrel_staves || 0);
    const lids = Number(progress.barrel_lids || 0);

    return {
        staves,
        lids,
        completed:
            staves >= TUTORIAL_TARGETS.barrel_staves &&
            lids >= TUTORIAL_TARGETS.barrel_lids
    };
}

async function completeTutorial() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return false;
    const { data: player } = await supabaseClient.from("players").select("reputation").eq("id", user.id).single();
    const { error } = await supabaseClient.from("players").update({
        tutorial_step: TUTORIAL_STEPS.COMPLETE,
        tutorial_complete: true,
        is_free_man: true,
        kings_tax_rate: 0.01,
        reputation: Number(player?.reputation || 0) + 100,
        oak_unlocked: true
    }).eq("id", user.id);
    if (error) { console.error("Tutorial completion failed:", error); return false; }
    clearTutorialHighlights();
    return true;
}

async function refreshTutorialUI() {
    const player = await getTutorialProgress();

    if (!player || player.tutorial_complete) {
        clearTutorialHighlights();
        removeTutorialGuide();
        removeTutorialReminder();
        stopTutorialObserver();
        return;
    }

    renderTutorialGuide(player);
    showTutorialReminder(player);
    applyTutorialHighlights(player.tutorial_step);
    startTutorialObserver(player.tutorial_step);
}

function removeTutorialGuide() {
    document.getElementById("tutorial-guide")?.remove();
}

function removeTutorialReminder() {
    document.getElementById("tutorial-reminder")?.remove();
}

function showTutorialReminder(player) {
    const objective = TUTORIAL_OBJECTIVES[player?.tutorial_step];

    if (!objective || player?.tutorial_complete) {
        removeTutorialReminder();
        return;
    }

    let reminder = document.getElementById("tutorial-reminder");

    if (!reminder) {
        reminder = document.createElement("button");
        reminder.id = "tutorial-reminder";
        reminder.type = "button";
        reminder.className = "tutorial-reminder-button";
        reminder.setAttribute("aria-label", "Open tutorial objective");
        document.body.appendChild(reminder);
    }

    reminder.innerHTML = `
        <span class="tutorial-reminder-icon">!</span>
        <span class="tutorial-reminder-text">${objective.title}</span>
    `;

    reminder.onclick = () => {
        try {
            sessionStorage.removeItem(tutorialPopupStorageKey(player));
        } catch (error) {
            // Reopening still works without browser storage.
        }

        renderTutorialGuide(player, true);
    };
}


function getTutorialProgressDisplay(player, objective) {
    if (!objective) return "";

    const progress = player.tutorial_progress || {};

    if (objective.compound) {
        const staves = Math.min(Number(progress.barrel_staves || 0), TUTORIAL_TARGETS.barrel_staves);
        const lids = Math.min(Number(progress.barrel_lids || 0), TUTORIAL_TARGETS.barrel_lids);

        return `
            <div class="tutorial-guide-progress-lines">
                <div>${staves >= TUTORIAL_TARGETS.barrel_staves ? "✅" : "⬜"} Barrel Staves: <strong>${staves} / ${TUTORIAL_TARGETS.barrel_staves}</strong></div>
                <div>${lids >= TUTORIAL_TARGETS.barrel_lids ? "✅" : "⬜"} Barrel Lid: <strong>${lids} / ${TUTORIAL_TARGETS.barrel_lids}</strong></div>
            </div>
        `;
    }

    if (!objective.progressKey) return "";

    const current = Math.min(
        Number(progress[objective.progressKey] || 0),
        Number(objective.target || 0)
    );
    const target = Number(objective.target || 0);
    const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

    return `
        <div class="tutorial-guide-progress-label">
            Progress: <strong>${current} / ${target} ${objective.unit || ""}</strong>
        </div>
        <div class="tutorial-guide-progress-bar" aria-label="Tutorial progress">
            <div style="width:${percent}%"></div>
        </div>
    `;
}

function tutorialPopupStorageKey(player) {
    const playerKey = player?.id || "player";
    return `midgard-tutorial-popup:${playerKey}:${player?.tutorial_step}`;
}

function dismissTutorialPopup(player) {
    try {
        sessionStorage.setItem(
            tutorialPopupStorageKey(player),
            "seen"
        );
    } catch (error) {
        // The tutorial still works if browser storage is unavailable.
    }

    removeTutorialGuide();
    showTutorialReminder(player);
}

function renderTutorialGuide(player, forceOpen = false) {
    const objective = TUTORIAL_OBJECTIVES[player.tutorial_step];

    if (!objective) {
        removeTutorialGuide();
        return;
    }

    /*
       The old tutorial felt like a guided adventure rather than
       another permanent panel on the page. Restore that behaviour:
       show one popup when each tutorial step is first reached, then
       leave the relevant navigation/card flashing after dismissal.
    */
    let popupAlreadySeen = false;

    try {
        popupAlreadySeen =
            sessionStorage.getItem(tutorialPopupStorageKey(player)) === "seen";
    } catch (error) {
        popupAlreadySeen = false;
    }

    if (popupAlreadySeen && !forceOpen) {
        removeTutorialGuide();
        showTutorialReminder(player);
        return;
    }

    let guide = document.getElementById("tutorial-guide");

    if (!guide) {
        guide = document.createElement("div");
        guide.id = "tutorial-guide";
        guide.className = "tutorial-popup-backdrop";
        guide.setAttribute("role", "dialog");
        guide.setAttribute("aria-modal", "true");
        guide.setAttribute("aria-labelledby", "tutorial-popup-title");
        document.body.appendChild(guide);
    }

    const currentPage =
        window.location.pathname.split("/").pop() || "home.html";

    const destinationPage =
        String(objective.href || "").split("/").pop();

    const alreadyAtDestination =
        currentPage === destinationPage;

    guide.innerHTML = `
        <section class="tutorial-popup-card">
            <div class="tutorial-popup-seal" aria-hidden="true">📜</div>

            <div class="tutorial-guide-kicker">
                THE KING'S CHALLENGE
            </div>

            <h2 id="tutorial-popup-title">
                ${objective.title}
            </h2>

            <p class="tutorial-popup-message">
                ${objective.text}
            </p>

            ${getTutorialProgressDisplay(player, objective)}

            <div class="tutorial-guide-route">
                <span>Next location</span>
                <strong>${objective.route}</strong>
            </div>

            <div class="tutorial-popup-actions">
                <button
                    type="button"
                    class="tutorial-popup-secondary"
                    id="tutorial-popup-dismiss"
                >
                    Got it
                </button>

                <a
                    class="tutorial-guide-button${alreadyAtDestination ? " current-location" : ""}"
                    href="${alreadyAtDestination ? "#" : objective.href}"
                    id="tutorial-popup-go"
                >
                    ${alreadyAtDestination ? "📍 You are here" : objective.button}
                </a>
            </div>

            <p class="tutorial-popup-hint">
                The next place you need will keep glowing after this message closes.
            </p>
        </section>
    `;

    const dismissButton =
        document.getElementById("tutorial-popup-dismiss");

    dismissButton?.addEventListener("click", () => {
        dismissTutorialPopup(player);
    });

    const goButton =
        document.getElementById("tutorial-popup-go");

    goButton?.addEventListener("click", event => {
        dismissTutorialPopup(player);

        if (alreadyAtDestination) {
            event.preventDefault();
        }
    });
}

function clearTutorialHighlights() {
    document.querySelectorAll(".tutorial-highlight").forEach(element => {
        element.classList.remove("tutorial-highlight");
    });
}

function highlightTutorialElement(element) {
    if (element) element.classList.add("tutorial-highlight");
}

function applyTutorialHighlights(step) {
    clearTutorialHighlights();

    const objective = TUTORIAL_OBJECTIVES[step];
    if (!objective) return;

    // First guide the player through the main sidebar.
    if (objective.nav) {
        document.querySelectorAll(`.sidebar a[href='${objective.nav}']`).forEach(highlightTutorialElement);
    }

    // Then highlight the correct card inside Village or Wilderness.
    if (objective.card) {
        highlightTutorialElement(document.getElementById(objective.card));
    }

    const selectorsByStep = {
        0: ["#king-dialogue-card", "#king-actions button"],
        1: [
            "[data-gathering-filter='woodcutting']",
            "[data-gather-node='birch_tree']",
            "[data-gather-node='birch_tree']" + " button"
        ],
        2: ["#saw-birch-button"],
        3: [
            "[data-gathering-filter='mining']",
            "[data-gather-node='bog_iron']",
            "[data-gather-node='bog_iron']" + " button"
        ],
        4: ["#forge-iron-bar-button"],
        5: ["#forge-hoop-button"],
        6: ["#craft-bucket-button"],
        7: ["#craft-bucket-button"],
        8: ["#craft-staves-button", "#craft-lid-button"],
        9: ["#craft-barrel-button"],
        10: ["#village-hive-slots", "#village-hive-slots button"],
        11: ["#village-hive-slots", "#village-hive-slots button"],
        12: ["#inventory-list", "#inventory-list button"],
        13: ["#mead-shelves", "#mead-shelves button"],
        14: ["#king-dialogue-card", "#king-actions button"]
    };

    (selectorsByStep[step] || []).forEach(selector => {
        document.querySelectorAll(selector).forEach(element => {
            highlightTutorialElement(element);

            if (element.matches?.("[data-gather-node]")) {
                highlightTutorialElement(element.closest(".gathering-engine-card"));
            }
        });
    });
}


let tutorialMutationObserver = null;
let observedTutorialStep = null;

function stopTutorialObserver() {
    tutorialMutationObserver?.disconnect();
    tutorialMutationObserver = null;
    observedTutorialStep = null;
}

function startTutorialObserver(step) {
    if (tutorialMutationObserver && observedTutorialStep === step) return;

    stopTutorialObserver();
    observedTutorialStep = step;

    tutorialMutationObserver = new MutationObserver(() => {
        applyTutorialHighlights(step);
    });

    tutorialMutationObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Kept for older page scripts.
function showTutorialNotice() {
    refreshTutorialUI();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        setTimeout(() => refreshTutorialUI(), 50);
    });
} else {
    setTimeout(() => refreshTutorialUI(), 50);
}
