const VILLAGE_HONEY_SECONDS = typeof getGameTimerSeconds === "function"
  ? getGameTimerSeconds("tutorial_honey_seconds", 5 * 60)
  : 5 * 60;
let villageApiaryPlayer = null;
let villageApiaryTimer = null;

async function loadVillageApiary() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) { window.location.href = "login.html"; return; }
  const { data: player, error } = await supabaseClient.from("players")
    .select("tutorial_step,tutorial_complete,tutorial_progress,tutorial_honey_started_at,tutorial_honey_collected")
    .eq("id", user.id).single();
  if (error || !player) return showVillageMessage("❌ The village apiary could not be loaded.");
  if (player.tutorial_complete) { window.location.href = "property.html"; return; }

  // Repair old/stuck saves that reached the former build-a-hive step.
  if (player.tutorial_step === TUTORIAL_STEPS.FORGE_IRON_NAILS) {
    await supabaseClient.from("players").update({ tutorial_step: TUTORIAL_STEPS.CRAFT_BUCKET }).eq("id", user.id);
    window.location.href = "workbench.html"; return;
  }
  if (player.tutorial_step < TUTORIAL_STEPS.VISIT_VILLAGE_APIARY) {
    showVillageMessage("📜 Finish the current King’s Challenge objective before using the royal hives.");
  }
  if (player.tutorial_step > TUTORIAL_STEPS.COLLECT_HONEY) {
    window.location.href = player.tutorial_step === TUTORIAL_STEPS.FILL_WATER_BUCKET ? "inventory.html" : "village.html";
    return;
  }

  let startedAt = player.tutorial_honey_started_at;
  if (player.tutorial_step === TUTORIAL_STEPS.VISIT_VILLAGE_APIARY && !startedAt) {
    startedAt = new Date().toISOString();
    const progress = { ...(player.tutorial_progress || {}), village_apiary_visits: 1 };
    await supabaseClient.from("players").update({
      tutorial_honey_started_at: startedAt,
      tutorial_honey_collected: false,
      tutorial_progress: progress,
      tutorial_step: TUTORIAL_STEPS.COLLECT_HONEY
    }).eq("id", user.id).eq("tutorial_step", TUTORIAL_STEPS.VISIT_VILLAGE_APIARY);
    player.tutorial_step = TUTORIAL_STEPS.COLLECT_HONEY;
    player.tutorial_progress = progress;
  }
  villageApiaryPlayer = { ...player, tutorial_honey_started_at: startedAt };
  renderVillageHives();
  clearInterval(villageApiaryTimer);
  villageApiaryTimer = setInterval(renderVillageHives, 1000);
  if (typeof refreshTutorialUI === "function") refreshTutorialUI();
}

function villageHoneyRemaining() {
  const start = new Date(villageApiaryPlayer?.tutorial_honey_started_at || 0).getTime();
  return Math.max(0, start + VILLAGE_HONEY_SECONDS * 1000 - Date.now());
}
function formatVillageTime(ms) {
  const total = Math.ceil(ms / 1000), m = Math.floor(total / 60), s = total % 60;
  return `${m}m ${s}s`;
}
function renderVillageHives() {
  const root = document.getElementById("village-hive-slots"); if (!root) return;
  const remaining = villageHoneyRemaining();
  const ready = remaining <= 0 && !villageApiaryPlayer?.tutorial_honey_collected;
  const names = ["Ragnhild’s Teaching Hive", "The King’s Hive", "Freydís’ Heather Hive", "Harald’s Royal Hive", "The Ancient Oak Hive"];
  root.innerHTML = names.map((name, index) => {
    if (index === 0) return `<article class="crafting-card"><h3>🐝 ${name}</h3><p>Status: <span class="green">${ready ? "Honey Ready" : "Producing Royal Honey"}</span></p><p>${ready ? "🍯 Your bucket can now be filled." : `⏳ Ready in ${formatVillageTime(remaining)}`}</p>${ready ? '<button onclick="collectVillageHoney()">🍯 Fill Empty Bucket</button>' : '<button disabled>⏳ Wait for Honey</button>'}<p>The Queen Bee already lives in this established hive.</p></article>`;
    return `<article class="crafting-card locked"><h3>🐝 ${name}</h3><p>Status: Established Village Hive</p><p>Ragnhild is tending this hive for the village.</p><button disabled>Reserved</button></article>`;
  }).join("");
}

async function collectVillageHoney() {
  if (villageHoneyRemaining() > 0) {
    return showVillageMessage("⏳ The royal honey is not ready yet.");
  }

  // Server-side tutorial action. This deliberately uses the shared resource
  // pool, so an Empty Bucket in the King's Handcart counts exactly the same
  // as one in the backpack or Storage Yard.
  const { data, error } = await supabaseClient.rpc("collect_village_tutorial_honey");

  if (error) {
    return showVillageMessage(`❌ ${error.message}`);
  }

  villageApiaryPlayer.tutorial_honey_collected = true;
  villageApiaryPlayer.tutorial_step = TUTORIAL_STEPS.FILL_WATER_BUCKET;
  villageApiaryPlayer.tutorial_progress = data?.tutorial_progress || {
    ...(villageApiaryPlayer.tutorial_progress || {}),
    honey_buckets: 1
  };

  showVillageMessage(
    "🍯 Ragnhild fills one of your Empty Buckets with royal honey. Now fill your second bucket with water."
  );

  renderVillageHives();

  if (typeof window.refreshTutorialAfterAction === "function") {
    await window.refreshTutorialAfterAction();
  } else if (typeof refreshTutorialUI === "function") {
    await refreshTutorialUI();
  }

  setTimeout(() => {
    window.location.href = "inventory.html";
  }, 1600);
}
function showVillageMessage(message) { const el = document.getElementById("village-apiary-message"); if (el) el.innerHTML = message; }
loadVillageApiary();
