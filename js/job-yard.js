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


async function loadProfessionMarket(playerId) {
  const [shopResult, progressResult, ownedResult] = await Promise.all([
    supabaseClient
      .from("profession_shop_items")
      .select(`
        id,
        job_point_cost,
        minimum_jobs_completed,
        sort_order,
        items ( name, description ),
        job_npcs ( id, name, code, icon )
      `)
      .eq("is_active", true)
      .order("sort_order"),
    supabaseClient
      .from("profession_progress")
      .select("npc_id, job_points, jobs_completed")
      .eq("player_id", playerId),
    supabaseClient
      .from("player_profession_equipment")
      .select("equipment_key")
      .eq("player_id", playerId)
  ]);

  for (const result of [shopResult, progressResult, ownedResult]) {
    if (result.error) throw result.error;
  }

  const progressByNpc = new Map((progressResult.data || []).map(row => [Number(row.npc_id), row]));
  const totalJobPoints = (progressResult.data || []).reduce((sum, row) => sum + Number(row.job_points || 0), 0);
  const totalJobsCompleted = (progressResult.data || []).reduce((sum, row) => sum + Number(row.jobs_completed || 0), 0);
  const ownedKeys = new Set((ownedResult.data || []).map(row => row.equipment_key));
  const equipmentKeyByName = {
    "fishing net": "fishing_net",
    "fishing rod": "fishing_rod",
    "hunting knife": "hunting_knife",
    "hunting spear": "hunting_spear",
    "hunting trap": "hunting_trap"
  };

  const grid = document.getElementById("profession-market-grid");
  const rows = shopResult.data || [];

  grid.innerHTML = rows.map(item => {
    const npc = item.job_npcs || {};
    const progress = progressByNpc.get(Number(npc.id)) || { job_points: 0, jobs_completed: 0 };
    const itemName = item.items?.name || "Equipment";
    const key = equipmentKeyByName[itemName.toLowerCase()];
    const owned = key ? ownedKeys.has(key) : false;
    const enoughJobs = totalJobsCompleted >= Number(item.minimum_jobs_completed || 0);
    const affordable = totalJobPoints >= Number(item.job_point_cost || 0);

    let buttonText = "Buy";
    if (owned) buttonText = "✅ Owned Permanently";
    else if (!enoughJobs) buttonText = `Complete ${item.minimum_jobs_completed} jobs`;
    else if (!affordable) buttonText = "Not enough Job Points";

    return `<article class="mission-reward-card ${owned ? "unlocked" : "locked"}">
      <div class="mission-reward-icon">${escapeJobHTML(npc.icon || "🧰")}</div>
      <h3>${escapeJobHTML(itemName)}</h3>
      <p class="mission-reward-description">${escapeJobHTML(item.items?.description || "Permanent profession equipment.")}</p>
      <div class="mission-reward-cost">🧰 ${Number(item.job_point_cost)} Job Point${Number(item.job_point_cost) === 1 ? "" : "s"}</div>
      <small>${totalJobPoints} shared Job Points available · ${totalJobsCompleted} village jobs completed</small>
      <button ${owned || !enoughJobs || !affordable ? "disabled" : ""} onclick="buyProfessionItem(${Number(item.id)})">${buttonText}</button>
    </article>`;
  }).join("") || "<p>No Job Point equipment has been added yet.</p>";
}

