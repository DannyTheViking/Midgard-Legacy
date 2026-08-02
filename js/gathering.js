/* ============================================================
   MIDGARD LEGACY - SHARED GATHERING ENGINE
   ============================================================ */

const gatheringState = {
    nodes: [],
    activeProfession: "all",
    busyNodeKey: null,
    skillLevels: {},
    skillXp: {},
    accessByNode: {},
    equipment: [],
    bait: { full_buckets: 0, current_bucket_uses: 0 }
};

const gatheringProfessions = new Set([
    "all",
    "woodcutting",
    "mining",
    "foraging",
    "fishing",
    "hunting"
]);

function gatheringElement(id) {
    return document.getElementById(id);
}

function escapeGatheringText(value) {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
}

function showGatheringMessage(message, type = "info") {
    const box = gatheringElement("gathering-message");

    if (!box) {
        return;
    }

    box.className = `gathering-engine-message ${type}`;
    box.innerHTML = message;
}

function getInitialProfession() {
    const fixedProfession = document.body.dataset.gatheringProfession;
    const urlProfession = new URLSearchParams(window.location.search).get("profession");
    const requested = urlProfession || fixedProfession || "all";

    return gatheringProfessions.has(requested)
        ? requested
        : "all";
}

async function loadGatheringNodes() {
    showGatheringMessage("Loading gathering locations...");

    const { data, error } = await supabaseClient.rpc("get_my_gathering_screen");

    if (error) {
        throw error;
    }

    gatheringState.nodes = data?.nodes || [];
    gatheringState.skillLevels = data?.skill_levels || {};
    gatheringState.skillXp = data?.skill_xp || {};
    gatheringState.accessByNode = Object.fromEntries(
        gatheringState.nodes.map((node) => [node.node_key, node])
    );

    renderGatheringNodes();
    renderGatheringSkillCard();
    renderGatheringEquipmentCard();

    showGatheringMessage(
        "Choose an activity. Locked activities show exactly what you need.",
        "success"
    );
}


function formatProfessionName(profession) {
    return String(profession || "")
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderGatheringSkillCard() {
    const card = gatheringElement("gathering-skill-card");
    if (!card) return;

    const profession = gatheringState.activeProfession;
    if (profession === "all") {
        card.hidden = true;
        card.innerHTML = "";
        return;
    }

    const level = Number(gatheringState.skillLevels[profession] || 1);
    const xp = Number(gatheringState.skillXp[profession] || 0);
    const currentFloor = Math.round(100 * Math.pow(Math.max(0, level - 1), 3));
    const nextFloor = level >= 100
        ? currentFloor
        : Math.round(100 * Math.pow(level, 3));
    const progress = level >= 100
        ? 100
        : Math.max(0, Math.min(100, ((xp - currentFloor) / Math.max(1, nextFloor - currentFloor)) * 100));

    card.hidden = false;
    card.innerHTML = `
        <p class="gathering-skill-eyebrow">Current Skill</p>
        <h2>${escapeGatheringText(formatProfessionName(profession))} Level ${level}</h2>
        <div class="gathering-skill-progress" aria-label="Skill progress">
            <span style="width:${progress.toFixed(2)}%"></span>
        </div>
        <p>${level >= 100 ? "Maximum skill level reached." : `${xp - currentFloor} / ${nextFloor - currentFloor} XP to the next level`}</p>
    `;
}

function renderGatheringEquipmentCard() {
    const card = gatheringElement("gathering-equipment-card");
    if (!card) return;

    const profession = gatheringState.activeProfession;
    const tools = gatheringState.equipment.filter((item) => item.profession === profession);

    if (!tools.length && profession !== "fishing") {
        card.hidden = true;
        card.innerHTML = "";
        return;
    }

    const bait = gatheringState.bait || {};
    const baitRow = profession === "fishing" ? `
        <div class="gathering-tool-row">
            <span class="gathering-tool-icon">🪱</span>
            <div><strong>Bait Buckets</strong><small>${Number(bait.full_buckets || 0)} buckets · Current: ${Number(bait.current_bucket_uses || 0)}/4 uses</small></div>
        </div>` : "";

    card.hidden = false;
    card.innerHTML = `
        <p class="gathering-skill-eyebrow">Profession Equipment</p>
        <h2>${escapeGatheringText(formatProfessionName(profession))} Tools</h2>
        <div class="gathering-tool-list">
            ${baitRow}
            ${tools.map((tool) => {
                const maximum = Math.max(1, Number(tool.maximum_durability || 100));
                const current = Number(tool.current_durability || 0);
                const percent = Math.max(0, Math.min(100, current / maximum * 100));
                return `
                    <div class="gathering-tool-row ${tool.owned ? "owned" : "locked"}">
                        <span class="gathering-tool-icon">${escapeGatheringText(tool.icon)}</span>
                        <div>
                            <strong>${escapeGatheringText(tool.display_name)}</strong>
                            <small>${tool.owned ? `${current}/${maximum} durability` : "Buy permanently with Job Points"}</small>
                            <div class="gathering-tool-health"><span style="width:${percent.toFixed(1)}%"></span></div>
                            ${tool.owned && current < maximum ? `<button class="gathering-repair-button" data-repair-equipment="${escapeGatheringText(tool.equipment_key)}" type="button">Repair at Workbench</button>` : ""}
                        </div>
                    </div>`;
            }).join("")}
        </div>`;

    card.querySelectorAll("[data-repair-equipment]").forEach((button) => {
        button.addEventListener("click", async () => {
            button.disabled = true;
            try {
                const { data, error } = await supabaseClient.rpc("repair_profession_equipment", {
                    p_equipment_key: button.dataset.repairEquipment
                });
                if (error) throw error;
                showGatheringMessage(`🔨 ${escapeGatheringText(data.display_name)} repaired to ${Number(data.current_durability)}/${Number(data.maximum_durability)} durability.`, "success");
                await loadGatheringEquipment();
            } catch (error) {
                showGatheringMessage(`❌ ${escapeGatheringText(error.message)}`, "error");
                button.disabled = false;
            }
        });
    });
}

async function loadGatheringEquipment() {
    const { data, error } = await supabaseClient.rpc("get_my_profession_equipment");
    if (error) {
        console.error("Could not load profession equipment:", error);
        return;
    }
    gatheringState.equipment = data?.equipment || [];
    gatheringState.bait = data?.bait || { full_buckets: 0, current_bucket_uses: 0 };
    renderGatheringEquipmentCard();
}

function setGatheringProfession(profession) {
    if (!gatheringProfessions.has(profession)) {
        return;
    }

    gatheringState.activeProfession = profession;

    document
        .querySelectorAll("[data-gathering-filter]")
        .forEach((button) => {
            button.classList.toggle(
                "active",
                button.dataset.gatheringFilter === profession
            );
        });

    document.body.classList.remove(
        "gathering-theme-woodcutting",
        "gathering-theme-mining",
        "gathering-theme-foraging",
        "gathering-theme-fishing",
        "gathering-theme-hunting"
    );

    if (profession !== "all") {
        document.body.classList.add(`gathering-theme-${profession}`);
    }

    renderGatheringNodes();
    renderGatheringSkillCard();
    renderGatheringEquipmentCard();
}

function renderGatheringNodes() {
    const container = gatheringElement("gathering-node-grid");

    if (!container) {
        return;
    }

    const visibleNodes = gatheringState.nodes.filter((node) => {
        return gatheringState.activeProfession === "all"
            || node.profession === gatheringState.activeProfession;
    });

    if (visibleNodes.length === 0) {
        container.innerHTML = `
            <p class="gathering-empty">
                No activities are available in this category yet.
            </p>
        `;
        return;
    }

    container.innerHTML = visibleNodes.map(renderGatheringNodeCard).join("");

    container
        .querySelectorAll("[data-gather-node]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                gatherFromNode(button.dataset.gatherNode);
            });
        });
}

