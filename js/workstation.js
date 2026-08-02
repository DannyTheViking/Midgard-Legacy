/* ============================================================
   MIDGARD LEGACY
   SHARED PROPERTY WORKSTATION SCREEN

   This file controls both:

   - Property Forge
   - Property Workbench

   The Forge and Workbench use the same database engine, but the
   Forge also displays fuel and smelted Forge materials.
============================================================ */


/* ============================================================
   PAGE STATE
============================================================ */

const WORKSTATION_TYPE = document.body.dataset.workstation;

let workstationRefreshTimer = null;
let currentWorkstationData = null;
let selectedRecipeKey = null;
let activeRecipeFilter = "all";
let recipeSearchText = "";


/* ============================================================
   SMALL DISPLAY HELPERS
============================================================ */

function stationMessage(
    text,
    kind = "info"
) {
    const messageElement = document.getElementById(
        "station-message"
    );

    if (!messageElement) {
        return;
    }

    messageElement.className =
        `station-message ${kind}`;

    messageElement.textContent = text;
}


function formatStationTime(seconds) {
    const safeSeconds = Math.max(
        0,
        Math.floor(Number(seconds) || 0)
    );

    const minutes = Math.floor(
        safeSeconds / 60
    );

    const remainingSeconds =
        safeSeconds % 60;

    if (minutes > 0) {
        return `${minutes}m ${remainingSeconds}s`;
    }

    return `${remainingSeconds}s`;
}


function escapeStationHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function recipeIcon(recipe) {
    if (recipe.type === "smelt") {
        return "🔥";
    }

    if (WORKSTATION_TYPE === "forge") {
        return "⚒️";
    }

    return "🪚";
}


/* ============================================================
   RECIPE LIBRARY
============================================================ */

function recipeMatchesCurrentFilters(recipe) {
    const matchesType =
        activeRecipeFilter === "all"
        || recipe.type === activeRecipeFilter;

    const searchableText = [
        recipe.name,
        recipe.description,
        recipe.type
    ]
        .join(" ")
        .toLowerCase();

    const matchesSearch =
        searchableText.includes(recipeSearchText);

    return matchesType && matchesSearch;
}


function renderRecipeLibrary() {
    const recipeList = document.getElementById(
        "station-recipes"
    );

    if (!recipeList || !currentWorkstationData) {
        return;
    }

    const allRecipes =
        currentWorkstationData.recipes || [];

    const visibleRecipes = allRecipes.filter(
        recipeMatchesCurrentFilters
    );

    const countElement = document.getElementById(
        "recipe-count"
    );

    if (countElement) {
        countElement.textContent = visibleRecipes.length;
    }

    if (visibleRecipes.length === 0) {
        recipeList.innerHTML = `
            <p class="forge-empty-message">
                No recipes match this search.
            </p>
        `;

        return;
    }

    recipeList.innerHTML = visibleRecipes
        .map((recipe) => {
            const selectedClass =
                recipe.key === selectedRecipeKey
                    ? "selected"
                    : "";

            const isUnlocked = recipe.unlocked !== false;
            const canCraft = isUnlocked && (recipe.ingredients || [])
                .every((ingredient) => {
                    return Number(ingredient.available)
                        >= Number(ingredient.quantity);
                });

            return `
                <button
                    class="forge-recipe-row ${selectedClass} ${isUnlocked ? "" : "locked"}"
                    data-select-recipe="${escapeStationHtml(recipe.key)}"
                    type="button"
                >
                    <span class="forge-recipe-icon">
                        ${recipeIcon(recipe)}
                    </span>

                    <span class="forge-recipe-text">
                        <strong>${escapeStationHtml(recipe.name)}</strong>
                        <small>
                            Level ${Number(recipe.level) || 1}
                            · ${formatStationTime(recipe.seconds)}
                        </small>
                    </span>

                    <span
                        class="forge-recipe-status ${canCraft ? "ready" : "missing"}"
                        title="${!isUnlocked ? `Requires station level ${Number(recipe.level) || 1}` : (canCraft ? "Materials ready" : "Materials missing")}"
                    >
                        ${!isUnlocked ? "🔒" : (canCraft ? "✓" : "!")}
                    </span>
                </button>
            `;
        })
        .join("");

    bindRecipeSelectionButtons();
}


