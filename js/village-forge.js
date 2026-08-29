/*
 * Village Forge
 * -------------
 * This is deliberately separate from the player's Property Forge.
 * The village owns the Forge, fuel and tools. The player only supplies
 * the carried materials (Backpack + active cart), which is important
 * during the King's tutorial because the player uses the King's Handcart.
 */

function villageForgeNumber(id, fallback = 1) {
    const value = Number(document.getElementById(id)?.value || fallback);
    return Math.max(1, Math.min(100, Math.floor(value || fallback)));
}

function villageForgeMessage(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

async function loadVillageForgeMaterials() {
    const { data, error } = await supabaseClient.rpc("get_my_village_forge_materials");
    if (error) {
        villageForgeMessage("village-bar-message", `❌ ${error.message}`);
        villageForgeMessage("village-hoop-message", `❌ ${error.message}`);
        return;
    }

    const bog = Number(data?.bog_iron || 0);
    const bars = Number(data?.iron_bars || 0);
    const hoops = Number(data?.iron_hoops || 0);

    const barStock = document.getElementById("village-bar-stock");
    const hoopStock = document.getElementById("village-hoop-stock");

    if (barStock) {
        barStock.innerHTML = `<span>${bog.toLocaleString()} Bog Iron</span><span>${bars.toLocaleString()} Iron Bars</span>`;
    }
    if (hoopStock) {
        hoopStock.innerHTML = `<span>${bars.toLocaleString()} Iron Bars</span><span>${hoops.toLocaleString()} Iron Hoops</span>`;
    }
}

async function makeVillageIronBars() {
    const button = document.getElementById("forge-iron-bar-button");
    const batches = villageForgeNumber("village-bar-batches");
    if (button) button.disabled = true;
    villageForgeMessage("village-bar-message", "🔥 Bjørn is smelting the Bog Iron...");

    const { data, error } = await supabaseClient.rpc("village_forge_make_iron_bars", { p_batches: batches });
    if (error) {
        villageForgeMessage("village-bar-message", `❌ ${error.message}`);
    } else {
        villageForgeMessage("village-bar-message", `✅ Bjørn used ${Number(data.bog_iron_used).toLocaleString()} Bog Iron and made ${Number(data.iron_bars_made).toLocaleString()} Iron Bars.`);
        await loadVillageForgeMaterials();
        if (typeof window.refreshTutorialAfterAction === "function") await window.refreshTutorialAfterAction();
    }
    if (button) button.disabled = false;
}

async function makeVillageIronHoops() {
    const button = document.getElementById("forge-hoop-button");
    const batches = villageForgeNumber("village-hoop-batches");
    if (button) button.disabled = true;
    villageForgeMessage("village-hoop-message", "⚒️ Bjørn is shaping the Iron Bars...");

    const { data, error } = await supabaseClient.rpc("village_forge_make_iron_hoops", { p_batches: batches });
    if (error) {
        villageForgeMessage("village-hoop-message", `❌ ${error.message}`);
    } else {
        villageForgeMessage("village-hoop-message", `✅ Bjørn used ${Number(data.iron_bars_used).toLocaleString()} Iron Bars and made ${Number(data.iron_hoops_made).toLocaleString()} Iron Hoops.`);
        await loadVillageForgeMaterials();
        if (typeof window.refreshTutorialAfterAction === "function") await window.refreshTutorialAfterAction();
    }
    if (button) button.disabled = false;
}

async function initialiseVillageForge() {
    await loadVillageForgeMaterials();

    document.getElementById("forge-iron-bar-button")?.addEventListener("click", makeVillageIronBars);
    document.getElementById("forge-hoop-button")?.addEventListener("click", makeVillageIronHoops);

    // Tutorial convenience: choose the exact amount needed by the current step.
    const player = window.currentPlayer || null;
    const step = Number(player?.tutorial_step || 0);
    if (step === 4) {
        const input = document.getElementById("village-bar-batches");
        if (input) input.value = "6";
    }
    if (step === 5) {
        const input = document.getElementById("village-hoop-batches");
        if (input) input.value = "6";
    }
}

document.addEventListener("DOMContentLoaded", initialiseVillageForge);
