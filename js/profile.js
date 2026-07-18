let viewedPlayerId = null;


/* =====================================
   RANK RANGES
===================================== */

const REPUTATION_RANKS = [
    { minimum: 1000000, title: "Legend of Midgard" },
    { minimum: 500000, title: "King's Champion" },
    { minimum: 250000, title: "High Jarl" },
    { minimum: 100000, title: "Jarl" },
    { minimum: 50000, title: "Thegn" },
    { minimum: 25000, title: "Village Elder" },
    { minimum: 10000, title: "Respected Freeman" },
    { minimum: 5000, title: "Craftsman" },
    { minimum: 2500, title: "Woodsman" },
    { minimum: 500, title: "Villager" },
    { minimum: 0, title: "Thrall" }
];

const WEALTH_RANKS = [
    { minimum: 1000000000, title: "Midgard's Richest" },
    { minimum: 500000000, title: "Realm's Fortune" },
    { minimum: 250000000, title: "King's Wealth" },
    { minimum: 100000000, title: "Dragon Hoard" },
    { minimum: 50000000, title: "King's Favourite" },
    { minimum: 25000000, title: "Royal Treasurer" },
    { minimum: 10000000, title: "High Lord" },
    { minimum: 5000000, title: "Duke" },
    { minimum: 2500000, title: "Earl" },
    { minimum: 1000000, title: "Lord" },
    { minimum: 500000, title: "Baron" },
    { minimum: 250000, title: "Noble" },
    { minimum: 100000, title: "Affluent" },
    { minimum: 50000, title: "Wealthy" },
    { minimum: 25000, title: "Prosperous" },
    { minimum: 10000, title: "Merchant" },
    { minimum: 5000, title: "Tradesman" },
    { minimum: 2500, title: "Commoner" },
    { minimum: 1000, title: "Labourer" },
    { minimum: 500, title: "Pauper" },
    { minimum: 100, title: "Beggar" },
    { minimum: 0, title: "Penniless" }
];

const REVIVE_RANKS = [
    { minimum: 5000, title: "Saint of Midgard" },
    { minimum: 2500, title: "High Healer" },
    { minimum: 1000, title: "Miracle Worker" },
    { minimum: 500, title: "Life Saver" },
    { minimum: 250, title: "Master Healer" },
    { minimum: 100, title: "Village Physician" },
    { minimum: 50, title: "Herbalist" },
    { minimum: 25, title: "Field Medic" },
    { minimum: 10, title: "Healer" },
    { minimum: 1, title: "First Responder" },
    { minimum: 0, title: "Unproven" }
];

const JAILBREAK_RANKS = [
    { minimum: 5000, title: "Breaker of Chains" },
    { minimum: 2500, title: "King's Nightmare" },
    { minimum: 1000, title: "Legend of the Cells" },
    { minimum: 500, title: "Shadow Walker" },
    { minimum: 250, title: "Master Escapee" },
    { minimum: 100, title: "Prison Runner" },
    { minimum: 50, title: "Outlaw" },
    { minimum: 25, title: "Smuggler" },
    { minimum: 10, title: "Escape Artist" },
    { minimum: 1, title: "Lockpicker" },
    { minimum: 0, title: "Lawful" }
];

const PVP_RANKS = [
    { minimum: 5000, title: "Hero of Valhalla" },
    { minimum: 2500, title: "Jarl's Champion" },
    { minimum: 1000, title: "Warlord" },
    { minimum: 500, title: "Champion" },
    { minimum: 250, title: "Berserker" },
    { minimum: 100, title: "Veteran" },
    { minimum: 50, title: "Raider" },
    { minimum: 25, title: "Warrior" },
    { minimum: 10, title: "Fighter" },
    { minimum: 1, title: "Brawler" },
    { minimum: 0, title: "Untested" }
];


/* =====================================
   HELPER FUNCTIONS
===================================== */

function formatNumber(value) {
    return Number(value || 0).toLocaleString();
}


function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function getRankRange(value, ranks) {

    const amount = Number(value || 0);

    const rankIndex = ranks.findIndex(rank => {
        return amount >= rank.minimum;
    });

    if (rankIndex === -1) {
        return "0";
    }

    const currentRank = ranks[rankIndex];
    const higherRank = ranks[rankIndex - 1];

    if (!higherRank) {
        return `${formatNumber(currentRank.minimum)}+`;
    }

    const maximum = higherRank.minimum - 1;

    return (
        `${formatNumber(currentRank.minimum)}` +
        `–${formatNumber(maximum)}`
    );
}