function bindRecipeSelectionButtons() {
    document
        .querySelectorAll("[data-select-recipe]")
        .forEach((button) => {
            button.addEventListener(
                "click",
                () => {
                    selectedRecipeKey =
                        button.dataset.selectRecipe;

                    renderRecipeLibrary();
                    renderSelectedRecipe();
                }
            );
        });
}


/* ============================================================
   SELECTED RECIPE PANEL
============================================================ */

function renderSelectedRecipe() {
    const selectedPanel = document.getElementById(
        "selected-recipe"
    );

    if (!selectedPanel || !currentWorkstationData) {
        return;
    }

    const recipes =
        currentWorkstationData.recipes || [];

    const selectedRecipe = recipes.find(
        (recipe) => recipe.key === selectedRecipeKey
    );

    if (!selectedRecipe) {
        selectedPanel.className =
            "selected-recipe-empty";

        selectedPanel.textContent =
            "Select a recipe from the list.";

        return;
    }

    const levelElement = document.getElementById(
        "selected-recipe-level"
    );

    if (levelElement) {
        levelElement.textContent =
            `Level ${selectedRecipe.level}`;
    }

    const ingredients =
        selectedRecipe.ingredients || [];

    const ingredientsHtml = ingredients.length > 0
        ? ingredients
            .map((ingredient) => {
                const required =
                    Number(ingredient.quantity) || 0;

                const available =
                    Number(ingredient.available) || 0;

                const hasEnough =
                    available >= required;

                return `
                    <div class="selected-ingredient-row ${hasEnough ? "ready" : "missing"}">
                        <span>${escapeStationHtml(ingredient.name)}</span>
                        <strong>${available} / ${required}</strong>
                    </div>
                `;
            })
            .join("")
        : `
            <p class="forge-empty-message">
                This recipe has no ingredients.
            </p>
        `;

    const isUnlocked = selectedRecipe.unlocked !== false;

    selectedPanel.className =
        `selected-recipe-card ${isUnlocked ? "" : "locked"}`;

    selectedPanel.innerHTML = `
        <div class="selected-recipe-heading">
            <div class="selected-recipe-icon">
                ${recipeIcon(selectedRecipe)}
            </div>

            <div>
                <h3>${escapeStationHtml(selectedRecipe.name)}</h3>
                <p>${escapeStationHtml(selectedRecipe.description)}</p>
            </div>
        </div>

        <div class="selected-recipe-stat-grid">
            <div>
                <span>Produces</span>
                <strong>${Number(selectedRecipe.output_quantity) || 1}</strong>
            </div>

            <div>
                <span>Craft time</span>
                <strong>${formatStationTime(selectedRecipe.seconds)}</strong>
            </div>

            ${selectedRecipe.fuel ? `
                <div>
                    <span>Fuel cost</span>
                    <strong>${formatStationTime(selectedRecipe.fuel)}</strong>
                </div>
            ` : ""}
        </div>

        ${isUnlocked ? "" : `<div class="station-level-lock">🔒 Upgrade this station to Level ${Number(selectedRecipe.level) || 1} to use this recipe.</div>`}

        <section class="selected-ingredients-section">
            <h4>Required Materials</h4>
            ${ingredientsHtml}
        </section>

        <div class="selected-recipe-actions">
            <label for="selected-recipe-amount">
                Amount
            </label>

            <input
                id="selected-recipe-amount"
                type="number"
                min="1"
                max="999"
                value="1"
            >

            <button
                id="selected-recipe-craft-button"
                type="button"
                ${isUnlocked ? "" : "disabled"}
            >
                ${isUnlocked ? "Add to Queue" : `Requires Level ${Number(selectedRecipe.level) || 1}`}
            </button>
        </div>
    `;

    document
        .getElementById("selected-recipe-craft-button")
        ?.addEventListener(
            "click",
            queueSelectedRecipe
        );
}


/* ============================================================
   FORGE MATERIAL STORAGE
============================================================ */

