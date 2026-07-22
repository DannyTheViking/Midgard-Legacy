let currentJobUser = null;

function escapeJobHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
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
    return `
      <div class="job-requirement ${enough ? "ready" : "missing"}">
        <span>${escapeJobHTML(name)}</span>
        <strong>${owned}/${Number(required)}</strong>
      </div>`;
  }).join("");
}

async function getInventoryMap(playerId) {
  const { data, error } = await supabaseClient
    .from("inventory")
    .select("quantity, items(name)")
    .eq("player_id", playerId);
  if (error) throw error;
  return new Map((data || []).map(row => [String(row.items?.name || "").toLowerCase(), Number(row.quantity || 0)]));
}

async function loadJobYard() {
  try {
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      window.location.href = "login.html";
      return;
    }
    currentJobUser = user;

    const [npcResult, templateResult, activeResult, progressResult, inventoryMap] = await Promise.all([
      supabaseClient.from("job_npcs").select("*").eq("is_active", true).order("id"),
      supabaseClient.from("job_templates").select("*").eq("is_active", true).order("id"),
      supabaseClient.from("player_jobs").select("*, job_templates(*)").eq("player_id", user.id).eq("status", "active"),
      supabaseClient.from("profession_progress").select("*").eq("player_id", user.id),
      getInventoryMap(user.id)
    ]);

    for (const result of [npcResult, templateResult, activeResult, progressResult]) {
      if (result.error) throw result.error;
    }

    const templates = templateResult.data || [];
    const activeByNpc = new Map((activeResult.data || []).map(job => [job.npc_id, job]));
    const progressByNpc = new Map((progressResult.data || []).map(row => [row.npc_id, row]));
    const grid = document.getElementById("npc-job-grid");

    grid.innerHTML = (npcResult.data || []).map(npc => {
      const progress = progressByNpc.get(npc.id) || { jobs_completed: 0, training_level: 0 };
      const activeJob = activeByNpc.get(npc.id);
      const available = templates.filter(t => t.npc_id === npc.id && Number(t.minimum_completed) <= Number(progress.jobs_completed));
      const healingPercent = npc.code === "healer" && progress.jobs_completed >= 10
        ? Math.min(100, 10 + Math.floor(progress.jobs_completed / 10) * 10)
        : 0;

      let body;
      if (activeJob) {
        const job = activeJob.job_templates;
        body = `
          <div class="active-job">
            <span class="active-label">ACTIVE JOB</span>
            <h3>${escapeJobHTML(job.title)}</h3>
            <p>${escapeJobHTML(job.request_text)}</p>
            <div class="requirements">${requirementRows(job.requirements, inventoryMap)}</div>
            <div class="job-rewards">🪙 ${job.reward_silver} silver &nbsp; ⭐ ${job.reward_reputation} reputation</div>
            <div class="job-buttons">
              <button onclick="handInJob(${activeJob.id})">Hand In</button>
              <button class="secondary" onclick="abandonJob(${activeJob.id})">Abandon</button>
            </div>
          </div>`;
      } else {
        body = `
          <div class="job-choice-list">
            ${available.map(job => `
              <article class="job-choice">
                <h3>${escapeJobHTML(job.title)}</h3>
                <p>${escapeJobHTML(job.request_text)}</p>
                <div class="requirements">${requirementRows(job.requirements, inventoryMap)}</div>
                <div class="job-rewards">🪙 ${job.reward_silver} &nbsp; ⭐ ${job.reward_reputation}</div>
                <button onclick="acceptJob(${job.id})">Accept Job</button>
              </article>`).join("") || "<p>No jobs are available yet.</p>"}
          </div>`;
      }

      return `
        <section class="npc-job-card">
          <header class="npc-header">
            <div class="npc-icon">${npc.icon}</div>
            <div>
              <h2>${escapeJobHTML(npc.name)}</h2>
              <p>${escapeJobHTML(npc.description)}</p>
            </div>
          </header>
          <div class="npc-progress">
            <span>Jobs: <strong>${progress.jobs_completed}</strong></span>
            <span>Training: <strong>${progress.training_level}</strong></span>
            ${npc.code === "healer" ? `<span>Healing: <strong>${healingPercent ? healingPercent + "%" : "Locked"}</strong></span>` : ""}
          </div>
          ${body}
        </section>`;
    }).join("");

    setJobMessage("Each villager may give you only one job at a time.", "info");
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
  } catch (error) {
    setJobMessage(`❌ ${escapeJobHTML(error.message)}`, "error");
  }
}

async function handInJob(jobId) {
  try {
    setJobMessage("Checking your supplies…", "info");
    const { data, error } = await supabaseClient.rpc("hand_in_village_job", { target_job_id: jobId });
    if (error) throw error;
    const training = data?.training_message ? `<br><strong>🎓 ${escapeJobHTML(data.training_message)}</strong>` : "";
    setJobMessage(`✅ Job complete! You earned ${data.reward_silver} silver and ${data.reward_reputation} reputation.${training}`, "success");
    await loadJobYard();
  } catch (error) {
    setJobMessage(`❌ ${escapeJobHTML(error.message)}`, "error");
  }
}

async function abandonJob(jobId) {
  try {
    const { error } = await supabaseClient.rpc("abandon_village_job", { target_job_id: jobId });
    if (error) throw error;
    setJobMessage("Job abandoned. That villager can now offer another job.", "info");
    await loadJobYard();
  } catch (error) {
    setJobMessage(`❌ ${escapeJobHTML(error.message)}`, "error");
  }
}

window.acceptJob = acceptJob;
window.handInJob = handInJob;
window.abandonJob = abandonJob;
loadJobYard();
