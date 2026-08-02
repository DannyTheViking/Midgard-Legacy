"use strict";

/* =====================================
   BLACKSMITH: RESOURCE TOOL REPAIRS
===================================== */

let repairTools = [];

const repairButton = document.getElementById("repair-tool-button");
const repairToolSelect = document.getElementById("repair-tool-select");
const repairMaterialSelect = document.getElementById("repair-material-select");
const craftIronAxeButton = document.getElementById("craft-iron-axe-button");

function escapeBlacksmithText(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function showBlacksmithMessage(message) {
    const element = document.getElementById("blacksmith-message");
    if (element) element.innerHTML = message;
}

function showCraftAxeMessage(message) {
    const element = document.getElementById("craft-axe-message");
    if (element) element.innerHTML = message;
}

function selectedRepairTool() {
    return repairTools.find((tool) => tool.equipment_key === repairToolSelect?.value) || null;
}

function updateRepairMaterialOptions() {
    const tool = selectedRepairTool();
    const name = document.getElementById("repair-tool-name");
    const icon = document.getElementById("repair-tool-icon");
    const durability = document.getElementById("repair-tool-durability");
    const fill = document.getElementById("repair-tool-durability-fill");
    const details = document.getElementById("repair-material-details");

    if (!tool) {
        if (name) name.textContent = "Select a tool";
        if (durability) durability.textContent = "0 / 0";
        if (fill) fill.style.width = "0%";
        if (repairMaterialSelect) repairMaterialSelect.innerHTML = '<option value="">Choose a tool first</option>';
        if (repairButton) repairButton.disabled = true;
        return;
    }

    if (name) name.textContent = tool.display_name;
    if (icon) icon.textContent = tool.icon || "🛠️";
    const current = Number(tool.current_durability || 0);
    const maximum = Math.max(1, Number(tool.maximum_durability || 1));
    const percent = Math.max(0, Math.min(100, Math.round((current / maximum) * 100)));
    if (durability) durability.textContent = `${current} / ${maximum}`;
    if (fill) fill.style.width = `${percent}%`;

    const options = Array.isArray(tool.options) ? tool.options : [];
    if (repairMaterialSelect) {
        repairMaterialSelect.innerHTML = options.map((option) => `
            <option value="${escapeBlacksmithText(option.option_key)}" ${option.can_afford ? "" : "disabled"}>
                ${escapeBlacksmithText(option.label)} — You have ${Number(option.owned || 0).toLocaleString()}
            </option>
        `).join("") || '<option value="">No repair recipe available</option>';
    }

    const chosen = options.find((option) => option.option_key === repairMaterialSelect?.value) || options[0];
    if (details && chosen) {
        details.innerHTML = `
            <p>
                <span>🧰 Repair Cost</span>
                <span class="${chosen.can_afford ? "green" : "red"}">
                    ${Number(chosen.required).toLocaleString()} ${escapeBlacksmithText(chosen.material_name)}
                    (${Number(chosen.owned || 0).toLocaleString()} owned)
                </span>
            </p>
        `;
    }

    if (repairButton) {
        repairButton.disabled = !tool.damaged || !chosen?.can_afford;
        repairButton.textContent = tool.damaged ? "⚒️ Repair Tool" : "✅ Tool Fully Repaired";
    }
}


let villageForgeTimer = null;

async function loadVillageForgeStock() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const { data, error } = await supabaseClient
        .from("player_storage")
        .select("quantity, items!inner(name)")
        .eq("player_id", user.id)
        .in("items.name", ["Iron Bar", "Iron Arrowhead", "Spearhead"]);

    if (error) {
        document.getElementById("arrowhead-message").textContent = `Could not load stock: ${error.message}`;
        return;
    }

    const totals = { "Iron Bar": 0, "Iron Arrowhead": 0, "Spearhead": 0 };
    for (const row of data || []) totals[row.items?.name] = Number(row.quantity || 0);

    const arrowStock = document.getElementById("arrowhead-stock");
    const spearStock = document.getElementById("spearhead-stock");
    if (arrowStock) arrowStock.innerHTML = `<span>${totals["Iron Bar"].toLocaleString()} Iron Bars</span><span>${totals["Iron Arrowhead"].toLocaleString()} Arrowheads</span>`;
    if (spearStock) spearStock.innerHTML = `<span>${totals["Iron Bar"].toLocaleString()} Iron Bars</span><span>${totals["Spearhead"].toLocaleString()} Spearheads</span>`;
}

