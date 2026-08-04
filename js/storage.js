const STORAGE_GROUPS = {
    Wood: {
        icon: "🪵",
        description: "Timber, planks and wooden materials."
    },
    Ore: {
        icon: "⛏️",
        description: "Raw stone, ore and mining materials."
    },
    Metal: {
        icon: "⚒️",
        description: "Bars, nails, hoops and forged materials."
    },
    Food: {
        icon: "🍖",
        description: "Food ingredients and prepared meals."
    },
    Barrels: {
        icon: "🍺",
        description: "Barrels, mead and brewing supplies."
    },
    Healing: {
        icon: "🌿",
        description: "Herbs, remedies and medical materials."
    },
    Other: {
        icon: "📦",
        description: "All other stored resources."
    }
};

let activeStorageGroup = "Wood";
let storageGroups = {};
let currentPlayer = null;
let activeCart = null;

function storageWeightText(value) {
    const number = Number(value || 0);

    return `${number.toFixed(number < 10 ? 2 : 1)}kg`;
}

function storagePercent(current, maximum) {
    if (!maximum || maximum <= 0) {
        return 0;
    }

    return Math.min(100, (current / maximum) * 100);
}

function setStorageMessage(message, type = "info") {
    const element = document.getElementById("storage-message");

    if (!element) {
        return;
    }

    element.className = `storage-message storage-message-${type}`;
    element.textContent = message;
}

function getStorageGroup(row) {
    const name = String(row.items?.name || "").toLowerCase();
    const type = String(row.items?.type || "").toLowerCase();
    const category = String(row.items?.category || "").toLowerCase();

    if (
        name.includes("bandage") ||
        name.includes("medicine") ||
        name.includes("salve") ||
        name.includes("poultice") ||
        name.includes("yarrow") ||
        name.includes("plantain") ||
        name.includes("chamomile") ||
        name.includes("nettle") ||
        name.includes("comfrey") ||
        name.includes("willow bark") ||
        type.includes("healing") ||
        category.includes("healing")
    ) {
        return "Healing";
    }

    if (
        name.includes("log") ||
        name.includes("plank") ||
        name.includes("beam") ||
        name.includes("stick") ||
        name.includes("wood")
    ) {
        return "Wood";
    }

    if (
        name.includes("ore") ||
        name.includes("bog iron") ||
        name.includes("rock") ||
        name.includes("stone") ||
        name.includes("flint") ||
        name.includes("clay")
    ) {
        return "Ore";
    }

    if (
        name.includes("iron bar") ||
        name.includes("metal") ||
        name.includes("hoop") ||
        name.includes("nail")
    ) {
        return "Metal";
    }

    if (
        name.includes("mead") ||
        name.includes("barrel") ||
        type.includes("drink") ||
        category.includes("drink")
    ) {
        return "Barrels";
    }

    if (
        type.includes("food") ||
        category.includes("food")
    ) {
        return "Food";
    }

    return "Other";
}

async function upsertStorage(playerId, itemId, quantity) {
    const { data: row, error } = await supabaseClient
        .from("player_storage")
        .select("id, quantity")
        .eq("player_id", playerId)
        .eq("item_id", itemId)
        .maybeSingle();

    if (error) {
        throw error;
    }

    if (row) {
        const { error: updateError } = await supabaseClient
            .from("player_storage")
            .update({
                quantity: Number(row.quantity) + Number(quantity)
            })
            .eq("id", row.id);

        if (updateError) {
            throw updateError;
        }

        return;
    }

    const { error: insertError } = await supabaseClient
        .from("player_storage")
        .insert({
            player_id: playerId,
            item_id: itemId,
            quantity
        });

    if (insertError) {
        throw insertError;
    }
}

function renderStorageTabs() {
    const tabs = document.getElementById("storage-tabs");

    tabs.innerHTML = Object.entries(STORAGE_GROUPS)
        .map(([groupName, details]) => {
            const count = storageGroups[groupName]?.length || 0;
            const activeClass =
                activeStorageGroup === groupName ? "active" : "";

            return `
                <button
                    class="storage-tab ${activeClass}"
                    data-storage-group="${groupName}"
                    type="button"
                >
                    <span>${details.icon}</span>
                    <strong>${groupName}</strong>
                    <small>${count}</small>
                </button>
            `;
        })
        .join("");

    tabs.querySelectorAll("[data-storage-group]").forEach(button => {
        button.addEventListener("click", () => {
            activeStorageGroup = button.dataset.storageGroup;
            renderStorageTabs();
            renderStorageItems();
        });
    });
}

