/* Midgard Legacy - PvP Combat
   The page only asks Supabase to perform actions. Hit chance, damage,
   ammunition, health, hospital results and logs are all server-authoritative. */

let combatState = null;
let combatFightId = null;
let combatSelectedPart = "torso";
let combatBusy = false;
let combatCurrentUserId = null;

function combatEscape(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function combatMessage(text = "", type = "info") {
    const box = document.getElementById("combat-message");
    box.textContent = text;
    box.dataset.type = type;
}

function prettyPart(part) {
    return String(part || "torso").replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function fighterAvatar(player) {
    return player.avatar_url
        ? `<img src="${combatEscape(player.avatar_url)}" alt="${combatEscape(player.username)} avatar">`
        : `<span class="fighter-avatar-fallback">🧔</span>`;
}

function gearChip(label, item, emptyText = "None") {
    return `<div class="gear-chip"><b>${combatEscape(label)}</b>${combatEscape(item?.name || emptyText)}</div>`;
}

function renderFighter(targetId, player, label) {
    const node = document.getElementById(targetId);
    const hp = Math.max(0, Number(player.health || 0));
    const max = Math.max(1, Number(player.max_health || 1));
    const pct = Math.max(0, Math.min(100, (hp / max) * 100));
    const eq = player.equipment || {};

    node.innerHTML = `
        <header class="fighter-heading">
            <h2>${combatEscape(player.username)}</h2>
            <span>${combatEscape(label)}</span>
        </header>
        <div class="fighter-stage">
            <div class="fighter-gear left">
                ${gearChip("Head", eq.head)}
                ${gearChip("Shield", eq.defence)}
                ${gearChip("Melee", eq.main_hand, "Bare hands")}
            </div>
            <div class="fighter-avatar-wrap">
                <div class="fighter-avatar">${fighterAvatar(player)}</div>
            </div>
            <div class="fighter-gear">
                ${gearChip("Body", eq.body)}
                ${gearChip("Bow", eq.ranged)}
                ${gearChip("Ammo", eq.ammo, `${Number(eq.arrow_count || 0)} Arrows`)}
            </div>
        </div>
        <div class="fighter-health">
            <div class="fighter-health-row"><strong>❤️ Health</strong><strong>${hp.toLocaleString()} / ${max.toLocaleString()}</strong></div>
            <div class="health-track"><span style="width:${pct}%"></span></div>
            <div class="fighter-stats">
                <div><span>Strength</span><strong>${Number(player.strength || 0).toLocaleString()}</strong></div>
                <div><span>Defence</span><strong>${Number(player.defence || 0).toLocaleString()}</strong></div>
                <div><span>Agility</span><strong>${Number(player.agility || 0).toLocaleString()}</strong></div>
                <div><span>Accuracy</span><strong>${Number(player.accuracy || 0).toLocaleString()}</strong></div>
            </div>
        </div>`;
}

function getYouAndThem() {
    if (!combatState) return {};
    const youAreAttacker = combatState.attacker?.id === combatCurrentUserId;
    return {
        you: youAreAttacker ? combatState.attacker : combatState.defender,
        them: youAreAttacker ? combatState.defender : combatState.attacker,
        youAreAttacker
    };
}

function renderLoadout() {
    const area = document.getElementById("combat-loadout");
    const { you } = getYouAndThem();
    if (!you) return;
    const eq = you.equipment || {};
    area.innerHTML = `
        <div class="loadout-card"><span>🗡️ Melee Weapon</span><strong>${combatEscape(eq.main_hand?.name || "Bare hands")}</strong><em>${eq.main_hand ? `Damage ${Number(eq.main_hand.damage || 0)}` : "Low damage"}</em></div>
        <div class="loadout-card"><span>🏹 Ranged Weapon</span><strong>${combatEscape(eq.ranged?.name || "No bow equipped")}</strong><em>${eq.ranged ? `Damage ${Number(eq.ranged.damage || 0)}` : "Shoot unavailable"}</em></div>
        <div class="loadout-card"><span>🏹 Ammunition</span><strong>${Number(eq.arrow_count || 0).toLocaleString()} Arrows</strong><em>1 Arrow used per shot</em></div>
        <div class="loadout-card"><span>🛡️ Defence</span><strong>${combatEscape(eq.defence?.name || "No shield")}</strong><em>${combatEscape(eq.head?.name || "No helmet")}</em></div>`;
    area.hidden = false;
}

function renderLogs() {
    const log = document.getElementById("combat-log");
    const rows = combatState?.logs || [];
    if (!rows.length) {
        log.innerHTML = `<p class="combat-log-empty">No attacks yet.</p>`;
        return;
    }
    log.innerHTML = rows.slice().reverse().map(entry => {
        let cls = entry.healing > 0 ? "heal" : entry.hit ? "hit" : "miss";
        if (entry.critical) cls += " critical";
        return `<div class="combat-log-entry ${cls}">${combatEscape(entry.message)}</div>`;
    }).join("");
}

function renderResult() {
    const existing = document.getElementById("combat-result");
    existing?.remove();
    if (combatState?.status === "active") return;
    const { you } = getYouAndThem();
    const won = combatState.winner_id && combatState.winner_id === you?.id;
    const fled = String(combatState.status || "").includes("fled");
    const result = document.createElement("section");
    result.id = "combat-result";
    result.className = "combat-result";
    result.innerHTML = fled
        ? `<h2>🏃 Fight Ended</h2><p>The battle ended when a fighter escaped.</p>`
        : won
            ? `<h2>⚔️ Victory</h2><p>You won the battle. The complete attack log is saved in your notifications.</p>`
            : `<h2>🛡️ Defeat</h2><p>You were defeated. The complete attack log has been saved.</p>`;
    document.getElementById("combat-controls").after(result);
}

function setActionAvailability() {
    const { you, youAreAttacker } = getYouAndThem();
    const active = combatState?.status === "active" && youAreAttacker;
    document.querySelectorAll(".combat-action-button").forEach(button => button.disabled = combatBusy || !active);
    const shoot = document.querySelector('[data-action="shoot"]');
    if (shoot && active && (!you?.equipment?.ranged || Number(you?.equipment?.arrow_count || 0) < 1)) shoot.disabled = true;
}

function renderCombat() {
    if (!combatState) return;
    const { you, them, youAreAttacker } = getYouAndThem();
    document.getElementById("combat-title").textContent = `${you.username} vs ${them.username}`;
    document.getElementById("combat-status-badge").textContent = combatState.status === "active" ? "⚔️ Battle Active" : "📜 Battle Ended";
    renderFighter("fighter-you", you, "YOU");
    renderFighter("fighter-them", them, "OPPONENT");
    document.getElementById("combat-arena").hidden = false;
    document.getElementById("combat-controls").hidden = !youAreAttacker;
    renderLoadout();
    renderLogs();
    renderResult();
    setActionAvailability();
}

async function loadFight() {
    if (!combatFightId) return;
    const { data, error } = await supabaseClient.rpc("get_combat_fight", { p_fight_id: Number(combatFightId) });
    if (error) {
        combatMessage(error.message || "Could not load fight.", "error");
        return;
    }
    combatState = data;
    combatMessage("");
    renderCombat();
}

async function startFight(targetId) {
    combatMessage("Entering battle...");
    const { data, error } = await supabaseClient.rpc("start_player_attack", { p_target_player: targetId });
    if (error) {
        combatMessage(error.message || "Could not start battle.", "error");
        return;
    }
    combatState = data;
    combatFightId = Number(data.fight_id);
    const url = new URL(window.location.href);
    url.searchParams.delete("target");
    url.searchParams.set("fight", String(combatFightId));
    history.replaceState({}, "", url);
    combatMessage("");
    renderCombat();
}


async function startFightByNumber(playerNumber) {
    combatMessage("Entering battle...");
    const { data, error } = await supabaseClient.rpc("start_player_attack_by_number", {
        p_player_number: Number(playerNumber)
    });
    if (error) {
        combatMessage(error.message || "Could not start battle.", "error");
        return;
    }
    combatState = data;
    combatFightId = Number(data.fight_id);
    const url = new URL(window.location.href);
    url.searchParams.delete("player");
    url.searchParams.set("fight", String(combatFightId));
    history.replaceState({}, "", url);
    combatMessage("");
    renderCombat();
}

async function doCombatAction(action) {
    if (combatBusy || !combatFightId) return;
    combatBusy = true;
    setActionAvailability();
    combatMessage(action === "shoot" ? "Loose arrow..." : action === "use_item" ? "Using bandage..." : action === "flee" ? "Trying to escape..." : "Attacking...");
    const { data, error } = await supabaseClient.rpc("perform_combat_action", {
        p_fight_id: Number(combatFightId),
        p_action: action,
        p_body_part: combatSelectedPart
    });
    combatBusy = false;
    if (error) {
        combatMessage(error.message || "Combat action failed.", "error");
        setActionAvailability();
        return;
    }
    combatState = data;
    combatMessage("");
    renderCombat();
    const target = document.getElementById("fighter-them");
    target.classList.remove("combat-target-flash");
    requestAnimationFrame(() => target.classList.add("combat-target-flash"));
    if (typeof loadTopBarPlayer === "function") await loadTopBarPlayer();
}

function setupCombatControls() {
    document.getElementById("combat-body-targets")?.querySelectorAll("button[data-part]").forEach(button => {
        button.addEventListener("click", () => {
            combatSelectedPart = button.dataset.part;
            document.querySelectorAll("#combat-body-targets button").forEach(item => item.classList.toggle("active", item === button));
            document.getElementById("combat-aim-label").textContent = prettyPart(combatSelectedPart);
        });
    });
    document.querySelectorAll(".combat-action-button[data-action]").forEach(button => button.addEventListener("click", () => doCombatAction(button.dataset.action)));
    document.getElementById("combat-refresh")?.addEventListener("click", loadFight);
}

(async function initialiseCombat() {
    if (window.midgardAuthReady) await window.midgardAuthReady;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    combatCurrentUserId = user.id;
    setupCombatControls();
    const params = new URLSearchParams(window.location.search);
    const fight = Number(params.get("fight") || 0);
    const target = params.get("target");
    const playerNumber = Number(params.get("player") || 0);
    if (fight > 0) {
        combatFightId = fight;
        await loadFight();
        return;
    }
    if (target) {
        await startFight(target);
        return;
    }
    if (playerNumber > 0) {
        await startFightByNumber(playerNumber);
        return;
    }
    combatMessage("Choose a player from the Players directory or another Viking's profile and press Attack.", "error");
    document.getElementById("combat-title").textContent = "No opponent selected";
    document.getElementById("combat-status-badge").textContent = "Waiting";
})();
