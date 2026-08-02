let healerUser = null;
let healerJobsCompleted = 0;
let hospitalTimer = null;
let hospitalRealtimeChannel = null;
let healerPatients = [];
let healerPage = 1;
const PATIENTS_PER_PAGE = 10;
const MAX_RANDOM_NPC_PATIENTS = 6;

function safe(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setHealerMessage(text, type = "info") {
  const box = document.getElementById("healer-message");
  box.className = `healer-message ${type}`;
  box.innerHTML = text;
}

function liveHealth(startHealth, admittedAt, regenPerMinute, maxHealth = 500) {
  const elapsedMinutes = Math.max(0, (Date.now() - new Date(admittedAt).getTime()) / 60000);
  return Math.min(maxHealth, Math.max(1, Math.floor(Number(startHealth) + elapsedMinutes * Number(regenPerMinute))));
}

function remainingMilliseconds(until) {
  return Math.max(0, new Date(until).getTime() - Date.now());
}

function remainingText(until) {
  const ms = remainingMilliseconds(until);
  if (ms <= 0) return "Ready to leave";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}h ${String(minutes).padStart(2, "0")}m`
    : `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function healingPercent() {
  return healerJobsCompleted < 10 ? 0 : Math.min(100, 10 + Math.floor(healerJobsCompleted / 10) * 10);
}

async function getHealerProgress(playerId) {
  const { data: npc } = await supabaseClient.from("job_npcs").select("id").eq("code", "healer").maybeSingle();
  if (!npc) return 0;
  const { data } = await supabaseClient.from("profession_progress")
    .select("jobs_completed").eq("player_id", playerId).eq("npc_id", npc.id).maybeSingle();
  return Number(data?.jobs_completed || 0);
}

async function loadVillageHealer() {
  try {
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error || !user) { window.location.href = "login.html"; return; }
    healerUser = user;

    await supabaseClient.rpc("refresh_my_hospital_status");

    healerJobsCompleted = await getHealerProgress(user.id);
    const level = healingPercent();
    document.getElementById("healer-jobs").textContent = healerJobsCompleted;
    document.getElementById("healing-level").textContent = level ? `${level}%` : "Locked";

    const [playersResult, npcVisitsResult, meResult] = await Promise.all([
      supabaseClient.from("players")
        .select("id,player_number,username,avatar_url,health,max_health,hospital_started_at,hospital_until,hospital_reason,hospital_start_health,hospital_regen_per_minute")
        .not("hospital_until", "is", null).gt("hospital_until", new Date().toISOString()),
      supabaseClient.from("npc_hospital_visits")
        .select("id,npc_id,injury_text,start_health,regen_per_minute,admitted_at,recovery_at,status,village_npcs(*)")
        .eq("status", "recovering").gt("recovery_at", new Date().toISOString()),
      supabaseClient.from("players")
        .select("id,player_number,username,avatar_url,health,max_health,hospital_started_at,hospital_until,hospital_reason,hospital_start_health,hospital_regen_per_minute")
        .eq("id", user.id).single()
    ]);

    for (const result of [playersResult, npcVisitsResult, meResult]) if (result.error) throw result.error;

    renderMyHospital(meResult.data);
    preparePatients(playersResult.data || [], npcVisitsResult.data || []);
    startLiveUpdates();
    subscribeToHospitalChanges();
  } catch (error) {
    console.error(error);
    setHealerMessage(`❌ ${safe(error.message)}`, "error");
  }
}

function renderMyHospital(me) {
  const card = document.getElementById("my-hospital-card");
  const medicineCard = document.getElementById("hospital-medicine-card");

  if (!me.hospital_until || new Date(me.hospital_until).getTime() <= Date.now()) {
    card.hidden = true;

    if (medicineCard) {
      medicineCard.hidden = true;
    }

    return;
  }

  card.hidden = false;

  if (medicineCard) {
    medicineCard.hidden = false;
  }
  card.dataset.started = me.hospital_started_at;
  card.dataset.until = me.hospital_until;
  card.dataset.startHealth = me.hospital_start_health || 1;
  card.dataset.regen = me.hospital_regen_per_minute || 5;
  card.dataset.max = me.max_health || 500;
  card.innerHTML = `
    <h2>🛏️ You are recovering</h2>
    <div class="hospital-stats">
      <span>Health <strong data-my-health>1/${me.max_health || 500}</strong></span>
      <span>Time remaining <strong data-my-time>--</strong></span>
    </div>
    <p class="regen-note">Your injury reason is shown on your patient card below.</p>`;
}