function renderStorageItems() {
    const groupDetails = STORAGE_GROUPS[activeStorageGroup];
    const rows = storageGroups[activeStorageGroup] || [];

    document.getElementById("storage-category-title").textContent =
        `${groupDetails.icon} ${activeStorageGroup}`;

    document.getElementById("storage-category-description").textContent =
        groupDetails.description;

    document.getElementById("storage-category-count").textContent =
        `${rows.length} ${rows.length === 1 ? "item" : "items"}`;

    const container = document.getElementById("storage-items");

    if (rows.length === 0) {
        container.innerHTML = `
            <div class="storage-empty">
                <span>${groupDetails.icon}</span>
                <p>No ${activeStorageGroup.toLowerCase()} resources stored.</p>
            </div>
        `;

        return;
    }

    container.innerHTML = rows
        .map(row => {
            const quantity = Number(row.quantity || 0);
            const weightEach = Number(row.items?.weight_kg || 0);
            const totalWeight = quantity * weightEach;

            return `
                <article class="storage-item-row">

                    <div class="storage-item-details">
                        <strong>${row.items?.name || "Unknown item"}</strong>

                        <span>
                            Stored: ${quantity.toLocaleString()}
                            · ${storageWeightText(weightEach)} each
                            · ${storageWeightText(totalWeight)} total
                        </span>
                    </div>

                    <div class="storage-load-controls">

                        <label>
                            Quantity
                            <input
                                type="number"
                                min="1"
                                max="${quantity}"
                                value="1"
                                class="storage-quantity-input"
                                id="storage-quantity-${row.item_id}"
                            >
                        </label>

                        <div class="storage-quick-amounts">
                            <button
                                type="button"
                                onclick="setStorageQuantity(${row.item_id}, 1, ${quantity})"
                            >
                                1
                            </button>

                            <button
                                type="button"
                                onclick="setStorageQuantity(${row.item_id}, 10, ${quantity})"
                            >
                                10
                            </button>

                            <button
                                type="button"
                                onclick="setStorageQuantity(${row.item_id}, 25, ${quantity})"
                            >
                                25
                            </button>

                            <button
                                type="button"
                                onclick="setStorageQuantity(${row.item_id}, 100, ${quantity})"
                            >
                                100
                            </button>

                            <button
                                type="button"
                                onclick="setStorageQuantity(${row.item_id}, ${quantity}, ${quantity})"
                            >
                                All
                            </button>
                        </div>

                        <div class="storage-destination-buttons">
                            ${getConsumableAction(row) ? `
                                <button
                                    type="button"
                                    class="storage-consume-button"
                                    onclick="consumeStoredItem(${row.item_id}, '${getConsumableAction(row)}')"
                                >
                                    ${getConsumableAction(row) === "Eat" ? "🍖 Eat" : "🩹 Use"}
                                </button>
                            ` : ""}

                            <button
                                type="button"
                                onclick="loadSelectedStorageItem(${row.item_id}, 'backpack')"
                            >
                                🎒 Backpack
                            </button>

                            <button
                                type="button"
                                onclick="loadSelectedStorageItem(${row.item_id}, 'cart')"
                            >
                                🛒 Transport
                            </button>
                        </div>

                    </div>

                </article>
            `;
        })
        .join("");
}


function getConsumableAction(row) {
    const name = String(row.items?.name || "").toLowerCase();
    const type = String(row.items?.type || "").toLowerCase();
    const category = String(row.items?.category || "").toLowerCase();

    if (
        name.includes("bandage") ||
        name.includes("medicine") ||
        name.includes("salve") ||
        name.includes("poultice") ||
        type.includes("medicine") ||
        category.includes("healing")
    ) {
        return "Use";
    }

    if (
        name.includes("meat") ||
        name.includes("egg") ||
        name.includes("broth") ||
        type.includes("food") ||
        category.includes("food")
    ) {
        return "Eat";
    }

    return "";
}

