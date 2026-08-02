"use strict";

const equipmentCategories = [
    ["armour", "🪖 Armour"],
    ["main_hand", "⚔️ Main Hand"],
    ["off_hand", "🗡️ Off Hand"],
    ["ranged", "🏹 Ranged"],
    ["ammo", "🎯 Ammo"],
    ["defence", "🛡️ Defence"],
    ["accessory", "💍 Accessories"],
    ["utility", "🎒 Tools"]
];

let activeEquipmentCategory = "armour";
let bedroomData = null;

function equipmentEscape(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function showBedroomMessage(message, isError = false) {
    const element = document.getElementById("equipment-message");

    if (!element) {
        return;
    }

    element.textContent = message || "";
    element.classList.toggle("error", isError);
}

function renderEquipmentTabs() {
    const tabs = document.getElementById("equipment-tabs");

    if (!tabs) {
        return;
    }

    tabs.innerHTML = equipmentCategories
        .map(([key, label]) => `
            <button
                type="button"
                data-equipment-category="${key}"
                class="${key === activeEquipmentCategory ? "active" : ""}"
            >
                ${label}
            </button>
        `)
        .join("");

    tabs.querySelectorAll("[data-equipment-category]").forEach((button) => {
        button.addEventListener("click", () => {
            activeEquipmentCategory = button.dataset.equipmentCategory;
            renderBedroom();
        });
    });
}

async function loadBedroom() {
    showBedroomMessage("Loading your equipment...");

    const {
        data: { session },
        error: sessionError
    } = await supabaseClient.auth.getSession();

    if (sessionError || !session?.user) {
        showBedroomMessage(
            sessionError?.message || "Your session could not be loaded. Please sign in again.",
            true
        );
        return;
    }

    const { data, error } = await supabaseClient.rpc("get_bedroom_equipment");

    if (error) {
        console.error("Could not load bedroom equipment:", error);
        showBedroomMessage(`Could not load equipment: ${error.message}`, true);

        const list = document.getElementById("equipment-list");
        if (list) {
            list.innerHTML = `
                <div class="equipment-load-error">
                    <p>The equipment could not be loaded.</p>
                    <button type="button" id="retry-bedroom-load">Try Again</button>
                </div>
            `;

            document
                .getElementById("retry-bedroom-load")
                ?.addEventListener("click", loadBedroom);
        }

        return;
    }

    bedroomData = data || {};
    renderEquipmentTabs();
    renderBedroom();
    showBedroomMessage("");
}

function renderBedroom() {
    if (!bedroomData) {
        return;
    }

    document.querySelectorAll("[data-equipment-category]").forEach((button) => {
        button.classList.toggle(
            "active",
            button.dataset.equipmentCategory === activeEquipmentCategory
        );
    });

    const equipped = Array.isArray(bedroomData.equipped)
        ? bedroomData.equipped
        : [];

    const items = (Array.isArray(bedroomData.items) ? bedroomData.items : [])
        .filter((item) => item.category === activeEquipmentCategory);

    const summary = document.getElementById("equipped-summary");
    const totals = document.getElementById("equipment-totals");
    const list = document.getElementById("equipment-list");

    if (summary) {
        summary.innerHTML = equipped.length
            ? equipped
                .map((item) => `
                    <div class="equipped-line">
                        <strong>${equipmentEscape(item.slot_label)}:</strong>
                        <span>${equipmentEscape(item.name)}</span>
                    </div>
                `)
                .join("")
            : "Nothing equipped.";
    }

    if (totals) {
        totals.innerHTML = `
            <div class="equipment-total">
                ⚔️ Damage ${Number(bedroomData.total_damage || 0)}
                · 🛡️ Defence ${Number(bedroomData.total_defence || 0)}
                · 🎯 Accuracy ${Number(bedroomData.total_accuracy || 0)}
            </div>
        `;
    }

    if (!list) {
        return;
    }

    list.innerHTML = items.length
        ? items
            .map((item) => `
                <article class="equipment-item ${item.equipped ? "equipped" : ""}">
                    <h3>
                        ${equipmentEscape(item.name)}
                        ${item.equipped ? "(Equipped)" : ""}
                    </h3>

                    <p>${equipmentEscape(item.description || "")}</p>

                    <div class="equipment-stats">
                        <span>⚔️ ${Number(item.damage || 0)}</span>
                        <span>🛡️ ${Number(item.defence || 0)}</span>
                        <span>🎯 ${Number(item.accuracy || 0)}</span>
                        <span>📦 ${Number(item.quantity || 0)}</span>
                        ${item.maximum_durability !== null && item.maximum_durability !== undefined
                            ? `<span>🔧 ${Number(item.current_durability || 0)} / ${Number(item.maximum_durability || 0)}</span>`
                            : ""}
                    </div>

                    <button
                        type="button"
                        data-equip-item="${Number(item.item_id)}"
                        data-equip-slot="${equipmentEscape(item.slot_key)}"
                    >
                        ${item.equipped ? "Remove" : "Equip"}
                    </button>
                </article>
            `)
            .join("")
        : "<p>No items in this category yet.</p>";

    list.querySelectorAll("[data-equip-item]").forEach((button) => {
        button.addEventListener("click", async () => {
            button.disabled = true;
            showBedroomMessage("Updating equipment...");

            const { error } = await supabaseClient.rpc("set_equipped_item", {
                p_slot_key: button.dataset.equipSlot,
                p_item_id: Number(button.dataset.equipItem)
            });

            if (error) {
                button.disabled = false;
                showBedroomMessage(error.message, true);
                return;
            }

            showBedroomMessage("Equipment updated.");
            await loadBedroom();
        });
    });
}

async function initialiseBedroomPage() {
    // The equipment RPC is deliberately not blocked by the shared sidebar and
    // top-bar loader. If a component has a temporary problem, the Bedroom can
    // still load and clearly show its own error state.
    const componentPromise = typeof loadGameComponents === "function"
        ? loadGameComponents().catch((error) => {
            console.error("Shared components failed to load:", error);
        })
        : Promise.resolve();

    await Promise.allSettled([
        componentPromise,
        loadBedroom()
    ]);
}

document.addEventListener("DOMContentLoaded", initialiseBedroomPage);
