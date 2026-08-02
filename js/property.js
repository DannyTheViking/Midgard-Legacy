"use strict";

const propertyStages = [
  { level:0,name:"Old Shack",image:"../images/property/old shack.png",alt:"A broken and run-down wooden shack",description:"An abandoned shack with damaged timbers and unsafe walls." },
  { level:1,name:"Upgraded Shack",image:"../images/property/upgraded shack.png",alt:"A repaired wooden Viking shack",description:"A secure repaired home that unlocks space for your first Apiary." },
  { level:2,name:"Small House",image:"../images/property/small house.png",alt:"A small Viking wooden house",description:"A proper Viking house with stronger foundations and more living space." },
  { level:3,name:"Medium House",image:"../images/property/med house.png",alt:"A medium-sized Viking house",description:"A larger timber-and-stone homestead showing your growing influence." },
  { level:4,name:"Large House",image:"../images/property/large house.png",alt:"A large two-floor Viking house",description:"A grand two-floor homestead worthy of a wealthy Viking." }
];

let CURRENT_PROPERTY_LEVEL = 0;
let propertyUser = null;

function propertyStage(level){ return propertyStages.find(stage => stage.level === level); }
function propertySafe(value){ return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }

function propertyMaterialIcon(itemName){
  const name=String(itemName||"").toLowerCase();
  if(name.includes("beam"))return "🪚";
  if(name.includes("nail"))return "🔩";
  if(name.includes("rock")||name.includes("stone"))return "🪨";
  if(name.includes("stick"))return "🌿";
  if(name.includes("plank")||name.includes("wood"))return "🪵";
  return "📦";
}

function displayProperty(stage,isPreview=false){
  if(!stage)return;
  document.getElementById("current-property-image").src=stage.image;
  document.getElementById("current-property-image").alt=stage.alt;
  document.getElementById("current-property-name").textContent=stage.name;
  document.getElementById("current-property-level").textContent=`Level ${stage.level}${isPreview?" Preview":""}`;
  document.getElementById("current-property-description").textContent=stage.description;
  const returnButton = document.getElementById("return-current-property");
  if (returnButton) returnButton.hidden = !isPreview;
}

async function inventoryByName(playerId){
  const [inventoryResult,storageResult,itemsResult]=await Promise.all([
    supabaseClient.from("inventory").select("item_id,quantity").eq("player_id",playerId),
    supabaseClient.from("player_storage").select("item_id,quantity").eq("player_id",playerId),
    supabaseClient.from("items").select("id,name")
  ]);
  if(inventoryResult.error)throw inventoryResult.error;
  if(storageResult.error && storageResult.error.code!=="42P01")throw storageResult.error;
  if(itemsResult.error)throw itemsResult.error;
  const names=new Map((itemsResult.data||[]).map(item=>[Number(item.id),String(item.name||"").toLowerCase()]));
  const totals=new Map();
  for(const row of [...(inventoryResult.data||[]),...(storageResult.data||[])]){
    const name=names.get(Number(row.item_id));
    if(name)totals.set(name,Number(totals.get(name)||0)+Number(row.quantity||0));
  }
  return totals;
}

async function renderUpgradePanel(){
  const panel=document.querySelector(".next-upgrade-panel");
  if(!panel)return;
  if(CURRENT_PROPERTY_LEVEL>=4){
    panel.innerHTML='<span class="property-eyebrow">Homestead Complete</span><h2>Large House</h2><p>Your homestead is fully upgraded.</p>';
    return;
  }
  const nextLevel=CURRENT_PROPERTY_LEVEL+1;
  const [requirementsResult,inventory]=await Promise.all([
    supabaseClient.from("property_upgrade_requirements").select("item_name,quantity").eq("target_level",nextLevel).order("item_name"),
    inventoryByName(propertyUser.id)
  ]);
  if(requirementsResult.error)throw requirementsResult.error;
  const requirements=requirementsResult.data||[];
  const ready=requirements.every(req=>Number(inventory.get(req.item_name.toLowerCase())||0)>=Number(req.quantity));
  const current=propertyStage(CURRENT_PROPERTY_LEVEL);
  const next=propertyStage(nextLevel);
  panel.innerHTML=`
    <span class="property-eyebrow">Next Upgrade</span>
    <h2>${propertySafe(next.name)}</h2>
    <p class="upgrade-summary">Build the next stage using materials gathered and crafted around the village.</p>
    <div class="upgrade-comparison"><div class="comparison-stage"><img src="${current.image}" alt="${current.alt}"><span>${current.name}</span></div><span class="comparison-arrow">➜</span><div class="comparison-stage"><img src="${next.image}" alt="${next.alt}"><span>${next.name}</span></div></div>
    <div class="active-upgrade-requirements"><h3>Required Materials</h3>${requirements.map(req=>{
      const owned=Number(inventory.get(req.item_name.toLowerCase())||0); const enough=owned>=Number(req.quantity);
      return `<div class="material-row ${enough?"material-ready":"material-missing"}"><div class="material-name"><span>${propertyMaterialIcon(req.item_name)}</span><span>${propertySafe(req.item_name)}</span></div><strong>${owned}/${req.quantity}</strong></div>`;
    }).join("")}</div>
    <button id="upgrade-property-button" class="property-upgrade-button" type="button" ${ready?"":"disabled"}>${ready?`Upgrade to ${propertySafe(next.name)}`:"More materials required"}</button>
    <p id="property-upgrade-message" class="test-version-notice">Upgrades permanently consume the listed materials.</p>`;
  document.getElementById("upgrade-property-button")?.addEventListener("click",upgradeProperty);
}

