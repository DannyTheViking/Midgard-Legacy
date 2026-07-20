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
    "brewing"
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
        throw new Error(`Unknown or non-levelled skill: ${skillName}`);
    }

    const awardedXP = Math.max(0, Math.floor(Number(amount || 0)));

    if (awardedXP <= 0) {
        return loadSkillProgress(skillName);
    }

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return null;

    /*
        XP is increased inside PostgreSQL in one atomic operation.
        This prevents rapid actions from reading the same old XP
        and overwriting each other.
    */
    const { data, error } = await supabaseClient.rpc(
        "add_skill_xp",
        {
            p_skill_name: skillName,
            p_amount: awardedXP
        }
    );

    if (error) {
        console.error(`${skillName} XP RPC failed:`, error);

        throw new Error(
            error.message?.includes("add_skill_xp")
                ? "The skill XP migration has not been run in Supabase yet."
                : error.message
        );
    }

    const result = Array.isArray(data) ? data[0] : data;

    if (!result) {
        throw new Error("Supabase did not return the updated skill XP.");
    }

    const xp = Math.max(0, Number(result.new_xp || 0));
    const level = Math.max(1, Number(result.new_level || levelFromXP(xp)));
    const previousXP = Math.max(0, xp - awardedXP);
    const previousLevel = levelFromXP(previousXP);

    const row = {
        [`${skillName}_xp`]: xp
    };

    const progress = typeof skillProgressFromRow === "function"
        ? skillProgressFromRow(row, skillName)
        : {
            xp,
            level
        };

    return {
        skill: skillName,
        awardedXP,
        ...progress,
        levelledUp: level > previousLevel
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

// Kept temporarily so older calls do not break. Overall progression now uses Total Skill.
async function addPlayerXP() {
    return null;
}