function renderForgeMaterials() {
    const materialsElement = document.getElementById(
        "forge-materials"
    );

    if (!materialsElement || !currentWorkstationData) {
        return;
    }

    const materialEntries = Object.entries(
        currentWorkstationData.forge_materials || {}
    );

    const knownMaterials = [
        "iron",
        "brass",
        "lead",
        "sand",
        "stone",
        "clay"
    ];

    const materialMap = new Map(materialEntries);

    materialsElement.innerHTML = knownMaterials
        .map((materialKey) => {
            const amount = Number(
                materialMap.get(materialKey) || 0
            );

            return `
                <div class="forge-material-row">
                    <span>
                        ${escapeStationHtml(
                            materialKey.charAt(0).toUpperCase()
                            + materialKey.slice(1)
                        )}
                    </span>
                    <strong>${amount}</strong>
                </div>
            `;
        })
        .join("");
}


/* ============================================================
   QUEUE AND OUTPUT
============================================================ */

function queueCard(job) {
    /*
     * Forge jobs receive their remaining time directly from Supabase.
     * This is important because a Forge job can pause when fuel reaches zero.
     *
     * Other workstations can still use their normal completion timestamp.
     */
    const completionTime = new Date(
        job.completes_at
    ).getTime();

    const timestampSecondsRemaining = Math.max(
        0,
        Math.ceil(
            (completionTime - Date.now()) / 1000
        )
    );

    const secondsRemaining = Number.isFinite(
        Number(job.remaining_seconds)
    )
        ? Math.max(0, Number(job.remaining_seconds))
        : timestampSecondsRemaining;

    const queueStatus = job.paused
        ? "Paused — add fuel"
        : "Working";

    return `
        <article class="station-queue-card">
            <div>
                <strong>
                    ${escapeStationHtml(job.name)} × ${job.batches}
                </strong>

                <small>
                    ${job.ready
                        ? "Ready in Output"
                        : `${formatStationTime(secondsRemaining)} remaining`
                    }
                </small>
            </div>

            <span class="queue-status-badge">
                ${job.ready ? "Ready" : queueStatus}
            </span>
        </article>
    `;
}


function groupReadyOutputJobs(readyJobs) {
    /*
     * The database keeps every completed crafting job as its own row.
     * That is useful for timing and history, but it would make the output
     * panel fill with repeated cards such as Nails ×1, Nails ×1, Nails ×1.
     *
     * For display, jobs with the same recipe are grouped into one stack.
     * The individual job IDs are kept so one Collect button can still claim
     * every completed database row safely.
     */
    const groupedOutputs = new Map();

    const recipes = currentWorkstationData?.recipes || [];

    readyJobs.forEach((job) => {
        const matchingRecipe = recipes.find(
            (recipe) => recipe.name === job.name
        );

        const outputPerBatch = Math.max(
            1,
            Number(matchingRecipe?.output_quantity || 1)
        );

        const stackKey = String(job.name);

        const existingStack = groupedOutputs.get(stackKey) || {
            name: job.name,
            quantity: 0,
            jobIds: []
        };

        existingStack.quantity += (
            Number(job.batches || 1)
            * outputPerBatch
        );

        existingStack.jobIds.push(
            Number(job.id)
        );

        groupedOutputs.set(
            stackKey,
            existingStack
        );
    });

    return [...groupedOutputs.values()];
}


function outputCard(outputStack) {
    const encodedJobIds = outputStack.jobIds.join(",");

    return `
        <article class="forge-output-card">
            <div class="forge-output-icon">📦</div>

            <div>
                <strong>
                    ${escapeStationHtml(outputStack.name)} × ${outputStack.quantity}
                </strong>

                <small>
                    Finished and ready to collect
                </small>
            </div>

            <button
                data-claim-jobs="${encodedJobIds}"
                type="button"
            >
                Collect
            </button>
        </article>
    `;
}