async function queueVillageForgeOrder(productKey) {
    const isArrowhead = productKey === "iron_arrowhead";
    const input = document.getElementById(isArrowhead ? "arrowhead-batches" : "spearhead-batches");
    const button = document.getElementById(isArrowhead ? "forge-arrowheads-button" : "forge-spearheads-button");
    const box = document.getElementById(isArrowhead ? "arrowhead-message" : "spearhead-message");
    const batches = Math.max(1, Math.min(1000, Number(input?.value || 1)));

    if (button) button.disabled = true;
    if (box) box.textContent = "Bjørn is accepting your order...";

    const { data, error } = await supabaseClient.rpc("queue_village_forge_order", {
        p_product_key: productKey,
        p_batches: batches
    });

    if (error) {
        if (box) box.textContent = `❌ ${error.message}`;
    } else {
        const product = isArrowhead ? "Iron Arrowheads" : "Spearheads";
        if (box) box.textContent = `✅ Order placed. ${data.batches} batches of ${product}; 25 arrive every 20 seconds.`;
        await Promise.all([loadVillageForgeStock(), loadVillageForgeStatus()]);
    }

    if (button) button.disabled = false;
}

function updateVillageForgeCountdown(nextBatchAt, status) {
    const countdown = document.getElementById("village-forge-countdown");
    if (!countdown) return;
    if (status !== "working" || !nextBatchAt) {
        countdown.textContent = status === "completed" ? "✅ Order completed." : "No active order.";
        return;
    }
    const seconds = Math.max(0, Math.ceil((new Date(nextBatchAt).getTime() - Date.now()) / 1000));
    countdown.textContent = `Next 25 pieces in ${seconds}s.`;
}

async function loadVillageForgeStatus() {
    const { data, error } = await supabaseClient.rpc("get_village_forge_status");
    const panel = document.getElementById("village-forge-order");
    const badge = document.getElementById("village-forge-order-badge");
    const fill = document.getElementById("village-forge-progress-fill");

    if (error) {
        if (panel) panel.innerHTML = `<p><span>Status</span><span class="red">${escapeBlacksmithText(error.message)}</span></p>`;
        return;
    }

    const order = data?.order;
    if (!order) {
        if (badge) badge.textContent = "No order";
        if (panel) panel.innerHTML = `<p><span>Status</span><span>Ready for work</span></p>`;
        if (fill) fill.style.width = "0%";
        updateVillageForgeCountdown(null, null);
        return;
    }

    const product = order.product_key === "iron_arrowhead" ? "Iron Arrowheads" : "Spearheads";
    const percent = Math.round((Number(order.batches_completed || 0) / Math.max(1, Number(order.batches_total || 1))) * 100);
    if (badge) badge.textContent = order.status === "working" ? "Working" : "Completed";
    if (panel) panel.innerHTML = `
        <p><span>Order</span><span>${escapeBlacksmithText(product)}</span></p>
        <p><span>Batches</span><span>${Number(order.batches_completed).toLocaleString()} / ${Number(order.batches_total).toLocaleString()}</span></p>
        <p><span>Delivered</span><span class="green">${Number(order.items_completed).toLocaleString()} / ${Number(order.items_total).toLocaleString()}</span></p>
    `;
    if (fill) fill.style.width = `${Math.min(100, percent)}%`;
    updateVillageForgeCountdown(order.next_batch_at, order.status);

    if (order.status === "working") {
        clearTimeout(villageForgeTimer);
        villageForgeTimer = setTimeout(async () => {
            await Promise.all([loadVillageForgeStatus(), loadVillageForgeStock()]);
        }, 1000);
    }
}

