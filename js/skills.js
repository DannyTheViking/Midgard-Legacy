/* MIDGARD LEGACY - shared skill progression */
const SKILL_NAMES = Object.freeze([
    "woodcutting",
    "mining",
    "fishing",
    "hunting",
    "farming",
    "blacksmithing",
    "carpentry",
    "cooking",
    "brewing",
    "combat"
]);

function xpForLevel(level) {
    return typeof skillXPForLevel === "function"
        ? skillXPForLevel(level)
        : Math.round(100 * Math.pow(Math.max(1, Number(level || 1)) - 1, 3));
}

function levelFromXP(xp) {
    return typeof skillLevelFromXP === "function"
        ? skillLevelFromXP(xp)
        : Math.max(1, Math.min(100, Math.floor(Math.cbrt(Math.max(0, Number(xp || 0)) / 100)) + 1));
}

async function ensureSkillsRow(playerId) {
    let { data, error } = await supabaseClient
        .from("skills")
        .select("*")
        .eq("player_id", playerId)
        .maybeSingle();

    if (error) {
        console.error("Unable to load skills:", error);
        return null;
    }

    if (data) return data;

    // Database defaults create every XP/level value. This avoids schema mismatch.
    const created = await supabaseClient
        .from("skills")
        .insert({ player_id: playerId })
        .select()
        .single();

    if (created.error) {
        console.error("Unable to create skills:", created.error);
        return null;
    }

    return created.data;
}

async function addSkillXP(skillName, amount) {
    if (!SKILL_NAMES.includes(skillName)) {
        throw new Error(`Unknown skill: ${skillName}`);
    }

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return null;

    const row = await ensureSkillsRow(user.id);
    if (!row) return null;

    const xpColumn = `${skillName}_xp`;
    const levelColumn = `${skillName}_level`;
    const oldXP = Math.max(0, Number(row[xpColumn] || 0));
    const oldLevel = levelFromXP(oldXP);
    const awardedXP = Math.max(0, Number(amount || 0));
    const newXP = oldXP + awardedXP;
    const newLevel = levelFromXP(newXP);

    const { data: saved, error } = await supabaseClient
        .from("skills")
        .update({
            [xpColumn]: newXP,
            [levelColumn]: newLevel
        })
        .eq("player_id", user.id)
        .select()
        .single();

    if (error) {
        console.error(`${skillName} XP update failed:`, error);
        throw error;
    }

    const progress = typeof skillProgressFromRow === "function"
        ? skillProgressFromRow(saved, skillName)
        : null;

    return {
        skill: skillName,
        awardedXP,
        ...(progress || { xp: newXP, level: newLevel }),
        levelledUp: newLevel > oldLevel
    };
}

async function loadSkillProgress(skillName) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return null;

    const row = await ensureSkillsRow(user.id);
    if (!row) return null;

    return typeof skillProgressFromRow === "function"
        ? skillProgressFromRow(row, skillName)
        : null;
}

function renderSkillProgress(skillName, progress) {
    if (!progress) return;

    const levelElement = document.getElementById(`${skillName}-level-circle`);
    const textElement = document.getElementById(`${skillName}-xp-text`);
    const fillElement = document.getElementById(`${skillName}-xp-fill`);

    if (levelElement) levelElement.textContent = progress.level;

    if (textElement) {
        textElement.textContent = progress.level >= 100
            ? `${Number(progress.xp).toLocaleString()} XP · MAX LEVEL`
            : `${Number(progress.earned).toLocaleString()} / ${Number(progress.required).toLocaleString()} XP`;
    }

    if (fillElement) {
        fillElement.style.width = `${Math.max(0, Math.min(100, progress.percent))}%`;
    }
}

async function refreshSkillProgress(skillName) {
    const progress = await loadSkillProgress(skillName);
    renderSkillProgress(skillName, progress);
    return progress;
}

// Old page code can continue using these familiar helper names.
const addWoodcuttingXP = amount => addSkillXP("woodcutting", amount);
const addMiningXP = amount => addSkillXP("mining", amount);
const addSmithingXP = amount => addSkillXP("blacksmithing", amount);
const addBlacksmithingXP = amount => addSkillXP("blacksmithing", amount);
const addCarpentryXP = amount => addSkillXP("carpentry", amount);
const addBrewingXP = amount => addSkillXP("brewing", amount);
const addFishingXP = amount => addSkillXP("fishing", amount);
const addHuntingXP = amount => addSkillXP("hunting", amount);
const addFarmingXP = amount => addSkillXP("farming", amount);
const addCookingXP = amount => addSkillXP("cooking", amount);
const addCombatXP = amount => addSkillXP("combat", amount);

// Kept temporarily so older calls do not break. Overall progression now uses Total Skill.
async function addPlayerXP() {
    return null;
}