async function buyProfessionItem(shopItemId) {
  try {
    setJobMessage("Buying profession equipment…", "info");
    const { data, error } = await supabaseClient.rpc("buy_profession_shop_item", {
      target_shop_item_id: shopItemId
    });
    if (error) throw error;
    setJobMessage(`✅ ${escapeJobHTML(data.item_name)} permanently unlocked. ${Number(data.remaining_points)} Job Points remain with ${escapeJobHTML(data.npc_name)}.`, "success");
    await Promise.all([loadProfessionMarket(currentJobUser.id), loadJobYard()]);
  } catch (error) {
    setJobMessage(`❌ ${escapeJobHTML(error.message)}`, "error");
  }
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

    const [npcResult, templateResult, activeResult, progressResult, playerResult, skillsResult, inventoryMap] = await Promise.all([
      supabaseClient.from("job_npcs").select("*").eq("is_active", true).order("id"),
      supabaseClient.from("job_templates").select("*").eq("is_active", true).order("id"),
      supabaseClient.from("player_jobs").select("*, job_templates(*)").eq("player_id", user.id).eq("status", "active"),
      supabaseClient.from("profession_progress").select("*").eq("player_id", user.id),
      supabaseClient.from("players").select("property_level").eq("id", user.id).single(),
      supabaseClient.from("skills").select("*").eq("player_id", user.id).maybeSingle(),
      getInventoryMap(user.id)
    ]);
    for (const result of [npcResult, templateResult, activeResult, progressResult, playerResult, skillsResult]) if (result.error) throw result.error;

    const propertyLevel = Number(playerResult.data?.property_level || 0);
    const skillRow = skillsResult.data || {};
    const templates = (templateResult.data || []).filter(template => {
      if (propertyLevel < Number(template.required_property_level || 0)) return false;
      const skillName = String(template.required_skill || "").toLowerCase();
      if (!skillName) return true;
      const level = Number(skillRow[`${skillName}_level`] || 1);
      return level >= Number(template.required_skill_level || 0);
    });
    const activeByNpc = new Map((activeResult.data || []).map(job => [job.npc_id, job]));
    const progressByNpc = new Map((progressResult.data || []).map(row => [row.npc_id, row]));
    const npcs = npcResult.data || [];
    if (openNpcId === null && npcs.length) openNpcId = npcs[0].id;

    document.getElementById("npc-job-grid").innerHTML = npcs.map(npc => {
      const progress = progressByNpc.get(npc.id) || { jobs_completed: 0, training_level: 0, job_points: 0 };
      const activeJob = activeByNpc.get(npc.id);
      const eligibleJobs = templates.filter(t => Number(t.npc_id) === Number(npc.id) && Number(t.minimum_completed || 0) <= Number(progress.jobs_completed || 0));
      const nextJobs = eligibleJobs.length ? [eligibleJobs[Number(progress.jobs_completed || 0) % eligibleJobs.length]] : [];
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
          <div class="job-rewards">🧰 ${job.reward_job_points || 1} Job Point${Number(job.reward_job_points || 1) === 1 ? "" : "s"} &nbsp; ⭐ ${job.reward_reputation} reputation &nbsp; 📜 ${job.reward_mission_points || 0} MP${Number(job.reward_silver || 0) > 0 ? ` &nbsp; 🪙 ${job.reward_silver} silver` : ""}</div>
          <div class="job-buttons"><button onclick="handInJob(${activeJob.id})">Hand In</button><button class="secondary" onclick="abandonJob(${activeJob.id})">Abandon</button></div>
        </div>`;
      } else {
        offer = nextJobs.length ? nextJobs.map(job => `<article class="job-choice">
          <span class="active-label offer-label">JOB OFFER</span>
          <h3>${escapeJobHTML(job.title)}</h3>
          <p>${escapeJobHTML(job.request_text)}</p>
          <div class="requirements">${requirementRows(job.requirements, inventoryMap)}</div>
          <div class="job-rewards">🧰 ${job.reward_job_points || 1} Job Point${Number(job.reward_job_points || 1) === 1 ? "" : "s"} &nbsp; ⭐ ${job.reward_reputation} reputation &nbsp; 📜 ${job.reward_mission_points || 0} MP${Number(job.reward_silver || 0) > 0 ? ` &nbsp; 🪙 ${job.reward_silver} silver` : ""}</div>
          <button onclick="acceptJob(${job.id})">Accept Job</button>
        </article>`).join("") : `<p class="no-job-text">${progress.training_level > 0 ? "You have completed this villager's current training." : "This villager has no job for you yet."}</p>`;
      }

      return `<article class="npc-job-card ${isOpen ? "open" : ""}" data-npc-id="${npc.id}">
        <button class="npc-card-button" type="button" onclick="toggleNpcJob(${npc.id})" aria-expanded="${isOpen}">
          <div class="npc-icon">${npcPortrait(npc)}</div>
          <div class="npc-card-main"><h2>${escapeJobHTML(npc.name)}</h2><p>${escapeJobHTML(role)}</p></div>
          <div class="npc-card-progress"><span>Jobs <strong>${progress.jobs_completed}</strong></span><span>Job Points <strong>${progress.job_points || 0}</strong></span><span>Training <strong>${progress.training_level}</strong></span>${npc.code === "healer" ? `<span>Healing <strong>${healingPercent ? healingPercent + "%" : "Locked"}</strong></span>` : ""}</div>
          <span class="npc-chevron">⌄</span>
        </button>
        <div class="npc-job-dropdown" ${isOpen ? "" : "hidden"}>${offer}</div>
      </article>`;
    }).join("");

    await Promise.all([
      loadMissionRewards(user.id),
      loadProfessionMarket(user.id)
    ]);
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
    setJobMessage(`✅ Job complete! You earned ${data.reward_job_points || 1} Job Point${Number(data.reward_job_points || 1) === 1 ? "" : "s"}, ${data.reward_reputation} reputation and ${data.reward_mission_points || 0} Mission Points.${Number(data.reward_silver || 0) > 0 ? ` You also earned ${data.reward_silver} Silver.` : ""}${training}`, "success");
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
window.buyProfessionItem = buyProfessionItem;
loadJobYard();