function patientEndTime(patient) {
  return new Date(patient.kind === "player" ? patient.hospital_until : patient.recovery_at).getTime();
}

function patientCard(patient) {
  const level = healingPercent();
  const locked = !level;
  const isPlayer = patient.kind === "player";
  const npc = patient.npc || {};
  const name = isPlayer ? patient.username : npc.name;
  const subtitle = isPlayer ? "Recovering patient" : (npc.profession || "Village resident");
  const start = isPlayer ? (patient.hospital_start_health || 1) : patient.start_health;
  const admitted = isPlayer ? patient.hospital_started_at : patient.admitted_at;
  const regen = isPlayer ? patient.hospital_regen_per_minute : patient.regen_per_minute;
  const until = isPlayer ? patient.hospital_until : patient.recovery_at;
  const max = Number(isPlayer ? patient.max_health : npc.max_health) || 500;
  const injury = isPlayer ? patient.hospital_reason : patient.injury_text;
  const target = patient.id;
  const profileHref = isPlayer && patient.player_number
    ? `profile.html?id=${encodeURIComponent(patient.player_number)}`
    : (!isPlayer && npc.id ? `profile.html?npc=${encodeURIComponent(npc.id)}` : "#");
  const portraitContent = isPlayer
    ? (patient.avatar_url ? `<img src="${safe(patient.avatar_url)}" alt="${safe(name)}">` : "🛡️")
    : (npc.avatar_url ? `<img src="${safe(npc.avatar_url)}" alt="${safe(name)}">` : safe(npc.icon || "🧑"));

  return `<article class="patient-card" data-start="${start}" data-admitted="${safe(admitted)}" data-regen="${regen}" data-until="${safe(until)}" data-max="${max}" data-self="${isPlayer && patient.id === healerUser.id}">
    <header>
      <a class="patient-icon" href="${profileHref}" aria-label="View ${safe(name)} profile">${portraitContent}</a>
      <div><h3><a href="${profileHref}">${safe(name)}</a></h3><p>${safe(subtitle)}</p></div>
    </header>
    <p class="injury">${safe(injury || "Recovering under Yrsa's care.")}</p>
    <div class="health-row"><span>❤️ <strong data-live-health>1/${max}</strong></span><span>⏳ <strong data-live-time>--</strong></span></div>
    <div class="health-track"><div data-health-bar></div></div>
    ${locked
      ? `<button disabled>🔒 Complete 10 healer jobs</button>`
      : `<button class="heal-button" data-kind="${patient.kind}" data-target="${target}">Heal to ${level}%</button>`}
  </article>`;
}

function preparePatients(players, npcVisits) {
  const playerPatients = players.map(player => ({ ...player, kind: "player" }));
  const npcPatients = npcVisits
    .slice()
    .sort((a, b) => new Date(b.recovery_at) - new Date(a.recovery_at))
    .slice(0, MAX_RANDOM_NPC_PATIENTS)
    .map(visit => ({ ...visit, npc: visit.village_npcs, kind: "npc" }));

  healerPatients = [...playerPatients, ...npcPatients]
    .filter(patient => patientEndTime(patient) > Date.now())
    .sort((a, b) => patientEndTime(b) - patientEndTime(a));

  const totalPages = Math.max(1, Math.ceil(healerPatients.length / PATIENTS_PER_PAGE));
  healerPage = Math.min(healerPage, totalPages);
  renderPatientPage();
}

function renderPatientPage() {
  const totalPages = Math.max(1, Math.ceil(healerPatients.length / PATIENTS_PER_PAGE));
  const start = (healerPage - 1) * PATIENTS_PER_PAGE;
  const visible = healerPatients.slice(start, start + PATIENTS_PER_PAGE);
  document.getElementById("patient-count").textContent = healerPatients.length;

  const grid = document.getElementById("hospital-grid");
  grid.innerHTML = visible.length
    ? visible.map(patientCard).join("")
    : "<p>Every bed is empty. Yrsa looks suspiciously relaxed.</p>";

  grid.querySelectorAll(".heal-button").forEach(button => {
    button.addEventListener("click", () => healPatient(button.dataset.kind, button.dataset.target));
  });

  const pager = document.getElementById("hospital-pagination");
  pager.hidden = totalPages <= 1;
  document.getElementById("patient-page-label").textContent = `Page ${healerPage} of ${totalPages}`;
  const previous = document.getElementById("patient-page-previous");
  const next = document.getElementById("patient-page-next");
  previous.disabled = healerPage <= 1;
  next.disabled = healerPage >= totalPages;
  updateLiveValues();
}