async function upgradeProperty(){
  const message=document.getElementById("property-upgrade-message");
  try{
    message.textContent="Building your property…";
    const {data,error}=await supabaseClient.rpc("upgrade_my_property");
    if(error)throw error;
    CURRENT_PROPERTY_LEVEL=Number(data.property_level);
    message.textContent="✅ Property upgraded.";
    displayProperty(propertyStage(CURRENT_PROPERTY_LEVEL));
    renderPropertyStationCards();
    await renderUpgradePanel();
  }catch(error){ message.textContent=`❌ ${error.message}`; }
}



function replacePropertyCardWithLink(card, href, statusText) {
  if (!card || card.tagName === "A") return card;
  const link = document.createElement("a");
  link.id = card.id;
  link.className = "homestead-work-card available";
  link.href = href;
  link.innerHTML = card.innerHTML;
  card.replaceWith(link);
  const status = link.querySelector(".homestead-work-status");
  if (status) status.textContent = statusText;
  return link;
}

function renderPropertyStationCards() {
  const workbenchCard = document.getElementById("workbench-building-card");
  const forgeCard = document.getElementById("forge-building-card");

  if (CURRENT_PROPERTY_LEVEL >= 0) {
    replacePropertyCardWithLink(
      workbenchCard,
      "workbench.html",
      `Open Workbench · Level ${Math.max(1, CURRENT_PROPERTY_LEVEL)}`
    );
  } else if (workbenchCard) {
    const status = workbenchCard.querySelector(".homestead-work-status");
    if (status) status.textContent = "🔒 Requires Property Level 1";
  }

  if (CURRENT_PROPERTY_LEVEL >= 3) {
    replacePropertyCardWithLink(
      forgeCard,
      "forge.html",
      `Open Forge · Level ${CURRENT_PROPERTY_LEVEL - 2}`
    );
  } else if (forgeCard) {
    const status = forgeCard.querySelector(".homestead-work-status");
    if (status) status.textContent = "🔒 Requires Property Level 3";
  }
}

async function loadSavedPropertyLevel(){
  try{
    const {data:{user}}=await supabaseClient.auth.getUser();
    if(!user){window.location.href="login.html";return;}
    propertyUser=user;
    const {data,error}=await supabaseClient.from("players").select("property_level").eq("id",user.id).single();
    if(error)throw error;
    CURRENT_PROPERTY_LEVEL=Math.max(0,Number(data.property_level)||0);
    displayProperty(propertyStage(CURRENT_PROPERTY_LEVEL));
    renderPropertyStationCards();
    await renderUpgradePanel();
    const apiaryCard=document.getElementById("apiary-building-card");
    if(apiaryCard&&CURRENT_PROPERTY_LEVEL>=1&&apiaryCard.tagName!=="A"){
      const link=document.createElement("a");link.id=apiaryCard.id;link.className="property-building available";link.href="apiary.html";link.innerHTML=apiaryCard.innerHTML;apiaryCard.replaceWith(link);
      document.getElementById("apiary-unlock-text").textContent="Available";
    }
  }catch(error){console.error("Property failed:",error);}
}

document.querySelectorAll(".preview-property-button").forEach(button=>button.addEventListener("click",()=>{const level=Number(button.dataset.previewLevel);displayProperty(propertyStage(level),level!==CURRENT_PROPERTY_LEVEL);}));
document.getElementById("return-current-property")?.addEventListener("click",()=>displayProperty(propertyStage(CURRENT_PROPERTY_LEVEL)));
loadSavedPropertyLevel();