async function consumeStoredItem(itemId, actionLabel) {
    try {
        setStorageMessage(`${actionLabel === "Eat" ? "Eating" : "Using"} item...`, "info");

        const { data, error } = await supabaseClient.rpc(
            "consume_food_item",
            { p_item_id: itemId }
        );

        if (error) {
            throw error;
        }

        const energy = Number(data?.energy_change || 0);
        const health = Number(data?.health_change || 0);
        const changes = [];

        if (energy) changes.push(`${energy > 0 ? "+" : ""}${energy} Energy`);
        if (health) changes.push(`${health > 0 ? "+" : ""}${health} HP`);

        setStorageMessage(
            `${data?.item_name || "Item"} ${actionLabel === "Eat" ? "eaten" : "used"}${changes.length ? ` — ${changes.join(", ")}` : ""}. ` +
            `${data?.food_used_last_24_hours || 0}/${data?.food_limit_24_hours || 24} consumed in the last 24 hours.`,
            health < 0 ? "warning" : "success"
        );

        await loadStorage();
    } catch (error) {
        setStorageMessage(error.message || "The item could not be used.", "error");
    }
}

function setStorageQuantity(itemId, amount, maximum) {
    const input = document.getElementById(`storage-quantity-${itemId}`);

    if (!input) {
        return;
    }

    input.value = Math.max(
        1,
        Math.min(Number(amount), Number(maximum))
    );
}

async function loadSelectedStorageItem(itemId, destination) {
    const input = document.getElementById(`storage-quantity-${itemId}`);
    const quantity = Math.floor(Number(input?.value || 0));

    if (!Number.isFinite(quantity) || quantity < 1) {
        setStorageMessage("Enter a valid quantity.", "error");
        return;
    }

    await loadFromStorage(itemId, quantity, destination);
}

function renderWeightDisplay(elementId, current, maximum, label) {
    const element = document.getElementById(elementId);
    const percentage = storagePercent(current, maximum);

    element.innerHTML = `
        <div class="storage-capacity">
            <div class="storage-capacity-row">
                <span>${label}</span>
                <strong>
                    ${storageWeightText(current)}
                    /
                    ${storageWeightText(maximum)}
                </strong>
            </div>

            <div class="weight-bar">
                <span style="width: ${percentage}%"></span>
            </div>

            <small>${percentage.toFixed(0)}% full</small>
        </div>
    `;
}

function renderCarriedItems(elementId, rows, emptyText) {
    const element = document.getElementById(elementId);

    if (!rows || rows.length === 0) {
        element.innerHTML = `<p class="storage-empty-text">${emptyText}</p>`;
        return;
    }

    element.innerHTML = rows
        .map(row => {
            const quantity = Number(row.quantity || 0);
            const weight = quantity * Number(row.items?.weight_kg || 0);

            return `
                <div class="storage-carry-row">
                    <span>
                        <strong>${row.items?.name || "Unknown item"}</strong>
                        <small>${quantity.toLocaleString()} carried</small>
                    </span>

                    <strong>${storageWeightText(weight)}</strong>
                </div>
            `;
        })
        .join("");
}

async function loadStorage() {
    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) {
        return;
    }

    const [
        playerResult,
        storageResult,
        cartResult,
        backpackResult
    ] = await Promise.all([
        supabaseClient
            .from("players")
            .select("backpack_capacity_kg")
            .eq("id", user.id)
            .single(),

        supabaseClient
            .from("player_storage")
            .select(`
                item_id,
                quantity,
                items(
                    name,
                    type,
                    category,
                    weight_kg
                )
            `)
            .eq("player_id", user.id)
            .gt("quantity", 0),

        supabaseClient
            .from("player_carts")
            .select(`
                id,
                name,
                capacity,
                capacity_kg,
                transport_type
            `)
            .eq("player_id", user.id)
            .eq("is_active", true)
            .maybeSingle(),

        supabaseClient
            .from("inventory")
            .select(`
                quantity,
                items(
                    name,
                    weight_kg
                )
            `)
            .eq("player_id", user.id)
            .gt("quantity", 0)
    ]);

    if (playerResult.error) {
        setStorageMessage(playerResult.error.message, "error");
        return;
    }

    if (storageResult.error) {
        setStorageMessage(storageResult.error.message, "error");
        return;
    }

    currentPlayer = playerResult.data;
    activeCart = cartResult.data;

    storageGroups = {};

    Object.keys(STORAGE_GROUPS).forEach(groupName => {
        storageGroups[groupName] = [];
    });

    for (const row of storageResult.data || []) {
        const group = getStorageGroup(row);
        storageGroups[group].push(row);
    }

    Object.values(storageGroups).forEach(rows => {
        rows.sort((first, second) =>
            String(first.items?.name || "").localeCompare(
                String(second.items?.name || "")
            )
        );
    });

    renderStorageTabs();
    renderStorageItems();

    const backpackRows = backpackResult.data || [];

    const backpackWeight = backpackRows.reduce(
        (total, row) =>
            total +
            Number(row.quantity || 0) *
            Number(row.items?.weight_kg || 0),
        0
    );

    const backpackCapacity =
        Number(currentPlayer?.backpack_capacity_kg || 25);

    renderWeightDisplay(
        "backpack-capacity",
        backpackWeight,
        backpackCapacity,
        "Backpack capacity"
    );

    renderCarriedItems(
        "backpack-items",
        backpackRows,
        "Your backpack is empty."
    );

    if (!activeCart) {
        document.getElementById("transport-capacity").innerHTML = `
            <p class="storage-empty-text">
                No active transport. Repair the Wooden Handcart in your
                Wagon Shed.
            </p>
        `;

        document.getElementById("transport-items").innerHTML = "";

        document.getElementById("unload-cart-button").disabled = true;
        return;
    }

    const { data: cartItems, error: cartItemsError } =
        await supabaseClient
            .from("cart_items")
            .select(`
                quantity,
                items(
                    name,
                    weight_kg
                )
            `)
            .eq("cart_id", activeCart.id);

    if (cartItemsError) {
        setStorageMessage(cartItemsError.message, "error");
        return;
    }

    const transportWeight = (cartItems || []).reduce(
        (total, row) =>
            total +
            Number(row.quantity || 0) *
            Number(row.items?.weight_kg || 0),
        0
    );

    const transportCapacity =
        Number(activeCart.capacity_kg || activeCart.capacity || 250);

    renderWeightDisplay(
        "transport-capacity",
        transportWeight,
        transportCapacity,
        `${activeCart.name || "Transport"} capacity`
    );

    renderCarriedItems(
        "transport-items",
        cartItems || [],
        "Your transport is empty."
    );

    document.getElementById("unload-cart-button").disabled = false;
}