function renderGatheringNodeCard(node) {
    const busy = gatheringState.busyNodeKey === node.node_key;
    const primaryName = node.primary_item_name || "Resource";
    const bonusName = node.bonus_item_name || "";
    const requiredName = node.required_item_name || "";
    const currentLevel = Number(node.current_skill_level || 1);
    const requiredLevel = Number(node.required_skill_level || 1);
    const hasLevel = currentLevel >= requiredLevel;
    const hasItem = node.has_required_item !== false;
    const hasHuntingWeapon = node.has_required_hunting_weapon !== false;
    const unlocked = hasLevel && hasItem && hasHuntingWeapon;

    const requirements = [];
    if (!hasLevel) requirements.push(`${formatProfessionName(node.profession)} Level ${requiredLevel}`);
    if (!hasItem && requiredName) requirements.push(requiredName);
    if (!hasHuntingWeapon && node.required_hunting_weapon) {
        requirements.push(`Crafted ${node.required_hunting_weapon === "spear" ? "Spear" : "Bow"}`);
    }

    return `
        <article class="gathering-engine-card ${unlocked ? "unlocked" : "locked"}">
            ${unlocked ? "" : '<div class="gathering-lock-ribbon">🔒 Locked</div>'}
            <div class="gathering-engine-card-icon">${escapeGatheringText(node.icon)}</div>
            <div class="gathering-engine-card-body">
                <div class="gathering-engine-card-heading">
                    <div>
                        <p class="gathering-profession-label">
                            ${escapeGatheringText(formatProfessionName(node.profession))} · Level ${requiredLevel}
                        </p>
                        <h2>${escapeGatheringText(node.display_name)}</h2>
                    </div>
                    <span class="game-badge">⚡ ${Number(node.energy_cost)}</span>
                </div>
                <p>${escapeGatheringText(node.description)}</p>
                <div class="gathering-reward-row">
                    <span><strong>${escapeGatheringText(primaryName)}</strong> ${Number(node.minimum_reward)}–${Number(node.maximum_reward)}</span>
                    ${bonusName ? `<span>Bonus: ${escapeGatheringText(bonusName)}</span>` : ""}
                </div>
                ${unlocked ? "" : `<div class="gathering-requirement-box"><strong>Unlock requirements:</strong><span>${requirements.map(escapeGatheringText).join(" + ")}</span></div>`}
                <div class="gathering-action-row">
                    <label>Actions<input id="gather-amount-${escapeGatheringText(node.node_key)}" type="number" min="1" max="25" value="1" ${unlocked ? "" : "disabled"}></label>
                    <button type="button" data-gather-node="${escapeGatheringText(node.node_key)}" ${busy || !unlocked ? "disabled" : ""}>
                        ${busy ? "Working..." : unlocked ? "Gather" : "Locked"}
                    </button>
                </div>
            </div>
        </article>
    `;
}

