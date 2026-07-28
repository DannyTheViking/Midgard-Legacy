let currentJobUser = null;
let openNpcId = null;

function escapeJobHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setJobMessage(message, type = "info") {
  const box = document.getElementById("job-yard-message");
  if (!box) return;
  box.className = `job-message ${type}`;
  box.innerHTML = message;
}

function requirementRows(requirements, inventoryMap) {
  return Object.entries(requirements || {}).map(([name, required]) => {
    const owned = Number(inventoryMap.get(name.toLowerCase()) || 0);
    const enough = owned >= Number(required);
    return `<div class="job-requirement ${enough ? "ready" : "missing"}">
      <span>${escapeJobHTML(name)}</span><strong>${owned}/${Number(required)}</strong>
    </div>`;
  }).join("");
}

async function getInventoryMap(playerId) {

  const inventoryMap = new Map();


  /* =====================================
     ADD ITEMS INTO THE TOTAL
  ===================================== */

  function addItems(rows) {

    for (const row of rows || []) {

      const itemName =
        String(row.items?.name || "")
          .trim()
          .toLowerCase();

      if (!itemName) {
        continue;
      }

      const currentQuantity =
        Number(inventoryMap.get(itemName) || 0);

      const addedQuantity =
        Number(row.quantity || 0);

      inventoryMap.set(
        itemName,
        currentQuantity + addedQuantity
      );

    }

  }


  /* =====================================
     LOAD BACKPACK AND ACTIVE CART
  ===================================== */

  const [
    backpackResult,
    activeCartResult
  ] = await Promise.all([

    supabaseClient
      .from("inventory")
      .select(`
        quantity,
        items (
          name
        )
      `)
      .eq("player_id", playerId),

    supabaseClient
      .from("player_carts")
      .select(`
        id,
        name,
        transport_type
      `)
      .eq("player_id", playerId)
      .eq("is_active", true)
      .maybeSingle()

  ]);


  if (backpackResult.error) {
    throw backpackResult.error;
  }

  if (activeCartResult.error) {
    throw activeCartResult.error;
  }


  /* =====================================
     ADD BACKPACK ITEMS
  ===================================== */

  addItems(
    backpackResult.data
  );


  /* =====================================
     ADD ACTIVE CART ITEMS
  ===================================== */

  const activeCartId =
    activeCartResult.data?.id;

  if (activeCartId) {

    const {
      data: cartItems,
      error: cartItemsError
    } = await supabaseClient
      .from("cart_items")
      .select(`
        quantity,
        items (
          name
        )
      `)
      .eq("cart_id", activeCartId);

    if (cartItemsError) {
      throw cartItemsError;
    }

    addItems(
      cartItems
    );

  }


  return inventoryMap;

}

function npcPortrait(npc) {
  if (npc.avatar_url) {
    return `<img src="${escapeJobHTML(npc.avatar_url)}" alt="${escapeJobHTML(npc.name)}" class="npc-avatar-image">`;
  }
  return `<span>${escapeJobHTML(npc.icon || "🧑")}</span>`;
}

function toggleNpcJob(npcId) {
  openNpcId = openNpcId === npcId ? null : npcId;
  document.querySelectorAll(".npc-job-card").forEach(card => {
    const isOpen = Number(card.dataset.npcId) === Number(openNpcId);
    card.classList.toggle("open", isOpen);
    const panel = card.querySelector(".npc-job-dropdown");
    const button = card.querySelector(".npc-card-button");
    if (panel) panel.hidden = !isOpen;
    if (button) button.setAttribute("aria-expanded", String(isOpen));
  });
}