async function loadProfessionRepairs() {
    const stock = document.getElementById("repair-stock");
    const unlock = document.getElementById("repair-unlock-message");

    const { data, error } = await supabaseClient.rpc("get_repairable_profession_tools");
    if (error) {
        showBlacksmithMessage(`❌ ${escapeBlacksmithText(error.message)}`);
        return;
    }

    repairTools = Array.isArray(data?.tools) ? data.tools : [];
    const damagedTools = repairTools.filter((tool) => tool.damaged);

    if (stock) {
        stock.innerHTML = `
            <span>${repairTools.length.toLocaleString()} tools owned</span>
            <span>${damagedTools.length.toLocaleString()} need repairs</span>
        `;
    }

    if (!data?.repairs_unlocked) {
        if (unlock) unlock.innerHTML = '<p class="blacksmith-lock-message">🔒 Complete your first job for Bjørn the Blacksmith to unlock all tool repairs.</p>';
        if (repairToolSelect) repairToolSelect.innerHTML = '<option value="">Repairs locked</option>';
        if (repairButton) repairButton.disabled = true;
        showBlacksmithMessage("🔒 Finish one Blacksmith job first. After that, repairs use resources and never Silver.");
        return;
    }

    if (unlock) unlock.innerHTML = '<p class="green">✅ Repairs unlocked through Blacksmith work.</p>';

    const displayTools = damagedTools.length ? damagedTools : repairTools;
    if (repairToolSelect) {
        repairToolSelect.innerHTML = displayTools.map((tool) => `
            <option value="${escapeBlacksmithText(tool.equipment_key)}">
                ${escapeBlacksmithText(tool.icon || "🛠️")} ${escapeBlacksmithText(tool.display_name)} —
                ${Number(tool.current_durability)}/${Number(tool.maximum_durability)}
            </option>
        `).join("") || '<option value="">No profession tools owned</option>';
    }

    updateRepairMaterialOptions();
    if (!damagedTools.length && repairTools.length) showBlacksmithMessage("✅ Every profession tool is fully repaired.");
}

async function repairSelectedTool() {
    const tool = selectedRepairTool();
    const optionKey = repairMaterialSelect?.value;
    if (!tool || !optionKey) return;

    repairButton.disabled = true;
    showBlacksmithMessage(`⚒️ Repairing ${escapeBlacksmithText(tool.display_name)}...`);

    const { data, error } = await supabaseClient.rpc("repair_profession_equipment", {
        p_equipment_key: tool.equipment_key,
        p_option_key: optionKey
    });

    if (error) {
        showBlacksmithMessage(`❌ ${escapeBlacksmithText(error.message)}`);
        repairButton.disabled = false;
        return;
    }

    showBlacksmithMessage(`✅ ${escapeBlacksmithText(data.display_name)} repaired using ${Number(data.material_quantity).toLocaleString()} ${escapeBlacksmithText(data.material_used)}.`);
    await loadProfessionRepairs();
}

async function loadBlacksmithCardStock() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const quantities = await getPlayerInventoryQuantities(user.id, [WOODEN_SHAFT, IRON_AXE_HEAD]);
    const shafts = Number(quantities[WOODEN_SHAFT] || 0);
    const heads = Number(quantities[IRON_AXE_HEAD] || 0);
    const stock = document.getElementById("iron-axe-stock");
    if (stock) stock.innerHTML = `
        <span>You have ${shafts.toLocaleString()} Wooden Shafts</span>
        <span>You have ${heads.toLocaleString()} Iron Axe Heads</span>
        <span>You can make ${Math.min(shafts, heads).toLocaleString()} Iron Axes</span>
    `;
}

