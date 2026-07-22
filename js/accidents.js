/* Shared profession accident system. Keep true while testing the healer. */
const ACCIDENT_TEST_MODE = true;

const PROFESSION_ACCIDENTS = Object.freeze({
  forest: [
    {
      shortReason: "Flattened by a falling tree.",
      longMessage: "🌲 <strong>The tree began falling the wrong way!</strong><br><br>You tried to run, tripped over a root and were flattened by the falling tree.<br><br>You wake up inside the Village Healer hut.",
      damage: 495,
      minutes: ACCIDENT_TEST_MODE ? 2 : 120
    },
    {
      shortReason: "Knocked unconscious by a falling branch.",
      longMessage: "🌿 A heavy branch snapped above you and struck your head.<br><br>You wake up inside the Village Healer hut.",
      damage: 350,
      minutes: ACCIDENT_TEST_MODE ? 1 : 30
    }
  ],
  mining: [
    {
      shortReason: "Buried in a mine collapse.",
      longMessage: "⛏️ The tunnel ceiling cracked above you.<br><br>You tried to escape, slipped on loose stone and were buried beneath the rockfall.<br><br>You wake up inside the Village Healer hut.",
      damage: 490,
      minutes: ACCIDENT_TEST_MODE ? 3 : 180
    },
    {
      shortReason: "Crushed foot from a falling boulder.",
      longMessage: "🪨 A large boulder broke loose and crushed your foot.<br><br>You wake up inside the Village Healer hut.",
      damage: 420,
      minutes: ACCIDENT_TEST_MODE ? 2 : 60
    }
  ],
  beekeeping: [
    {
      shortReason: "Attacked by a swarm of bees.",
      longMessage: "🐝 The colony swarmed you. Unable to see through the bees, you fell down a steep bank.<br><br>You wake up inside the Village Healer hut.",
      damage: 380,
      minutes: ACCIDENT_TEST_MODE ? 2 : 45
    }
  ]
});

async function admitForAccident(accident) {
  const { data, error } = await supabaseClient.rpc("admit_myself_to_hospital", {
    short_reason: accident.shortReason,
    damage_amount: accident.damage,
    hospital_minutes: accident.minutes,
    long_message: accident.longMessage
  });
  if (error) throw error;

  const modal = document.createElement("div");
  modal.className = "game-modal";
  modal.innerHTML = `<div class="modal-card"><h2>⚠️ Serious Accident</h2><p>${accident.longMessage}</p><p><strong>Hospital reason:</strong> ${accident.shortReason}</p><button id="accident-healer-button">Go to Village Healer</button></div>`;
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
  await admitForAccident(accidents[0]);
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