async function gatherFromNode(nodeKey) {
    if (gatheringState.busyNodeKey) {
        return;
    }

    const amountInput = gatheringElement(`gather-amount-${nodeKey}`);
    const actions = Math.max(1, Math.min(25, Number(amountInput?.value || 1)));

    gatheringState.busyNodeKey = nodeKey;
    renderGatheringNodes();

    try {
        const {
            data,
            error
        } = await supabaseClient.rpc("gather_resource", {
            p_node_key: nodeKey,
            p_actions: actions
        });

        if (error) {
            throw error;
        }

        const destination = data.destination === "cart"
            ? "your active Cart"
            : "your Backpack";

        const bonusText = Number(data.bonus_quantity || 0) > 0
            ? `<br>➕ ${Number(data.bonus_quantity)} ${escapeGatheringText(data.bonus_item)}`
            : "";

        const battleStatText = data.primary_battle_stat
            ? `<br>⚔️ Your ${escapeGatheringText(data.primary_battle_stat)} and ${escapeGatheringText(data.secondary_battle_stat)} improved.`
            : "";

        const finds = data.woodcutting_finds || {};
        const findParts = [];
        if (Number(finds.large_sticks || 0) > 0) {
            findParts.push(`${Number(finds.large_sticks)} ${escapeGatheringText(finds.large_stick_name)}`);
        }
        if (Number(finds.bird_nests || 0) > 0) {
            findParts.push(`${Number(finds.bird_nests)} Bird Nest${Number(finds.bird_nests) === 1 ? "" : "s"}`);
        }
        if (Number(finds.eggs || 0) > 0) {
            findParts.push(`${Number(finds.eggs)} Egg${Number(finds.eggs) === 1 ? "" : "s"}`);
        }
        if (Number(finds.feathers || 0) > 0) {
            findParts.push(`${Number(finds.feathers)} Feather${Number(finds.feathers) === 1 ? "" : "s"}`);
        }
        const findText = findParts.length
            ? `<br>🐦 <strong>Woodland finds:</strong> ${findParts.join(", ")}`
            : "";

        const huntingText = data.hunting_weapon
            ? `<br>${data.hunting_weapon === "spear" ? "🗡️" : "🏹"} Used ${escapeGatheringText(data.weapon_name || data.hunting_weapon)}.${data.hunting_weapon === "bow" ? ` Arrows: ${Number(data.arrows_used || 0)} used, ${Number(data.arrows_recovered || 0)} recovered.` : ""}${data.knife_required_for_bonus ? `<br>🔪 The ${escapeGatheringText(data.discarded_bonus)} was ruined because you do not own a Hunting Knife.` : ""}`
            : "";

        showGatheringMessage(
            `
                ✅ <strong>${escapeGatheringText(data.display_name)}</strong><br>
                Gathered ${Number(data.primary_quantity)}
                ${escapeGatheringText(data.primary_item)}.
                ${bonusText}
                <br>📦 Sent to ${destination}.
                <br>⚡ ${Number(data.energy_remaining)} energy remains.
                ${battleStatText}
                ${findText}
                ${huntingText}
                ${data.tool_durability_remaining !== undefined ? `<br>🛠️ Tool durability remaining: ${Number(data.tool_durability_remaining)}/100` : ""}
            `,
            "success"
        );

        if (typeof updateTopBarPlayer === "function") {
            await updateTopBarPlayer();
        }

        if (typeof loadCartCard === "function") {
            await loadCartCard();
        }

        await Promise.all([loadGatheringNodes(), loadGatheringEquipment()]);
    } catch (error) {
        console.error("Gathering failed:", error);
        showGatheringMessage(`❌ ${escapeGatheringText(error.message)}`, "error");
    } finally {
        gatheringState.busyNodeKey = null;
        renderGatheringNodes();
    }
}

function bindGatheringFilters() {
    document
        .querySelectorAll("[data-gathering-filter]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                setGatheringProfession(button.dataset.gatheringFilter);
            });
        });
}

async function initialiseGatheringPage() {
    try {
        gatheringState.activeProfession = getInitialProfession();
        bindGatheringFilters();
        await Promise.all([loadGatheringNodes(), loadGatheringEquipment()]);
        setGatheringProfession(gatheringState.activeProfession);
    } catch (error) {
        console.error("Gathering page failed:", error);
        showGatheringMessage(`❌ ${escapeGatheringText(error.message)}`, "error");
    }
}

initialiseGatheringPage();