async function craftIronAxe() {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) return;


    /* =====================================
       LOAD MATERIALS
    ===================================== */

    const {
        data: shaftItem,
        error: shaftError
    } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", WOODEN_SHAFT)
        .maybeSingle();

    if (shaftError) {
        showCraftAxeMessage(
            "❌ Wooden Shaft failed to load: " +
            shaftError.message
        );
        return;
    }

    const {
        data: axeHeadItem,
        error: axeHeadError
    } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("player_id", user.id)
        .eq("item_id", IRON_AXE_HEAD)
        .maybeSingle();

    if (axeHeadError) {
        showCraftAxeMessage(
            "❌ Iron Axe Head failed to load: " +
            axeHeadError.message
        );
        return;
    }


    /* =====================================
       CHECK MATERIALS
    ===================================== */

    if (!shaftItem || shaftItem.quantity < 1) {
        showCraftAxeMessage(
            "❌ You need 1 Wooden Shaft."
        );
        return;
    }

    if (!axeHeadItem || axeHeadItem.quantity < 1) {
        showCraftAxeMessage(
            "❌ You need 1 Iron Axe Head."
        );
        return;
    }


    /* =====================================
       LOAD EQUIPPED AXE SLOT
    ===================================== */

    const {
        data: equippedAxe,
        error: equipmentError
    } = await supabaseClient
        .from("equipment")
        .select("*")
        .eq("player_id", user.id)
        .eq("slot", "axe")
        .eq("is_equipped", true)
        .maybeSingle();

    if (equipmentError) {
        showCraftAxeMessage(
            "❌ Equipment failed to load: " +
            equipmentError.message
        );
        return;
    }


    /* =====================================
       EQUIP IRON AXE
    ===================================== */

    if (equippedAxe) {

        const { error: equipError } =
            await supabaseClient
                .from("equipment")
                .update({
                    item_id: IRON_AXE,
                    durability: 100,
                    max_durability: 100
                })
                .eq("id", equippedAxe.id);

        if (equipError) {
            showCraftAxeMessage(
                "❌ Iron Axe failed to equip: " +
                equipError.message
            );
            return;
        }

    } else {

        const { error: equipInsertError } =
            await supabaseClient
                .from("equipment")
                .insert({
                    player_id: user.id,
                    item_id: IRON_AXE,
                    slot: "axe",
                    durability: 100,
                    max_durability: 100,
                    is_equipped: true
                });

        if (equipInsertError) {
            showCraftAxeMessage(
                "❌ Iron Axe failed to equip: " +
                equipInsertError.message
            );
            return;
        }
    }


    /* =====================================
       REMOVE WOODEN SHAFT
    ===================================== */

    const newShaftQuantity =
        shaftItem.quantity - 1;

    if (newShaftQuantity > 0) {

        const { error: shaftUpdateError } =
            await supabaseClient
                .from("inventory")
                .update({
                    quantity: newShaftQuantity
                })
                .eq("id", shaftItem.id);

        if (shaftUpdateError) {
            showCraftAxeMessage(
                "❌ Wooden Shaft failed to update: " +
                shaftUpdateError.message
            );
            return;
        }

    } else {

        const { error: shaftDeleteError } =
            await supabaseClient
                .from("inventory")
                .delete()
                .eq("id", shaftItem.id);

        if (shaftDeleteError) {
            showCraftAxeMessage(
                "❌ Wooden Shaft failed to update: " +
                shaftDeleteError.message
            );
            return;
        }
    }


    /* =====================================
       REMOVE IRON AXE HEAD
    ===================================== */

    const newAxeHeadQuantity =
        axeHeadItem.quantity - 1;

    if (newAxeHeadQuantity > 0) {

        const { error: headUpdateError } =
            await supabaseClient
                .from("inventory")
                .update({
                    quantity: newAxeHeadQuantity
                })
                .eq("id", axeHeadItem.id);

        if (headUpdateError) {
            showCraftAxeMessage(
                "❌ Iron Axe Head failed to update: " +
                headUpdateError.message
            );
            return;
        }

    } else {

        const { error: headDeleteError } =
            await supabaseClient
                .from("inventory")
                .delete()
                .eq("id", axeHeadItem.id);

        if (headDeleteError) {
            showCraftAxeMessage(
                "❌ Iron Axe Head failed to update: " +
                headDeleteError.message
            );
            return;
        }
    }


    /* =====================================
       SHOW SUCCESS
    ===================================== */

    if (typeof incrementGameStatistics === "function") {
        await incrementGameStatistics({
            items_crafted: 1,
            blacksmith_items_crafted: 1
        });
    }

    if (typeof logGameActivity === "function") {
        await logGameActivity(
            "iron_axe_crafted",
            {
                equipped: true
            }
        );
    }

    showCraftAxeMessage(
        "⚒️ You craft and equip your first " +
        "<strong>Iron Axe</strong>!"
    );

    await Promise.all([
        loadAxeRepairInfo(),
        loadBlacksmithCardStock()
    ]);

    if (typeof loadHomePage === "function") {
        loadHomePage();
    }
}




repairToolSelect?.addEventListener("change", updateRepairMaterialOptions);
repairMaterialSelect?.addEventListener("change", updateRepairMaterialOptions);
repairButton?.addEventListener("click", repairSelectedTool);
craftIronAxeButton?.addEventListener("click", craftIronAxe);

document.addEventListener("DOMContentLoaded", async () => {
    document.getElementById("forge-arrowheads-button")?.addEventListener("click", () => queueVillageForgeOrder("iron_arrowhead"));
    document.getElementById("forge-spearheads-button")?.addEventListener("click", () => queueVillageForgeOrder("spearhead"));
    await Promise.all([loadVillageForgeStock(), loadVillageForgeStatus()]);
    if (typeof loadGameComponents === "function") await loadGameComponents();
    await Promise.all([loadProfessionRepairs(), loadBlacksmithCardStock()]);
});
