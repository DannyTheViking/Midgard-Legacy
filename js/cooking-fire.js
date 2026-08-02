/* ============================================================
   MIDGARD LEGACY - PROPERTY COOKING FIRE
   Matches the Forge/Workbench workstation layout.
============================================================ */

const cookingState = {
    burnsUntil: null,
    recipes: [],
    selectedRecipeKey: null,
    cookingLevel: 1,
    cookingXp: 0,
    coalReady: 0,
    busy: false
};

const el = (id) => document.getElementById(id);
const safe = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function message(text, kind = "info") {
    const box = el("fire-message");
    if (!box) return;
    box.className = `station-message ${kind}`;
    box.textContent = text;
}

function remainingSeconds() {
    if (!cookingState.burnsUntil) return 0;
    return Math.max(0, Math.ceil((cookingState.burnsUntil.getTime() - Date.now()) / 1000));
}

function formatTime(total) {
    const seconds = Math.max(0, Number(total) || 0);
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function burnChance(level) {
    return Math.max(1, Math.round((0.40 - ((Math.max(1, level) - 1) * 0.02)) * 100));
}

function renderFire() {
    const lit = remainingSeconds() > 0;
    el("fire-icon").textContent = lit ? "🔥" : "🪵";
    el("fire-status").textContent = lit ? "The fire is burning" : "The fire is out";
    el("fire-timer").textContent = formatTime(remainingSeconds());
    el("start-fire-button").disabled = cookingState.busy || lit || cookingState.coalReady > 0;
    el("add-log-button").disabled = cookingState.busy || !lit;
    el("coal-card").hidden = cookingState.coalReady <= 0;
    el("collect-coal-button").textContent = `Collect ${cookingState.coalReady || 5} Coal`;
    el("cooking-level").textContent = cookingState.cookingLevel;
    el("cooking-xp").textContent = Number(cookingState.cookingXp).toLocaleString();
    el("cooking-burn-chance").textContent = `${burnChance(cookingState.cookingLevel)}%`;
}

function renderRecipeList() {
    const search = String(el("recipe-search")?.value || "").toLowerCase();
    const recipes = cookingState.recipes.filter((recipe) => `${recipe.name} ${recipe.description}`.toLowerCase().includes(search));
    el("recipe-count").textContent = recipes.length;
    el("cooking-recipes").innerHTML = recipes.map((recipe) => {
        const selected = recipe.key === cookingState.selectedRecipeKey ? "selected" : "";
        const ready = recipe.unlocked && Number(recipe.available) >= Number(recipe.ingredient_quantity);
        return `<button class="forge-recipe-row ${selected} ${recipe.unlocked ? "" : "locked"}" data-recipe="${safe(recipe.key)}" type="button">
            <span class="forge-recipe-icon">🍲</span>
            <span class="forge-recipe-text"><strong>${safe(recipe.name)}</strong><small>Level ${recipe.level} · ${recipe.seconds}s</small></span>
            <span class="forge-recipe-status ${ready ? "ready" : "missing"}">${recipe.unlocked ? (ready ? "✓" : "!") : "🔒"}</span>
        </button>`;
    }).join("") || '<p class="forge-empty-message">No recipes match this search.</p>';

    document.querySelectorAll("[data-recipe]").forEach((button) => button.addEventListener("click", () => {
        cookingState.selectedRecipeKey = button.dataset.recipe;
        renderRecipeList();
        renderSelectedRecipe();
    }));
}

function renderSelectedRecipe() {
    const panel = el("selected-cooking-recipe");
    const recipe = cookingState.recipes.find((item) => item.key === cookingState.selectedRecipeKey);
    if (!recipe) {
        panel.className = "forge-selected-recipe selected-recipe-empty";
        panel.textContent = "Select a cooking recipe.";
        return;
    }
    const enough = Number(recipe.available) >= Number(recipe.ingredient_quantity);
    const tool = recipe.requires_tool ? `<div class="cooking-requirement"><span>${safe(recipe.requires_tool)}</span><strong>Required tool</strong></div>` : "";
    panel.className = "forge-selected-recipe";
    panel.innerHTML = `<div class="selected-recipe-heading">
        <div class="selected-recipe-icon">🍲</div>
        <div><h1>${safe(recipe.name)}</h1><p>${safe(recipe.description)}</p></div>
        <span class="station-level-badge">Level ${recipe.level}</span>
    </div>
    <div class="selected-recipe-stats">
        <div><span>Produces</span><strong>${recipe.output_quantity} ${safe(recipe.output)}</strong></div>
        <div><span>Cook time</span><strong>${recipe.seconds}s</strong></div>
        <div><span>Cooking XP</span><strong>${recipe.xp}</strong></div>
    </div>
    <h3>Required Materials</h3>
    <div class="cooking-requirement ${enough ? "ready" : "missing"}"><span>${safe(recipe.ingredient)}</span><strong>${recipe.available} / ${recipe.ingredient_quantity}</strong></div>
    ${tool}
    <div class="cooking-warning">At Cooking Level ${cookingState.cookingLevel}, you currently have a ${burnChance(cookingState.cookingLevel)}% chance to burn the meal. Burnt Food can be used as weak Forge fuel.</div>
    <button id="cook-recipe-button" type="button" ${recipe.unlocked && enough && remainingSeconds() > 0 ? "" : "disabled"}>Cook ${safe(recipe.name)}</button>`;
    el("cook-recipe-button")?.addEventListener("click", cookSelectedRecipe);
}

async function loadCookingFire(silent = false) {
    const { data, error } = await supabaseClient.rpc("get_my_cooking_fire");
    if (error) {
        message(`Could not load the Cooking Fire: ${error.message}`, "error");
        return;
    }
    cookingState.burnsUntil = data?.burns_until ? new Date(data.burns_until) : null;
    cookingState.recipes = data?.recipes || [];
    cookingState.cookingLevel = Number(data?.cooking_level || 1);
    cookingState.cookingXp = Number(data?.cooking_xp || 0);
    cookingState.coalReady = Number(data?.coal_ready || 0);
    if (!cookingState.selectedRecipeKey || !cookingState.recipes.some((r) => r.key === cookingState.selectedRecipeKey)) {
        cookingState.selectedRecipeKey = cookingState.recipes[0]?.key || null;
    }
    renderFire();
    renderRecipeList();
    renderSelectedRecipe();
    if (!silent) message(data?.is_lit ? "Your fire is ready for cooking." : (cookingState.coalReady ? "Your fire has gone out. Collect the coal from the empty fire pit." : "Use one Bird Nest to light the fire."), "success");
}

async function runAction(label, rpc, args = {}) {
    if (cookingState.busy) return null;
    cookingState.busy = true;
    renderFire();
    message(label);
    const { data, error } = await supabaseClient.rpc(rpc, args);
    cookingState.busy = false;
    if (error) {
        message(error.message, "error");
        renderFire();
        return null;
    }
    await loadCookingFire(true);
    return data;
}

async function startFire() {
    const data = await runAction("Lighting the Bird Nest...", "start_cooking_fire");
    if (data) message("The Bird Nest caught fire. You have 1 minute to add logs.", "success");
}

async function addLog() {
    const log = el("fire-log-select").value;
    const data = await runAction(`Adding one ${log}...`, "add_log_to_cooking_fire", { p_log_name: log });
    if (data) message(`Added one ${log}. Ten minutes were added to the remaining timer.`, "success");
}

async function collectCoal() {
    const data = await runAction("Collecting coal from the empty fire pit...", "collect_cooking_fire_coal");
    if (data) message(`You collected ${data.coal_collected} Coal from your empty fire pit.`, "success");
}

async function cookSelectedRecipe() {
    const recipe = cookingState.recipes.find((item) => item.key === cookingState.selectedRecipeKey);
    if (!recipe) return;
    const data = await runAction(`Cooking ${recipe.name}...`, "cook_fire_recipe", { p_recipe_key: recipe.key });
    if (!data) return;
    if (data.burnt) message(`You burned the meal and received 1 Burnt Food. You still gained a little Cooking XP.`, "error");
    else message(`You successfully cooked ${data.quantity} ${data.item}.`, "success");
}

el("start-fire-button")?.addEventListener("click", startFire);
el("add-log-button")?.addEventListener("click", addLog);
el("collect-coal-button")?.addEventListener("click", collectCoal);
el("recipe-search")?.addEventListener("input", renderRecipeList);
window.setInterval(() => {
    const before = remainingSeconds();
    renderFire();
    renderSelectedRecipe();
    if (before <= 0 && cookingState.burnsUntil) loadCookingFire(true);
}, 1000);
loadCookingFire();
