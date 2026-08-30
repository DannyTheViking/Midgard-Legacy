/* Midgard Legacy - Viking Missions
   Server-authoritative: requirements, daily cap, rewards and unlocks all live in Supabase. */

let missionState = null;
let selectedMissionContact = 1;

function missionEscape(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function missionMessage(text = "", type = "info") {
    const box = document.getElementById("mission-message");
    if (!box) return;
    box.textContent = text;
    box.dataset.type = type;
    box.hidden = !text;
}

function getSelectedContact() {
    return missionState?.contacts?.find(contact => Number(contact.contact_no) === Number(selectedMissionContact)) || missionState?.contacts?.[0] || null;
}

function renderMissionDaily() {
    const current = Number(missionState?.daily_completed || 0);
    const limit = Number(missionState?.daily_limit || 5);
    document.getElementById("mission-daily-count").textContent = `${current} / ${limit}`;
    document.getElementById("mission-daily-fill").style.width = `${Math.min(100, (current / limit) * 100)}%`;
}

function renderMissionContacts() {
    const strip = document.getElementById("mission-contact-strip");
    strip.innerHTML = "";

    (missionState?.contacts || []).forEach(contact => {
        const unlocked = Boolean(contact.unlocked);
        const active = Number(contact.contact_no) === Number(selectedMissionContact);
        const button = document.createElement("button");
        button.type = "button";
        button.className = `mission-contact-token${active ? " active" : ""}${unlocked ? "" : " locked"}`;
        button.disabled = !unlocked;
        button.innerHTML = `
            <span class="mission-contact-portrait">${unlocked ? missionEscape(contact.icon) : "🔒"}</span>
            <strong>${unlocked ? missionEscape(contact.name) : "Locked"}</strong>
            <small>${unlocked ? `${Number(contact.main_completed || 0)}/100` : `Contact ${contact.contact_no}`}</small>
        `;
        button.addEventListener("click", () => {
            selectedMissionContact = Number(contact.contact_no);
            renderMissions();
        });
        strip.appendChild(button);
    });
}

function renderMissionContactCard(contact) {
    const target = document.getElementById("mission-contact-card");
    if (!contact) {
        target.innerHTML = "<p>No mission contact available.</p>";
        return;
    }

    target.innerHTML = `
        <div class="mission-contact-large-icon">${missionEscape(contact.icon)}</div>
        <p class="mission-contact-number">CONTACT ${contact.contact_no} OF 10</p>
        <h2>${missionEscape(contact.name)}</h2>
        <h3>${missionEscape(contact.role_title)}</h3>
        <p class="mission-personality">${missionEscape(contact.personality)}</p>
        <p>${missionEscape(contact.intro_text)}</p>
        <div class="mission-contact-progress">
            <div><span>Main missions</span><strong>${Number(contact.main_completed || 0)} / 100</strong></div>
            <div class="mission-progress-track"><span style="width:${Math.min(100, Number(contact.main_completed || 0))}%"></span></div>
        </div>
        <div class="mission-contact-pay">Normal pay: <strong>🪙 ${Number(contact.base_silver || 0)} Silver + an extra item reward</strong></div>
    `;
}

function rewardHTML(contract) {
    const item = contract.reward_item_name && Number(contract.reward_item_quantity || 0) > 0
        ? `<div><span>🎁</span><strong>${Number(contract.reward_item_quantity).toLocaleString()} ${missionEscape(contract.reward_item_name)}</strong></div>`
        : "";
    return `
        <div class="mission-reward-grid">
            <div><span>🪙</span><strong>${Number(contract.reward_silver || 0).toLocaleString()} Silver</strong></div>
            ${item}
        </div>
    `;
}

function renderMainMission(contact) {
    const card = document.getElementById("mission-main-card");
    const mission = contact?.current_mission;

    if (!contact?.unlocked) {
        card.innerHTML = `<div class="mission-locked-panel"><span>🔒</span><h2>Contact Locked</h2><p>Complete all 100 missions for the previous contact to earn this introduction.</p></div>`;
        return;
    }

    if (!mission) {
        card.innerHTML = `<div class="mission-complete-panel"><span>🏆</span><h2>${missionEscape(contact.name)}'s Story Complete</h2><p>You completed all 100 of this contact's missions. The next contact is now available.</p></div>`;
        return;
    }

    const owned = Number(mission.owned_quantity || 0);
    const required = Number(mission.request_quantity || 0);
    const enough = owned >= required;
    const dailyFull = Number(missionState.daily_completed || 0) >= Number(missionState.daily_limit || 5);

    card.innerHTML = `
        <header class="mission-contract-heading">
            <div>
                <p>MISSION ${mission.mission_no} / 100</p>
                <h2>${missionEscape(mission.title)}</h2>
            </div>
            <span class="mission-difficulty">${mission.mission_no >= 80 ? "Hard" : mission.mission_no >= 40 ? "Medium" : "Standard"}</span>
        </header>
        <div class="mission-story">${missionEscape(mission.story_text)}</div>
        <section class="mission-task-box">
            <p class="mission-section-label">TASK</p>
            <h3>Bring ${required.toLocaleString()} ${missionEscape(mission.request_item_name)}</h3>
            <p>You currently have <strong>${owned.toLocaleString()} / ${required.toLocaleString()}</strong> across your Backpack, active transport and Storage Yard.</p>
            <div class="mission-progress-track large"><span style="width:${Math.min(100, required ? (owned/required)*100 : 0)}%"></span></div>
        </section>
        <section class="mission-reward-box">
            <p class="mission-section-label">REWARD</p>
            ${rewardHTML(mission)}
        </section>
        <button id="complete-main-mission" class="mission-accept-button" type="button" ${(!enough || dailyFull) ? "disabled" : ""}>
            ${dailyFull ? "Daily Limit Reached" : enough ? "Complete Contract" : `Need ${(required-owned).toLocaleString()} More ${missionEscape(mission.request_item_name)}`}
        </button>
    `;

    document.getElementById("complete-main-mission")?.addEventListener("click", () => completeMainMission(contact.contact_no));
}

function renderBonuses(contact) {
    const area = document.getElementById("mission-bonus-area");
    const bonuses = contact?.available_bonuses || [];
    if (!bonuses.length) {
        area.innerHTML = "";
        return;
    }

    area.innerHTML = `<h2 class="mission-bonus-title">✨ Bonus Favours</h2>` + bonuses.map(bonus => {
        const owned = Number(bonus.owned_quantity || 0);
        const required = Number(bonus.request_quantity || 0);
        const enough = owned >= required;
        const cameo = bonus.cameo_username
            ? `<p class="mission-cameo">👤 This favour involves <a href="players.html?q=${encodeURIComponent(bonus.cameo_username)}">${missionEscape(bonus.cameo_username)}</a>, a Viking who has been away from Midgard for more than a month.</p>`
            : "";
        return `
            <article class="mission-bonus-card">
                <div class="mission-bonus-badge">BONUS AFTER #${bonus.after_mission_no}</div>
                <h3>${missionEscape(bonus.title)}</h3>
                <p>${missionEscape(bonus.story_text)}</p>
                ${cameo}
                <div class="mission-bonus-task"><strong>Bring ${required.toLocaleString()} ${missionEscape(bonus.request_item_name)}</strong><span>${owned.toLocaleString()} / ${required.toLocaleString()} owned</span></div>
                ${rewardHTML(bonus)}
                <button class="mission-bonus-button" type="button" data-after="${bonus.after_mission_no}" ${enough ? "" : "disabled"}>${enough ? "Complete Bonus" : "Missing Items"}</button>
            </article>`;
    }).join("");

    area.querySelectorAll(".mission-bonus-button").forEach(button => {
        button.addEventListener("click", () => completeBonusMission(contact.contact_no, Number(button.dataset.after)));
    });
}

function renderMissions() {
    if (!missionState) return;
    if (!missionState.contacts?.some(c => Number(c.contact_no) === Number(selectedMissionContact) && c.unlocked)) {
        selectedMissionContact = Number(missionState.contacts?.find(c => c.unlocked)?.contact_no || 1);
    }
    const contact = getSelectedContact();
    renderMissionDaily();
    renderMissionContacts();
    renderMissionContactCard(contact);
    renderMainMission(contact);
    renderBonuses(contact);
}

async function loadMissions({ quiet = false } = {}) {
    if (!quiet) missionMessage("Loading contracts...");
    const { data, error } = await supabaseClient.rpc("get_my_viking_missions");
    if (error) {
        console.error("Mission load failed:", error);
        missionMessage(error.message || "Could not load Viking Missions.", "error");
        return;
    }
    missionState = data;
    missionMessage("");
    renderMissions();
}

async function completeMainMission(contactNo) {
    missionMessage("Handing in contract...");
    const { data, error } = await supabaseClient.rpc("complete_viking_mission", { p_contact_no: Number(contactNo) });
    if (error) {
        missionMessage(error.message, "error");
        return;
    }
    const bonusText = data?.bonus_unlocked ? " A bonus favour has also appeared." : "";
    missionMessage(`Contract complete. You earned ${Number(data.reward_silver || 0)} Silver.${bonusText}`, "success");
    await loadMissions({ quiet: true });
    if (typeof loadTopBarPlayer === "function") await loadTopBarPlayer();
}

async function completeBonusMission(contactNo, afterMissionNo) {
    missionMessage("Completing bonus favour...");
    const { data, error } = await supabaseClient.rpc("complete_viking_bonus", { p_contact_no: Number(contactNo), p_after_mission_no: Number(afterMissionNo) });
    if (error) {
        missionMessage(error.message, "error");
        return;
    }
    missionMessage(`Bonus complete. You earned ${Number(data.reward_silver || 0)} Silver plus the listed extra reward.`, "success");
    await loadMissions({ quiet: true });
    if (typeof loadTopBarPlayer === "function") await loadTopBarPlayer();
}

function setupMissionStripControls() {
    const strip = document.getElementById("mission-contact-strip");
    document.getElementById("mission-contact-prev")?.addEventListener("click", () => strip.scrollBy({ left: -320, behavior: "smooth" }));
    document.getElementById("mission-contact-next")?.addEventListener("click", () => strip.scrollBy({ left: 320, behavior: "smooth" }));
}

(async function initialiseMissions() {
    if (window.midgardAuthReady) await window.midgardAuthReady;
    setupMissionStripControls();
    await loadMissions();
})();