async function healPatient(kind, target) {
  try {
    setHealerMessage("Preparing bandages and remedies…", "info");
    const args = kind === "player"
      ? { target_player_id: target, target_npc_visit_id: null }
      : { target_player_id: null, target_npc_visit_id: Number(target) };
    const { data, error } = await supabaseClient.rpc("heal_hospital_patient", args);
    if (error) throw error;
    const reward = data.reward_silver ? ` You earned ${data.reward_silver} silver.` : "";
    setHealerMessage(`✅ Patient restored to ${data.restored_to}/500.${reward}`, "success");
    await loadVillageHealer();
  } catch (error) {
    setHealerMessage(`❌ ${safe(error.message)}`, "error");
  }
}

function updateLiveValues() {
  let shouldReload = false;
  document.querySelectorAll(".patient-card").forEach(card => {
    if (remainingMilliseconds(card.dataset.until) <= 0) shouldReload = true;
    const health = liveHealth(card.dataset.start, card.dataset.admitted, card.dataset.regen, card.dataset.max);
    card.querySelector("[data-live-health]").textContent = `${health}/${card.dataset.max}`;
    card.querySelector("[data-live-time]").textContent = remainingText(card.dataset.until);
    card.querySelector("[data-health-bar]").style.width = `${Math.max(1, health / Number(card.dataset.max) * 100)}%`;
    if (card.dataset.self === "true") {
      const topHealth = document.getElementById("health");
      if (topHealth) topHealth.textContent = `${health} / ${card.dataset.max}`;
    }
  });

  const mine = document.getElementById("my-hospital-card");
  if (!mine.hidden) {
    const health = liveHealth(mine.dataset.startHealth, mine.dataset.started, mine.dataset.regen, mine.dataset.max);
    mine.querySelector("[data-my-health]").textContent = `${health}/${mine.dataset.max}`;
    mine.querySelector("[data-my-time]").textContent = remainingText(mine.dataset.until);
    const topHealth = document.getElementById("health");
    if (topHealth) topHealth.textContent = `${health} / ${mine.dataset.max}`;
  }

  if (shouldReload && !window.healerReloadPending) {
    window.healerReloadPending = true;
    setTimeout(() => {
      window.healerReloadPending = false;
      loadVillageHealer();
    }, 1000);
  }
}

function startLiveUpdates() {
  clearInterval(hospitalTimer);
  hospitalTimer = setInterval(updateLiveValues, 1000);
}

function subscribeToHospitalChanges() {
  if (hospitalRealtimeChannel) return;
  hospitalRealtimeChannel = supabaseClient.channel("village-healer-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "players" }, payload => {
      if (payload.new?.hospital_until || payload.old?.hospital_until) loadVillageHealer();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "npc_hospital_visits" }, () => loadVillageHealer())
    .subscribe();
}

document.getElementById("patient-page-previous")?.addEventListener("click", () => {
  if (healerPage > 1) {
    healerPage -= 1;
    renderPatientPage();
    document.getElementById("hospital-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

document.getElementById("patient-page-next")?.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(healerPatients.length / PATIENTS_PER_PAGE));
  if (healerPage < totalPages) {
    healerPage += 1;
    renderPatientPage();
    document.getElementById("hospital-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

loadVillageHealer();


/* ============================================================
   USE MEDICINE TO LEAVE THE HEALER HUT
   ============================================================ */

async function useHospitalMedicine() {
  const button = document.getElementById("use-hospital-medicine");

  if (button) {
    button.disabled = true;
    button.textContent = "Using medicine...";
  }

  try {
    setHealerMessage(
      "Preparing your Herbal Bandage...",
      "info"
    );

    const {
      data,
      error
    } = await supabaseClient.rpc(
      "use_hospital_medicine",
      {
        p_item_name: "Herbal Bandage"
      }
    );

    if (error) {
      throw error;
    }

    setHealerMessage(
      `✅ You used an Herbal Bandage and left the Healer Hut with ${data.health} health.`,
      "success"
    );

    setTimeout(() => {
      window.location.href = "property.html";
    }, 1000);
  } catch (error) {
    setHealerMessage(
      `❌ ${safe(error.message)}`,
      "error"
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Use Herbal Bandage";
    }
  }
}

document
  .getElementById("use-hospital-medicine")
  ?.addEventListener("click", useHospitalMedicine);