function getDefaultAvatar(player) {

    const selectedSex = String(
        player.sex ||
        player.gender ||
        player.gender_identity ||
        player.identity ||
        ""
    ).trim().toLowerCase();

    if (
        selectedSex === "female" ||
        selectedSex === "woman"
    ) {
        return "👩";
    }

    if (
        selectedSex === "non-binary" ||
        selectedSex === "nonbinary" ||
        selectedSex === "other" ||
        selectedSex === "prefer not to say" ||
        selectedSex === "prefer_not_to_say"
    ) {
        return "🧑";
    }

    return "🧔";
}


function createAvatar(player) {

    if (player.avatar_url) {

        return `
            <img
                src="${escapeHTML(player.avatar_url)}"
                alt="${escapeHTML(player.username)}'s avatar"
                class="profile-avatar-image"
            >
        `;
    }

    return `
        <span
            class="profile-default-avatar"
            aria-label="Default avatar"
        >
            ${getDefaultAvatar(player)}
        </span>
    `;
}


function createRankBadge(
    icon,
    rankName,
    label,
    range
) {

    return `
        <span
            class="profile-rank-badge"
            title="${escapeHTML(label)}: ${escapeHTML(range)}"
        >
            ${icon} ${escapeHTML(rankName)}
        </span>
    `;
}


/* =====================================
   LOAD PROFILE
===================================== */

async function loadProfile() {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) {
        window.location.href = "login.html";
        return;
    }

    const pageParameters =
        new URLSearchParams(window.location.search);

    viewedPlayerId =
        pageParameters.get("id") ||
        user.id;

    const {
        data: player,
        error
    } = await supabaseClient
        .from("players")
        .select("*")
        .eq("id", viewedPlayerId)
        .single();

    if (error || !player) {

        console.error(
            "Could not load player profile:",
            error
        );

        document.getElementById(
            "profile-card"
        ).innerHTML = `
            <p>Player profile could not be found.</p>
        `;

        return;
    }

    const lastOnlineDate = new Date(
        player.last_online ||
        player.created_at
    );

    const isOnline =
        Date.now() - lastOnlineDate.getTime() <
        5 * 60 * 1000;

    const reputation =
        Number(player.reputation || 0);

    const playerLevel =
        Number(player.level || 1);

    const legacyValue =
        Number(player.net_worth || 0);

    const reviveCount =
        Number(player.revive_count || 0);

    const jailbreakCount =
        Number(player.jailbreak_count || 0);

    const pvpWins =
        Number(player.pvp_wins || 0);

   const freedomRank =
    player.tutorial_complete &&
    player.is_free_man
        ? "Freeman"
        : "Thrall";

const freedomBadge = `
    <span
        class="profile-rank-badge"
        title="Freedom status"
    >
        🏘️ ${freedomRank}
    </span>
`;

    const levelBadge = createRankBadge(
    "⭐",
    `Player Level ${playerLevel}`,
    "Combined Skill Levels",
    `${playerLevel}`
);

    const wealthBadge = createRankBadge(
        "💰",
        wealthTitle(legacyValue),
        "Legacy Value",
        getRankRange(
            legacyValue,
            WEALTH_RANKS
        )
    );

    const reviveBadge = createRankBadge(
        "❤️",
        reviveTitle(reviveCount),
        "Revives",
        getRankRange(
            reviveCount,
            REVIVE_RANKS
        )
    );

    const jailbreakBadge = createRankBadge(
        "🔓",
        jailbreakTitle(jailbreakCount),
        "Jailbreaks",
        getRankRange(
            jailbreakCount,
            JAILBREAK_RANKS
        )
    );

    const pvpBadge = createRankBadge(
        "⚔️",
        pvpTitle(pvpWins),
        "PvP Wins",
        getRankRange(
            pvpWins,
            PVP_RANKS
        )
    );

    const profileCard =
        document.getElementById("profile-card");

    profileCard.innerHTML = `
        <div class="avatar-placeholder">
            ${createAvatar(player)}
        </div>

        <div class="profile-information">

            <h1>
                ${escapeHTML(player.username)}
            </h1>

            <p>
                ${isOnline ? "🟢 Online" : "⚫ Offline"}
                · Last online
                ${lastOnlineDate.toLocaleString()}
            </p>

            <p>
                Account made:
                ${new Date(
                    player.created_at
                ).toLocaleDateString()}
            </p>

            <div class="profile-ranks">
                ${freedomBadge}
                ${levelBadge}
                ${wealthBadge}
                ${reviveBadge}
                ${jailbreakBadge}
                ${pvpBadge}
            </div>

            <p>
                Hird:
                ${escapeHTML(player.hird_name || "None")}
                · Company:
                ${escapeHTML(player.company_name || "None")}
                · Property:
                ${escapeHTML(player.property_name || "None")}
            </p>

        </div>
    `;

    if (viewedPlayerId === user.id) {
        loadOwnProfileActions();
        return;
    }

    await loadOtherPlayerActions(user.id);
}


