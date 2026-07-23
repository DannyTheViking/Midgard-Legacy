/* Shared profession accident system. Keep true while testing the healer. */
const ACCIDENT_TEST_MODE = true;

const FOREST_HOSPITAL_ACCIDENTS = Object.freeze([
  {
    shortReason: "Flattened by a falling tree.",
    longMessage: "🌲 <strong>The tree began falling the wrong way!</strong><br><br>You tried to run, tripped over a root and were flattened by the falling tree.<br><br>You wake up inside the Village Healer hut.",
    minutes: ACCIDENT_TEST_MODE ? 2 : 120
  },
  {
    shortReason: "Knocked unconscious by a falling branch.",
    longMessage: "🌿 A huge branch snapped above you and struck you across the head.<br><br>Everything went dark. You wake up inside the Village Healer hut.",
    minutes: ACCIDENT_TEST_MODE ? 1 : 35
  },
  {
    shortReason: "Crushed beneath a rolling log.",
    longMessage: "🪵 A cut log rolled downhill faster than expected.<br><br>You jumped aside, slipped in the mud and the log rolled straight over you.<br><br>You wake up inside the Village Healer hut.",
    minutes: ACCIDENT_TEST_MODE ? 2 : 75
  },
  {
    shortReason: "Severe axe wound.",
    longMessage: "🪓 Your axe glanced off the trunk and buried itself deep in your leg.<br><br>You collapse before help arrives and wake up inside the Village Healer hut.",
    minutes: ACCIDENT_TEST_MODE ? 2 : 60
  },
  {
    shortReason: "Impaled by a broken branch.",
    longMessage: "🌳 You stumbled backwards onto a snapped branch sticking from a fallen tree.<br><br>The villagers carried you to the Village Healer hut.",
    minutes: ACCIDENT_TEST_MODE ? 3 : 100
  },
  {
    shortReason: "Trampled by a startled elk.",
    longMessage: "🫎 An elk burst from the undergrowth while you were chopping.<br><br>You froze, it did not, and you wake up inside the Village Healer hut.",
    minutes: ACCIDENT_TEST_MODE ? 2 : 80
  },
  {
    shortReason: "Mauled by an angry boar.",
    longMessage: "🐗 Your chopping disturbed a wild boar's resting place.<br><br>It charged before you could climb to safety. You wake up inside the Village Healer hut.",
    minutes: ACCIDENT_TEST_MODE ? 3 : 110
  },
  {
    shortReason: "Fell from a tall tree.",
    longMessage: "🌲 You climbed to free a trapped branch.<br><br>The branch snapped, the tree shook and you landed considerably faster than planned.<br><br>You wake up inside the Village Healer hut.",
    minutes: ACCIDENT_TEST_MODE ? 2 : 70
  },
  {
    shortReason: "Pinned beneath a split trunk.",
    longMessage: "🪵 The rotten trunk split down the middle without warning.<br><br>One half pinned you to the ground until the villagers found you.<br><br>You wake up inside the Village Healer hut.",
    minutes: ACCIDENT_TEST_MODE ? 3 : 140
  },
  {
    shortReason: "Swept into the river by timber.",
    longMessage: "🌊 A stack of timber broke loose and knocked you into the river.<br><br>You were dragged downstream before someone pulled you out.<br><br>You wake up inside the Village Healer hut.",
    minutes: ACCIDENT_TEST_MODE ? 2 : 90
  }
]);

const PROFESSION_ACCIDENTS = Object.freeze({
  forest: FOREST_HOSPITAL_ACCIDENTS,
  mining: [
    {
      shortReason: "Buried in a mine collapse.",
      longMessage: "⛏️ The tunnel ceiling cracked above you.<br><br>You tried to escape, slipped on loose stone and were buried beneath the rockfall.<br><br>You wake up inside the Village Healer hut.",
      minutes: ACCIDENT_TEST_MODE ? 3 : 180
    },
    {
      shortReason: "Crushed foot from a falling boulder.",
      longMessage: "🪨 A large boulder broke loose and crushed your foot.<br><br>You wake up inside the Village Healer hut.",
      minutes: ACCIDENT_TEST_MODE ? 2 : 60
    }
  ],
  beekeeping: [
    {
      shortReason: "Attacked by a swarm of bees.",
      longMessage: "🐝 The colony swarmed you. Unable to see through the bees, you fell down a steep bank.<br><br>You wake up inside the Village Healer hut.",
      minutes: ACCIDENT_TEST_MODE ? 2 : 45
    }
  ]
});

async function admitForAccident(accident) {
  const { data, error } = await supabaseClient.rpc("admit_myself_to_hospital", {
    short_reason: accident.shortReason,
    /* Deliberately larger than any normal maximum so testing always starts at 1 HP. */
    damage_amount: 999999,
    hospital_minutes: accident.minutes,
    long_message: accident.longMessage
  });
  if (error) throw error;

  const modal = document.createElement("div");
  modal.className = "game-modal";
  modal.innerHTML = `<div class="modal-card"><h2>⚠️ Serious Accident</h2><p>${accident.longMessage}</p><button id="accident-healer-button">Go to Village Healer</button></div>`;
  document.body.appendChild(modal);
  document.getElementById("accident-healer-button").addEventListener("click", () => {
    window.location.href = "village-healer.html?admitted=true";
  });
  return data;
}

async function maybeTriggerProfessionAccident(activity) {
  const accidents = PROFESSION_ACCIDENTS[activity] || [];
  if (!accidents.length) return false;
  const chance = ACCIDENT_TEST_MODE ? 0.10 : 0.0025;
  if (Math.random() >= chance) return false;
  const accident = accidents[Math.floor(Math.random() * accidents.length)];
  await admitForAccident(accident);
  return true;
}

async function testMedicalAccident(activity = "forest") {
  const accidents = PROFESSION_ACCIDENTS[activity] || PROFESSION_ACCIDENTS.forest;
  const accident = accidents[Math.floor(Math.random() * accidents.length)];
  await admitForAccident(accident);
}

window.maybeTriggerProfessionAccident = maybeTriggerProfessionAccident;
window.testMedicalAccident = testMedicalAccident;

async function grantNamedResource(itemName, quantity) {
  if (!quantity || quantity < 1) return;
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;
  const { data: item, error: itemError } = await supabaseClient.from("items").select("id").eq("name", itemName).single();
  if (itemError) throw itemError;
  const { data: row, error: rowError } = await supabaseClient.from("inventory").select("id,quantity")
    .eq("player_id", user.id).eq("item_id", item.id).maybeSingle();
  if (rowError) throw rowError;
  const result = row
    ? await supabaseClient.from("inventory").update({ quantity: Number(row.quantity) + quantity }).eq("id", row.id)
    : await supabaseClient.from("inventory").insert({ player_id: user.id, item_id: item.id, quantity });
  if (result.error) throw result.error;
}
window.grantNamedResource = grantNamedResource;
