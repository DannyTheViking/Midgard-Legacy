/* MIDGARD LEGACY - shared skill and player progression */
const SKILL_NAMES = Object.freeze(['woodcutting','mining','smithing','carpentry','brewing']);

function xpForLevel(level){
    const safe = Math.max(1, Number(level || 1));
    return 100 * safe * safe;
}

function levelFromXP(xp){
    const safe = Math.max(0, Number(xp || 0));
    return Math.max(1, Math.floor(Math.sqrt(safe / 100)) + 1);
}

async function ensureSkillsRow(playerId){
    let {data, error} = await supabaseClient.from('skills').select('*').eq('player_id', playerId).maybeSingle();
    if(error){ console.error('Unable to load skills:', error); return null; }
    if(data) return data;
    const payload = {player_id: playerId};
    for(const skill of SKILL_NAMES){ payload[`${skill}_xp`] = 0; payload[`${skill}_level`] = 1; }
    const created = await supabaseClient.from('skills').insert(payload).select().single();
    if(created.error){ console.error('Unable to create skills:', created.error); return null; }
    return created.data;
}

async function addSkillXP(skillName, amount){
    if(!SKILL_NAMES.includes(skillName)) throw new Error(`Unknown skill: ${skillName}`);
    const {data:{user}} = await supabaseClient.auth.getUser();
    if(!user) return null;
    const row = await ensureSkillsRow(user.id);
    if(!row) return null;
    const xpColumn = `${skillName}_xp`;
    const levelColumn = `${skillName}_level`;
    const oldLevel = Number(row[levelColumn] || levelFromXP(row[xpColumn]));
    const newXP = Number(row[xpColumn] || 0) + Math.max(0, Number(amount || 0));
    const newLevel = levelFromXP(newXP);
    const {error} = await supabaseClient.from('skills').update({[xpColumn]:newXP,[levelColumn]:newLevel}).eq('player_id', user.id);
    if(error){ console.error(`${skillName} XP update failed:`, error); return null; }
    return {skill:skillName,xp:newXP,level:newLevel,levelledUp:newLevel>oldLevel,nextLevelXP:xpForLevel(newLevel)};
}

async function addPlayerXP(amount){
    const {data:{user}} = await supabaseClient.auth.getUser();
    if(!user) return null;
    const {data:player,error} = await supabaseClient.from('players').select('player_xp,level').eq('id',user.id).single();
    if(error) return null;
    const newXP = Number(player.player_xp || 0) + Math.max(0, Number(amount || 0));
    const newLevel = levelFromXP(newXP);
    await supabaseClient.from('players').update({player_xp:newXP,level:newLevel}).eq('id',user.id);
    return {xp:newXP,level:newLevel,levelledUp:newLevel>Number(player.level||1)};
}

const addWoodcuttingXP = amount => addSkillXP('woodcutting', amount);
const addMiningXP = amount => addSkillXP('mining', amount);
const addSmithingXP = amount => addSkillXP('smithing', amount);
const addCarpentryXP = amount => addSkillXP('carpentry', amount);
const addBrewingXP = amount => addSkillXP('brewing', amount);
