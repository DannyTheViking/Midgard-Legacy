/* =====================================
   MIDGARD LEGACY - VILLAGE WELL
   Fresh water is collected at a world location, never from the Backpack UI.
===================================== */

async function loadVillageWell() {
    const message = document.getElementById("well-message");
    const count = document.getElementById("well-empty-buckets");

    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error || !user) {
        window.location.href = "login.html";
        return;
    }

    // The shared tutorial quantity counts Backpack + active cart + Storage Yard.
    const { data, error: countError } = await supabaseClient.rpc(
        "tutorial_named_item_quantity",
        { p_player: user.id, p_name: "Empty Bucket" }
    );

    if (count) {
        count.textContent = countError ? "—" : String(Number(data || 0));
    }

    if (message && countError) {
        message.textContent = "Your carried bucket count could not be loaded, but you can still try the well.";
    }
}

async function drawFreshWater() {
    const button = document.getElementById("draw-water-button");
    const message = document.getElementById("well-message");

    if (button) {
        button.disabled = true;
        button.textContent = "🪣 Drawing water...";
    }

    const { data, error } = await supabaseClient.rpc(
        "fill_fresh_water_bucket",
        { p_source: "village_well" }
    );

    if (error) {
        if (message) message.textContent = `❌ ${error.message}`;
        if (button) {
            button.disabled = false;
            button.textContent = "💧 Fill One Empty Bucket";
        }
        await loadVillageWell();
        return;
    }

    const destination = data?.destination === "cart"
        ? "your active cart"
        : "your Backpack";

    if (message) {
        message.textContent = `✅ You fill one Empty Bucket with clean fresh water. The Water Bucket was placed in ${destination}.`;
    }

    await loadVillageWell();

    if (typeof window.refreshTutorialAfterAction === "function") {
        await window.refreshTutorialAfterAction();
    } else if (typeof refreshTutorialUI === "function") {
        await refreshTutorialUI();
    }

    if (button) {
        button.disabled = false;
        button.textContent = "💧 Fill Another Empty Bucket";
    }
}

window.drawFreshWater = drawFreshWater;
loadVillageWell();