async function loadMissionRewards(playerId) {
  const [playerResult, rewardResult, unlockResult] = await Promise.all([
    supabaseClient.from("players").select("mission_points").eq("id", playerId).single(),
    supabaseClient.from("mission_rewards").select("*").eq("is_active", true).order("sort_order"),
    supabaseClient.from("player_mission_unlocks").select("reward_code").eq("player_id", playerId)
  ]);
  for (const result of [playerResult, rewardResult, unlockResult]) if (result.error) throw result.error;

  const points = Number(playerResult.data?.mission_points || 0);
  document.getElementById("mission-point-balance").textContent = points;
  const unlocked = new Set((unlockResult.data || []).map(row => row.reward_code));
  const track = document.getElementById("mission-reward-track");
  track.innerHTML = (rewardResult.data || []).map(reward => {
    const owned = unlocked.has(reward.code);
    const affordable = points >= Number(reward.mission_point_cost);
    return `<article class="mission-reward-card ${owned ? "unlocked" : "locked"}">
      <div class="mission-reward-icon">${escapeJobHTML(reward.icon)}</div>
      <h3>${escapeJobHTML(reward.name)}</h3>
      <p class="mission-reward-description">${escapeJobHTML(reward.description)}</p>
      <div class="mission-reward-cost">📜 ${reward.mission_point_cost} Mission Points</div>
      ${owned
        ? `<button disabled>✅ Unlocked</button>`
        : `<button ${affordable ? "" : "disabled"} onclick="unlockMissionReward('${escapeJobHTML(reward.code)}')">${affordable ? "Unlock" : "Not enough points"}</button>`}
    </article>`;
  }).join("") || "<p>No Mission Point rewards have been added yet.</p>";
}

async function loadJobYard() {
  try {
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) { window.location.href = "login.html"; return; }
    currentJobUser = user;

    const [npcResult, templateResult, activeResult, progressResult, inventoryMap] = await Promise.all([
      supabaseClient.from("job_npcs").select("*").eq("is_active", true).order("id"),
      supabaseClient.from("job_templates").select("*").eq("is_active", true).order("id"),
      supabaseClient.from("player_jobs").select("*, job_templates(*)").eq("player_id", user.id).eq("status", "active"),
      supabaseClient.from("profession_progress").select("*").eq("player_id", user.id),
      getInventoryMap(user.id)
    ]);
    for (const result of [npcResult, templateResult, activeResult, progressResult]) if (result.error) throw result.error;

    const templates = templateResult.data || [];
    const activeByNpc = new Map((activeResult.data || []).map(job => [job.npc_id, job]));
    const progressByNpc = new Map((progressResult.data || []).map(row => [row.npc_id, row]));
    const npcs = npcResult.data || [];
    if (openNpcId === null && npcs.length) openNpcId = npcs[0].id;

    document.getElementById("npc-job-grid").innerHTML = npcs.map(npc => {
      const progress = progressByNpc.get(npc.id) || { jobs_completed: 0, training_level: 0 };
      const activeJob = activeByNpc.get(npc.id);
      const nextJobs = templates.filter(t => t.npc_id === npc.id && Number(t.minimum_completed) === Number(progress.jobs_completed));
      const healingPercent = npc.code === "healer" && progress.jobs_completed >= 10
        ? Math.min(100, 10 + Math.floor(progress.jobs_completed / 10) * 10) : 0;
      const role = npc.role || npc.profession || npc.description || "Village worker";
      const isOpen = Number(openNpcId) === Number(npc.id);

      let offer;
      if (activeJob) {
        const job = activeJob.job_templates;
        offer = `<div class="active-job">
          <span class="active-label">ACTIVE JOB</span>
          <h3>${escapeJobHTML(job.title)}</h3>
          <p>${escapeJobHTML(job.request_text)}</p>
          <div class="requirements">${requirementRows(job.requirements, inventoryMap)}</div>
          <div class="job-rewards">🪙 ${job.reward_silver} silver &nbsp; ⭐ ${job.reward_reputation} reputation &nbsp; 📜 ${job.reward_mission_points || 0} MP</div>
          <div class="job-buttons"><button onclick="handInJob(${activeJob.id})">Hand In</button><button class="secondary" onclick="abandonJob(${activeJob.id})">Abandon</button></div>
        </div>`;
      } else {
        offer = nextJobs.length ? nextJobs.map(job => `<article class="job-choice">
          <span class="active-label offer-label">JOB OFFER</span>
          <h3>${escapeJobHTML(job.title)}</h3>
          <p>${escapeJobHTML(job.request_text)}</p>
          <div class="requirements">${requirementRows(job.requirements, inventoryMap)}</div>
          <div class="job-rewards">🪙 ${job.reward_silver} silver &nbsp; ⭐ ${job.reward_reputation} reputation &nbsp; 📜 ${job.reward_mission_points || 0} MP</div>
          <button onclick="acceptJob(${job.id})">Accept Job</button>
        </article>`).join("") : `<p class="no-job-text">${progress.training_level > 0 ? "You have completed this villager's current training." : "This villager has no job for you yet."}</p>`;
      }

      return `<article class="npc-job-card ${isOpen ? "open" : ""}" data-npc-id="${npc.id}">
        <button class="npc-card-button" type="button" onclick="toggleNpcJob(${npc.id})" aria-expanded="${isOpen}">
          <div class="npc-icon">${npcPortrait(npc)}</div>
          <div class="npc-card-main"><h2>${escapeJobHTML(npc.name)}</h2><p>${escapeJobHTML(role)}</p></div>
          <div class="npc-card-progress"><span>Jobs <strong>${progress.jobs_completed}</strong></span><span>Training <strong>${progress.training_level}</strong></span>${npc.code === "healer" ? `<span>Healing <strong>${healingPercent ? healingPercent + "%" : "Locked"}</strong></span>` : ""}</div>
          <span class="npc-chevron">⌄</span>
        </button>
        <div class="npc-job-dropdown" ${isOpen ? "" : "hidden"}>${offer}</div>
      </article>`;
    }).join("");

    await loadMissionRewards(user.id);
    setJobMessage("Click a villager to hear their current job offer.", "info");
  } catch (error) {
    console.error("Job Yard failed:", error);
    setJobMessage(`❌ ${escapeJobHTML(error.message)}`, "error");
  }
}

