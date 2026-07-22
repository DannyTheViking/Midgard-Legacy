let healerUser = null;
let healerJobsCompleted = 0;
let hospitalTimer = null;
let hospitalRealtimeChannel = null;

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

function remainingText(until) {
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return "Ready to leave";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
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
    await supabaseClient.rpc("spawn_random_npc_patient");

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
        .eq("status", "recovering").gt("recovery_at", new Date().toISOString()).order("admitted_at"),
      supabaseClient.from("players")
        .select("id,player_number,username,avatar_url,health,max_health,hospital_started_at,hospital_until,hospital_reason,hospital_start_health,hospital_regen_per_minute")
        .eq("id", user.id).single()
    ]);

    for (const result of [playersResult, npcVisitsResult, meResult]) if (result.error) throw result.error;

    renderMyHospital(meResult.data);
    renderPatients(playersResult.data || [], npcVisitsResult.data || []);
    startLiveUpdates();
    subscribeToHospitalChanges();
  } catch (error) {
    console.error(error);
    setHealerMessage(`❌ ${safe(error.message)}`, "error");
  }
}

function renderMyHospital(me) {
  const card = document.getElementById("my-hospital-card");
  if (!me.hospital_until) { card.hidden = true; return; }
  card.hidden = false;
  card.dataset.started = me.hospital_started_at;
  card.dataset.until = me.hospital_until;
  card.dataset.startHealth = me.hospital_start_health || 1;
  card.dataset.regen = me.hospital_regen_per_minute || 5;
  card.dataset.max = me.max_health || 500;
  card.innerHTML = `
    <h2>🛏️ You are recovering</h2>
    <p>${safe(me.hospital_reason || "You were carried into the healer hut.")}</p>
    <div class="hospital-stats">
      <span>Health <strong data-my-health>1/${me.max_health || 500}</strong></span>
      <span>Time remaining <strong data-my-time>--</strong></span>
    </div>
    <p class="regen-note">Your health continues regenerating while the timer counts down.</p>`;
}

function patientCard(patient) {
  const level = healingPercent();
  const locked = !level;
  const isPlayer = patient.kind === "player";
  const name = isPlayer ? patient.username : patient.npc.name;
  const job = isPlayer ? "Real player" : patient.npc.profession;
  const profile = isPlayer ? "Player" : "Village NPC";
  const start = isPlayer ? (patient.hospital_start_health || 1) : patient.start_health;
  const admitted = isPlayer ? patient.hospital_started_at : patient.admitted_at;
  const regen = isPlayer ? patient.hospital_regen_per_minute : patient.regen_per_minute;
  const until = isPlayer ? patient.hospital_until : patient.recovery_at;
  const max = isPlayer ? patient.max_health : patient.npc.max_health;
  const injury = isPlayer ? patient.hospital_reason : patient.injury_text;
  const target = patient.id;
  const portrait = isPlayer
    ? (patient.avatar_url ? `<img src="${safe(patient.avatar_url)}" alt="${safe(name)}">` : "🛡️")
    : (patient.npc.avatar_url ? `<img src="${safe(patient.npc.avatar_url)}" alt="${safe(name)}">` : safe(patient.npc.icon));
  const displayName = isPlayer && patient.player_number
    ? `<a href="profile.html?id=${Number(patient.player_number)}">${safe(name)}</a>`
    : safe(name);

  return `<article class="patient-card" data-start="${start}" data-admitted="${admitted}" data-regen="${regen}" data-until="${until}" data-max="${max}">
    <header>
      <div class="patient-icon">${portrait}</div>
      <div><h3>${displayName}</h3><p>${safe(job)} · <span>${profile}</span></p></div>
    </header>
    <p class="injury">${safe(injury)}</p>
    <div class="health-row"><span>❤️ <strong data-live-health>1/${max}</strong></span><span>⏳ <strong data-live-time>--</strong></span></div>
    <div class="health-track"><div data-health-bar></div></div>
    ${locked
      ? `<button disabled>🔒 Complete 10 healer jobs</button>`
      : `<button class="heal-button" data-kind="${patient.kind}" data-target="${target}">Heal to ${level}%</button>`}
  </article>`;
}

function renderPatients(players, npcVisits) {
  const otherPlayers = players.filter(p => p.id !== healerUser.id).map(p => ({ ...p, kind: "player" }));
  const npcs = npcVisits.map(v => ({ ...v, npc: v.village_npcs, kind: "npc" }));
  const patients = [...otherPlayers, ...npcs];
  document.getElementById("patient-count").textContent = patients.length;
  const grid = document.getElementById("hospital-grid");
  grid.innerHTML = patients.length ? patients.map(patientCard).join("") : "<p>Every bed is empty. Yrsa looks suspiciously relaxed.</p>";

  grid.querySelectorAll(".heal-button").forEach(button => {
    button.addEventListener("click", () => healPatient(button.dataset.kind, button.dataset.target));
  });
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
  document.querySelectorAll(".patient-card").forEach(card => {
    const health = liveHealth(card.dataset.start, card.dataset.admitted, card.dataset.regen, card.dataset.max);
    card.querySelector("[data-live-health]").textContent = `${health}/${card.dataset.max}`;
    card.querySelector("[data-live-time]").textContent = remainingText(card.dataset.until);
    card.querySelector("[data-health-bar]").style.width = `${Math.max(1, health / Number(card.dataset.max) * 100)}%`;
  });

  const mine = document.getElementById("my-hospital-card");
  if (!mine.hidden) {
    const health = liveHealth(mine.dataset.startHealth, mine.dataset.started, mine.dataset.regen, mine.dataset.max);
    mine.querySelector("[data-my-health]").textContent = `${health}/${mine.dataset.max}`;
    mine.querySelector("[data-my-time]").textContent = remainingText(mine.dataset.until);
  }
}

function startLiveUpdates() {
  clearInterval(hospitalTimer);
  hospitalTimer = setInterval(updateLiveValues, 1000);
}

loadVillageHealer();


function subscribeToHospitalChanges() {
  if (hospitalRealtimeChannel) return;
  hospitalRealtimeChannel = supabaseClient.channel("village-healer-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "players" }, payload => {
      if (payload.new?.hospital_until || payload.old?.hospital_until) loadVillageHealer();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "npc_hospital_visits" }, () => loadVillageHealer())
    .subscribe();
}
