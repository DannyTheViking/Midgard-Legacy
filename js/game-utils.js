function reputationTitle(n){ const r=[[1000000,'Legend of Midgard'],[500000,'Jarl'],[250000,'Hersir'],[100000,'Thegn'],[50000,'Housecarl'],[25000,'Veteran'],[10000,'Raider'],[5000,'Warrior'],[2500,'Drengr'],[1000,'Freeman'],[0,'Thrall']]; return r.find(([m])=>Number(n||0)>=m)[1]; }
function wealthTitle(n){ const r=[[1000000000,"Midgard's Richest"],[500000000,"Realm's Fortune"],[250000000,"King's Wealth"],[100000000,'Dragon Hoard'],[50000000,"King's Favourite"],[25000000,'Royal Treasurer'],[10000000,'High Lord'],[5000000,'Duke'],[2500000,'Earl'],[1000000,'Lord'],[500000,'Baron'],[250000,'Noble'],[100000,'Affluent'],[50000,'Wealthy'],[25000,'Prosperous'],[10000,'Merchant'],[5000,'Tradesman'],[2500,'Commoner'],[1000,'Labourer'],[500,'Pauper'],[100,'Beggar'],[0,'Penniless']]; return r.find(([m])=>Number(n||0)>=m)[1]; }
function reviveTitle(n){return Number(n||0)>=1000?'Hand of Eir':Number(n||0)>=100?'Healer':Number(n||0)>=10?'First Aider':'Unproven';}
function jailbreakTitle(n){return Number(n||0)>=1000?'Breaker of Chains':Number(n||0)>=100?'Liberator':Number(n||0)>=10?'Lockpicker':'Lawful';}
function pvpTitle(n){return Number(n||0)>=1000?'Warlord':Number(n||0)>=100?'Berserker':Number(n||0)>=10?'Fighter':'Untested';}
async function getItemByName(name){const {data}=await supabaseClient.from('items').select('*').eq('name',name).maybeSingle();return data;}
async function addInventoryById(playerId,itemId,amount){const {data:r}=await supabaseClient.from('inventory').select('*').eq('player_id',playerId).eq('item_id',itemId).maybeSingle();if(r) return supabaseClient.from('inventory').update({quantity:Number(r.quantity||0)+Number(amount||0)}).eq('id',r.id);return supabaseClient.from('inventory').insert({player_id:playerId,item_id:itemId,quantity:amount});}
async function refreshMyNetWorth(){
 const {data:{user}}=await supabaseClient.auth.getUser(); if(!user)return 0;
 const {data,error}=await supabaseClient.rpc('recalculate_player_net_worth',{p_player_id:user.id});
 if(error){console.warn('Net worth refresh unavailable until migration is run:',error.message);return null;}
 return Number(data||0);
}
async function getBarterQuote(offeredItemId,wantedItemId,wantedQuantity=1){
 const ids=[Number(offeredItemId),Number(wantedItemId)];
 const {data,error}=await supabaseClient.from('item_values').select('item_id,silver_value').in('item_id',ids);
 if(error)throw error;
 const offered=Number(data?.find(x=>Number(x.item_id)===ids[0])?.silver_value||0);
 const wanted=Number(data?.find(x=>Number(x.item_id)===ids[1])?.silver_value||0);
 if(!offered||!wanted)throw new Error('One of these items has no hidden base value.');
 return Math.ceil((wanted*Number(wantedQuantity||1))/offered);
}