function renderQueueAndOutput() {
    const queueElement = document.getElementById(
        "station-queue"
    );

    const outputElement = document.getElementById(
        "station-output"
    );

    if (!currentWorkstationData) {
        return;
    }

    const allJobs =
        currentWorkstationData.queue || [];

    const activeJobs = allJobs.filter(
        (job) => !job.ready
    );

    const readyJobs = allJobs.filter(
        (job) => job.ready
    );

    const groupedReadyOutputs = groupReadyOutputJobs(
        readyJobs
    );

    const queueCount = document.getElementById(
        "queue-count"
    );

    if (queueCount) {
        queueCount.textContent = activeJobs.length;
    }

    if (queueElement) {
        queueElement.innerHTML = activeJobs.length > 0
            ? activeJobs.map(queueCard).join("")
            : `
                <p class="forge-empty-message">
                    Your crafting queue is empty.
                </p>
            `;
    }

    if (outputElement) {
        outputElement.innerHTML = groupedReadyOutputs.length > 0
            ? groupedReadyOutputs.map(outputCard).join("")
            : `
                <div class="forge-output-empty-slot">Empty</div>
                <div class="forge-output-empty-slot">Empty</div>
                <div class="forge-output-empty-slot">Empty</div>
            `;
    }

    bindClaimButtons();
}


function bindClaimButtons() {
    document
        .querySelectorAll("[data-claim-jobs]")
        .forEach((button) => {
            button.addEventListener(
                "click",
                async () => {
                    button.disabled = true;

                    /*
                     * A visible output stack may represent several completed
                     * queue rows. Claim each row in order, then refresh once.
                     */
                    const jobIds = String(
                        button.dataset.claimJobs || ""
                    )
                        .split(",")
                        .map((value) => Number(value))
                        .filter((value) => Number.isFinite(value));

                    let collectedQuantity = 0;
                    let collectedName = "items";
                    let firstError = null;

                    for (const jobId of jobIds) {
                        const {
                            data,
                            error
                        } = await supabaseClient.rpc(
                            "claim_workstation_job",
                            {
                                p_job_id: jobId
                            }
                        );

                        if (error) {
                            firstError = error;
                            break;
                        }

                        collectedQuantity += Number(
                            data?.quantity || 0
                        );

                        collectedName = data?.name || collectedName;
                    }

                    if (firstError) {
                        stationMessage(
                            firstError.message,
                            "error"
                        );
                    }
                    else {
                        stationMessage(
                            `✅ Collected ${collectedQuantity} ${collectedName}. Sent to the Storage Yard.`,
                            "success"
                        );
                    }

                    await loadWorkstation();
                }
            );
        });
}


/* ============================================================
   QUEUE A RECIPE
============================================================ */

async function queueSelectedRecipe() {
    if (!selectedRecipeKey) {
        stationMessage(
            "Choose a recipe first.",
            "error"
        );

        return;
    }

    const amountInput = document.getElementById(
        "selected-recipe-amount"
    );

    const amount = Math.max(
        1,
        Math.floor(
            Number(amountInput?.value || 1)
        )
    );

    const craftButton = document.getElementById(
        "selected-recipe-craft-button"
    );

    if (craftButton) {
        craftButton.disabled = true;
    }

    const {
        data,
        error
    } = await supabaseClient.rpc(
        "queue_workstation_recipe",
        {
            p_recipe_key: selectedRecipeKey,
            p_batches: amount
        }
    );

    if (error) {
        stationMessage(
            error.message,
            "error"
        );
    }
    else {
        stationMessage(
            `✅ ${data.recipe} added to the queue.`,
            "success"
        );
    }

    await loadWorkstation();
}


/* ============================================================
   FORGE FUEL
============================================================ */

async function addForgeFuel() {
    const itemId = Number(
        document.getElementById("fuel-item")?.value
    );

    const quantity = Math.max(
        1,
        Math.floor(
            Number(
                document.getElementById("fuel-quantity")?.value
                || 1
            )
        )
    );

    if (!itemId) {
        stationMessage(
            "Choose Coal or a Log from the fuel list.",
            "error"
        );

        return;
    }

    const {
        error
    } = await supabaseClient.rpc(
        "add_station_fuel",
        {
            p_item_id: itemId,
            p_quantity: quantity
        }
    );

    if (error) {
        stationMessage(
            error.message,
            "error"
        );
    }
    else {
        stationMessage(
            "✅ Fuel added to the Forge.",
            "success"
        );
    }

    await Promise.all([
        loadFuelChoices(),
        loadWorkstation()
    ]);
}