async function loadFromStorage(itemId, amount, destination) {
    try {
        setStorageMessage("Loading resources...", "info");

        const { data, error } = await supabaseClient.rpc(
            "load_storage_item",
            {
                p_item_id: itemId,
                p_quantity: amount,
                p_destination: destination
            }
        );

        if (error) {
            throw error;
        }

        const loadedQuantity = Number(
            data?.quantity ??
            data?.loaded_quantity ??
            amount
        );

        setStorageMessage(
            `✅ Loaded ${loadedQuantity.toLocaleString()} item${
                loadedQuantity === 1 ? "" : "s"
            } into ${destination === "cart" ? "transport" : "backpack"}.`,
            "success"
        );

        await loadStorage();
    } catch (error) {
        setStorageMessage(`❌ ${error.message}`, "error");
    }
}

async function unloadCart() {
    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!activeCart) {
        setStorageMessage("No active transport.", "error");
        return;
    }

    try {
        const { data: items, error } = await supabaseClient
            .from("cart_items")
            .select("*")
            .eq("cart_id", activeCart.id);

        if (error) {
            throw error;
        }

        if (!items || items.length === 0) {
            setStorageMessage("Your transport is already empty.", "info");
            return;
        }

        for (const item of items) {
            await upsertStorage(
                user.id,
                item.item_id,
                item.quantity
            );
        }

        const { error: deleteError } = await supabaseClient
            .from("cart_items")
            .delete()
            .eq("cart_id", activeCart.id);

        if (deleteError) {
            throw deleteError;
        }

        setStorageMessage(
            "✅ Transport unloaded into the Storage Yard.",
            "success"
        );

        await loadStorage();
    } catch (error) {
        setStorageMessage(`❌ ${error.message}`, "error");
    }
}

async function unloadBackpack() {
    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    try {
        const { data: items, error } = await supabaseClient
            .from("inventory")
            .select("*")
            .eq("player_id", user.id)
            .gt("quantity", 0);

        if (error) {
            throw error;
        }

        if (!items || items.length === 0) {
            setStorageMessage("Your backpack is already empty.", "info");
            return;
        }

        for (const item of items) {
            await upsertStorage(
                user.id,
                item.item_id,
                item.quantity
            );
        }

        const { error: deleteError } = await supabaseClient
            .from("inventory")
            .delete()
            .eq("player_id", user.id);

        if (deleteError) {
            throw deleteError;
        }

        setStorageMessage(
            "✅ Backpack unloaded into the Storage Yard.",
            "success"
        );

        await loadStorage();
    } catch (error) {
        setStorageMessage(`❌ ${error.message}`, "error");
    }
}

document
    .getElementById("unload-cart-button")
    ?.addEventListener("click", unloadCart);

document
    .getElementById("unload-backpack-button")
    ?.addEventListener("click", unloadBackpack);

loadStorage();