/* =====================================
   OWN PROFILE ACTIONS
===================================== */

function loadOwnProfileActions() {

    const profileActions =
        document.getElementById("profile-actions");

    profileActions.innerHTML = `
        <button
            type="button"
            id="edit-profile-button"
        >
            Edit Profile
        </button>

        <button
            type="button"
            id="logout-button"
        >
            Log Out
        </button>
    `;

    document
        .getElementById("edit-profile-button")
        .addEventListener("click", () => {

            alert(
                "Profile editing is coming soon."
            );
        });

    document
        .getElementById("logout-button")
        .addEventListener(
            "click",
            logoutGame
        );
}


/* =====================================
   OTHER PLAYER ACTIONS
===================================== */

async function loadOtherPlayerActions(
    currentUserId
) {

    const {
        data: relation,
        error
    } = await supabaseClient
        .from("player_relations")
        .select("*")
        .eq("owner_id", currentUserId)
        .eq("target_id", viewedPlayerId)
        .maybeSingle();

    if (error) {
        console.error(
            "Could not load player relation:",
            error
        );
    }

    const isFriend =
        relation?.relation_type === "friend";

    const isEnemy =
        relation?.relation_type === "enemy";

    const profileActions =
        document.getElementById("profile-actions");

    profileActions.innerHTML = `
        <button
            type="button"
            id="friend-button"
        >
            ${
                isFriend
                    ? "Remove Friend"
                    : "Add Friend"
            }
        </button>

        <button
            type="button"
            id="enemy-button"
        >
            ${
                isEnemy
                    ? "Remove Enemy"
                    : "Add Enemy"
            }
        </button>

        <button type="button" disabled>
            ⚔️ Attack — coming soon
        </button>

        <button type="button" disabled>
            💰 Send Money — coming soon
        </button>

        <button type="button" disabled>
            ❤️ Revive — coming soon
        </button>
    `;

    document
        .getElementById("friend-button")
        .addEventListener("click", () => {
            setRelation("friend");
        });

    document
        .getElementById("enemy-button")
        .addEventListener("click", () => {
            setRelation("enemy");
        });
}


/* =====================================
   FRIEND AND ENEMY RELATIONS
===================================== */

async function setRelation(type) {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user || !viewedPlayerId) {
        return;
    }

    const {
        data: existingRelation,
        error: relationError
    } = await supabaseClient
        .from("player_relations")
        .select("*")
        .eq("owner_id", user.id)
        .eq("target_id", viewedPlayerId)
        .maybeSingle();

    if (relationError) {

        console.error(
            "Could not check player relation:",
            relationError
        );

        return;
    }

    if (
        existingRelation?.relation_type === type
    ) {

        const {
            error: deleteError
        } = await supabaseClient
            .from("player_relations")
            .delete()
            .eq("id", existingRelation.id);

        if (deleteError) {

            console.error(
                "Could not remove relation:",
                deleteError
            );

            return;
        }

    } else {

        const {
            error: saveError
        } = await supabaseClient
            .from("player_relations")
            .upsert(
                {
                    owner_id: user.id,
                    target_id: viewedPlayerId,
                    relation_type: type
                },
                {
                    onConflict:
                        "owner_id,target_id"
                }
            );

        if (saveError) {

            console.error(
                "Could not save relation:",
                saveError
            );

            return;
        }
    }

    await loadProfile();
}

loadProfile();