async function loadFuelChoices() {
    if (WORKSTATION_TYPE !== "forge") {
        return;
    }

    const {
        data: {
            user
        }
    } = await supabaseClient.auth.getUser();

    if (!user) {
        return;
    }

    const [
        inventoryResult,
        storageResult,
        cartResult
    ] = await Promise.all([
        supabaseClient
            .from("inventory")
            .select("item_id, quantity, items(name)")
            .eq("player_id", user.id),

        supabaseClient
            .from("player_storage")
            .select("item_id, quantity, items(name)")
            .eq("player_id", user.id),

        supabaseClient
            .from("player_carts")
            .select("id, cart_items(item_id, quantity, items(name))")
            .eq("player_id", user.id)
            .eq("is_active", true)
    ]);

    const allRows = [
        ...(inventoryResult.data || []),
        ...(storageResult.data || []),
        ...(
            cartResult.data || []
        ).flatMap((cart) => cart.cart_items || [])
    ];

    const fuelTotals = new Map();

    allRows.forEach((row) => {
        const itemName = String(
            row.items?.name || ""
        );

        if (!/coal|log/i.test(itemName)) {
            return;
        }

        const existingFuel = fuelTotals.get(
            row.item_id
        ) || {
            name: itemName,
            quantity: 0
        };

        existingFuel.quantity += Number(
            row.quantity || 0
        );

        fuelTotals.set(
            row.item_id,
            existingFuel
        );
    });

    const fuelSelect = document.getElementById(
        "fuel-item"
    );

    if (!fuelSelect) {
        return;
    }

    const fuelOptions = [...fuelTotals]
        .map(([itemId, fuel]) => {
            return `
                <option value="${itemId}">
                    ${escapeStationHtml(fuel.name)} (${fuel.quantity})
                </option>
            `;
        })
        .join("");

    fuelSelect.innerHTML = `
        <option value="">Choose fuel</option>
        ${fuelOptions}
    `;
}


/* ============================================================
   LOAD THE COMPLETE WORKSTATION SCREEN
============================================================ */

async function loadWorkstation() {
    const {
        data,
        error
    } = await supabaseClient.rpc(
        "get_workstation_screen",
        {
            p_station: WORKSTATION_TYPE
        }
    );

    if (error) {
        stationMessage(
            `Workstation error: ${error.message}`,
            "error"
        );

        return;
    }

    currentWorkstationData = data;

    const stationLevel = document.getElementById(
        "station-level-value"
    );

    if (stationLevel) {
        stationLevel.textContent = data.level;
    }

    const recipes = data.recipes || [];

    if (
        !selectedRecipeKey
        || !recipes.some(
            (recipe) => recipe.key === selectedRecipeKey
        )
    ) {
        selectedRecipeKey = recipes[0]?.key || null;
    }

    const fuelPanel = document.getElementById(
        "forge-fuel-panel"
    );

    if (fuelPanel) {
        const fuelValue = document.getElementById(
            "forge-fuel-value"
        );

        if (fuelValue) {
            fuelValue.textContent = formatStationTime(
                data.fuel_seconds
            );
        }

        fuelPanel.hidden = false;
    }

    renderRecipeLibrary();
    renderSelectedRecipe();
    renderForgeMaterials();
    renderQueueAndOutput();
}


/* ============================================================
   PAGE CONTROLS
============================================================ */

function bindStaticPageControls() {
    document
        .getElementById("add-fuel-button")
        ?.addEventListener(
            "click",
            addForgeFuel
        );

    document
        .getElementById("recipe-search")
        ?.addEventListener(
            "input",
            (event) => {
                recipeSearchText = String(
                    event.target.value || ""
                ).trim().toLowerCase();

                renderRecipeLibrary();
            }
        );

    document
        .querySelectorAll("[data-recipe-filter]")
        .forEach((button) => {
            button.addEventListener(
                "click",
                () => {
                    activeRecipeFilter =
                        button.dataset.recipeFilter;

                    document
                        .querySelectorAll("[data-recipe-filter]")
                        .forEach((tabButton) => {
                            tabButton.classList.toggle(
                                "active",
                                tabButton === button
                            );
                        });

                    renderRecipeLibrary();
                }
            );
        });
}


/* ============================================================
   START THE PAGE
============================================================ */

bindStaticPageControls();

Promise.all([
    loadFuelChoices(),
    loadWorkstation()
]);

workstationRefreshTimer = setInterval(
    loadWorkstation,
    5000
);
