"use strict";

let wagonBuilderProducts = [];
let wagonBuilderCategory = "all";
let wagonBuilderSilver = 0;

function wagonBuilderSafe(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function wagonPartIcon(code) {
    if (code.includes("wheel")) return "🛞";
    if (code.includes("axle")) return "🪵";
    if (code.includes("iron")) return "🔩";
    if (code.includes("board")) return "🪚";
    if (code.includes("harness")) return "🐴";
    return "🧰";
}

function renderWagonBuilder() {
    const grid = document.getElementById("wagon-builder-grid");
    if (!grid) return;

    const products = wagonBuilderCategory === "all"
        ? wagonBuilderProducts
        : wagonBuilderProducts.filter(product => product.category === wagonBuilderCategory);

    grid.innerHTML = products.map(product => {
        const canAfford = wagonBuilderSilver >= Number(product.price_silver);
        return `
            <article class="wagon-part-card">
                <div class="wagon-part-icon">${wagonPartIcon(product.product_code)}</div>
                <span class="wagon-part-tier">${wagonBuilderSafe(product.tier_name)}</span>
                <h3>${wagonBuilderSafe(product.items?.name || product.product_name)}</h3>
                <p class="wagon-part-description">${wagonBuilderSafe(product.description)}</p>
                <div class="wagon-part-meta">
                    <span>${Number(product.items?.weight_kg || 0).toFixed(1)}kg each</span>
                    <span class="wagon-part-price">🪙 ${Number(product.price_silver).toLocaleString()}</span>
                </div>
                <div class="wagon-buy-row">
                    <input id="wagon-qty-${product.product_code}" type="number" min="1" max="99" value="1" aria-label="Quantity">
                    <button class="wagon-buy-button" data-product-code="${wagonBuilderSafe(product.product_code)}" ${canAfford ? "" : "disabled"}>
                        ${canAfford ? "Buy Part" : "Not Enough Silver"}
                    </button>
                </div>
            </article>`;
    }).join("") || "<p>No parts are available in this category.</p>";

    grid.querySelectorAll(".wagon-buy-button").forEach(button => {
        button.addEventListener("click", () => buyWagonPart(button.dataset.productCode));
    });
}

async function loadWagonBuilder() {
    const message = document.getElementById("wagon-builder-message");
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;

        const [playerResult, productsResult] = await Promise.all([
            supabaseClient.from("players").select("silver").eq("id", user.id).single(),
            supabaseClient
                .from("wagon_builder_products")
                .select("product_code,product_name,category,tier_name,description,price_silver,sort_order,item_id,items(name,weight_kg)")
                .eq("is_active", true)
                .order("sort_order")
        ]);

        if (playerResult.error) throw playerResult.error;
        if (productsResult.error) throw productsResult.error;

        wagonBuilderSilver = Number(playerResult.data?.silver || 0);
        wagonBuilderProducts = productsResult.data || [];
        document.getElementById("wagon-builder-silver").textContent = `${wagonBuilderSilver.toLocaleString()} Silver`;
        renderWagonBuilder();
    } catch (error) {
        console.error("Wagon Builder failed:", error);
        message.textContent = "❌ Run migration 012_wagon_builder_shop.sql before using this page.";
    }
}

async function buyWagonPart(productCode) {
    const quantityInput = document.getElementById(`wagon-qty-${productCode}`);
    const quantity = Math.max(1, Math.min(99, Math.floor(Number(quantityInput?.value || 1))));
    const message = document.getElementById("wagon-builder-message");

    try {
        message.textContent = "The wheelwright is preparing your order…";
        const { data, error } = await supabaseClient.rpc("buy_wagon_builder_part", {
            p_product_code: productCode,
            p_quantity: quantity
        });
        if (error) throw error;

        message.textContent = `✅ Bought ${quantity} × ${data.item_name} for ${Number(data.total_price).toLocaleString()} Silver. Sent to Storage Yard.`;
        await loadWagonBuilder();
    } catch (error) {
        message.textContent = `❌ ${error.message}`;
    }
}

document.querySelectorAll(".wagon-tab").forEach(button => {
    button.addEventListener("click", () => {
        document.querySelectorAll(".wagon-tab").forEach(tab => tab.classList.remove("active"));
        button.classList.add("active");
        wagonBuilderCategory = button.dataset.category;
        renderWagonBuilder();
    });
});

loadWagonBuilder();