async function acceptJob(templateId) {
  try {
    setJobMessage("Accepting job…", "info");
    const { error } = await supabaseClient.rpc("accept_village_job", { target_template_id: templateId });
    if (error) throw error;
    setJobMessage("✅ Job accepted. Gather or craft the requested supplies.", "success");
    await loadJobYard();
  } catch (error) { setJobMessage(`❌ ${escapeJobHTML(error.message)}`, "error"); }
}

async function handInJob(jobId) {
  try {
    setJobMessage("Checking your supplies…", "info");
    const { data, error } = await supabaseClient.rpc("hand_in_village_job", { target_job_id: jobId });
    if (error) throw error;
    const training = data?.training_message ? `<br><strong>🎓 ${escapeJobHTML(data.training_message)}</strong>` : "";
    setJobMessage(`✅ Job complete! You earned ${data.reward_silver} silver, ${data.reward_reputation} reputation and ${data.reward_mission_points || 0} Mission Points.${training}`, "success");
    await loadJobYard();
  } catch (error) { setJobMessage(`❌ ${escapeJobHTML(error.message)}`, "error"); }
}

async function abandonJob(jobId) {
  try {
    const { error } = await supabaseClient.rpc("abandon_village_job", { target_job_id: jobId });
    if (error) throw error;
    setJobMessage("Job abandoned. That villager can now offer another job.", "info");
    await loadJobYard();
  } catch (error) { setJobMessage(`❌ ${escapeJobHTML(error.message)}`, "error"); }
}

async function unlockMissionReward(code) {
  try {
    setJobMessage("Unlocking reward…", "info");
    const { data, error } = await supabaseClient.rpc("unlock_mission_reward", { target_reward_code: code });
    if (error) throw error;
    setJobMessage(`✅ ${escapeJobHTML(data.reward_name)} unlocked. You have ${data.remaining_points} Mission Points remaining.`, "success");
    await loadMissionRewards(currentJobUser.id);
  } catch (error) { setJobMessage(`❌ ${escapeJobHTML(error.message)}`, "error"); }
}

window.toggleNpcJob = toggleNpcJob;
window.acceptJob = acceptJob;
window.handInJob = handInJob;
window.abandonJob = abandonJob;
window.unlockMissionReward = unlockMissionReward;
loadJobYard();
