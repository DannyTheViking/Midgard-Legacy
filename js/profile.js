let viewedPlayerId = null;
let currentProfilePlayer = null;




/* =====================================
   RANK RANGES
===================================== */

const REPUTATION_RANKS = [
    {
        minimum: 1000000,
        title: "Legend of Midgard"
    },
    {
        minimum: 500000,
        title: "King's Champion"
    },
    {
        minimum: 250000,
        title: "High Jarl"
    },
    {
        minimum: 100000,
        title: "Jarl"
    },
    {
        minimum: 50000,
        title: "Thegn"
    },
    {
        minimum: 25000,
        title: "Village Elder"
    },
    {
        minimum: 10000,
        title: "Respected Freeman"
    },
    {
        minimum: 5000,
        title: "Craftsman"
    },
    {
        minimum: 2500,
        title: "Woodsman"
    },
    {
        minimum: 500,
        title: "Villager"
    },
    {
        minimum: 0,
        title: "Thrall"
    }
];


const WEALTH_RANKS = [
    {
        minimum: 1000000000,
        title: "Midgard's Richest"
    },
    {
        minimum: 500000000,
        title: "Realm's Fortune"
    },
    {
        minimum: 250000000,
        title: "King's Wealth"
    },
    {
        minimum: 100000000,
        title: "Dragon Hoard"
    },
    {
        minimum: 50000000,
        title: "King's Favourite"
    },
    {
        minimum: 25000000,
        title: "Royal Treasurer"
    },
    {
        minimum: 10000000,
        title: "High Lord"
    },
    {
        minimum: 5000000,
        title: "Duke"
    },
    {
        minimum: 2500000,
        title: "Earl"
    },
    {
        minimum: 1000000,
        title: "Lord"
    },
    {
        minimum: 500000,
        title: "Baron"
    },
    {
        minimum: 250000,
        title: "Noble"
    },
    {
        minimum: 100000,
        title: "Affluent"
    },
    {
        minimum: 50000,
        title: "Wealthy"
    },
    {
        minimum: 25000,
        title: "Prosperous"
    },
    {
        minimum: 10000,
        title: "Merchant"
    },
    {
        minimum: 5000,
        title: "Tradesman"
    },
    {
        minimum: 2500,
        title: "Commoner"
    },
    {
        minimum: 1000,
        title: "Labourer"
    },
    {
        minimum: 500,
        title: "Pauper"
    },
    {
        minimum: 100,
        title: "Beggar"
    },
    {
        minimum: 0,
        title: "Penniless"
    }
];


const REVIVE_RANKS = [
    {
        minimum: 5000,
        title: "Saint of Midgard"
    },
    {
        minimum: 2500,
        title: "High Healer"
    },
    {
        minimum: 1000,
        title: "Miracle Worker"
    },
    {
        minimum: 500,
        title: "Life Saver"
    },
    {
        minimum: 250,
        title: "Master Healer"
    },
    {
        minimum: 100,
        title: "Village Physician"
    },
    {
        minimum: 50,
        title: "Herbalist"
    },
    {
        minimum: 25,
        title: "Field Medic"
    },
    {
        minimum: 10,
        title: "Healer"
    },
    {
        minimum: 1,
        title: "First Responder"
    },
    {
        minimum: 0,
        title: "Unproven"
    }
];


const JAILBREAK_RANKS = [
    {
        minimum: 5000,
        title: "Breaker of Chains"
    },
    {
        minimum: 2500,
        title: "King's Nightmare"
    },
    {
        minimum: 1000,
        title: "Legend of the Cells"
    },
    {
        minimum: 500,
        title: "Shadow Walker"
    },
    {
        minimum: 250,
        title: "Master Escapee"
    },
    {
        minimum: 100,
        title: "Prison Runner"
    },
    {
        minimum: 50,
        title: "Outlaw"
    },
    {
        minimum: 25,
        title: "Smuggler"
    },
    {
        minimum: 10,
        title: "Escape Artist"
    },
    {
        minimum: 1,
        title: "Lockpicker"
    },
    {
        minimum: 0,
        title: "Lawful"
    }
];


const PVP_RANKS = [
    {
        minimum: 5000,
        title: "Hero of Valhalla"
    },
    {
        minimum: 2500,
        title: "Jarl's Champion"
    },
    {
        minimum: 1000,
        title: "Warlord"
    },
    {
        minimum: 500,
        title: "Champion"
    },
    {
        minimum: 250,
        title: "Berserker"
    },
    {
        minimum: 100,
        title: "Veteran"
    },
    {
        minimum: 50,
        title: "Raider"
    },
    {
        minimum: 25,
        title: "Warrior"
    },
    {
        minimum: 10,
        title: "Fighter"
    },
    {
        minimum: 1,
        title: "Brawler"
    },
    {
        minimum: 0,
        title: "Untested"
    }
];


/* =====================================
   HELPER FUNCTIONS
===================================== */

function getProfilePropertyName(player) {

    const propertyNames = {
        0: "Old Shack",
        1: "Upgraded Shack",
        2: "Small House",
        3: "Medium House",
        4: "Large House"
    };

    const propertyLevel =
        Math.max(
            0,
            Number(player.property_level) || 0
        );

    return (
        propertyNames[propertyLevel] ||
        player.property_name ||
        "None"
    );

}

function formatNumber(value) {

    return Number(
        value || 0
    ).toLocaleString();

}


function escapeHTML(value) {

    return String(
        value ?? ""
    )
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


function getRankRange(
    value,
    ranks
) {

    const amount =
        Number(value || 0);

    const rankIndex =
        ranks.findIndex(rank => {
            return amount >= rank.minimum;
        });

    if (rankIndex === -1) {
        return "0";
    }

    const currentRank =
        ranks[rankIndex];

    const higherRank =
        ranks[rankIndex - 1];

    if (!higherRank) {
        return `${formatNumber(
            currentRank.minimum
        )}+`;
    }

    const maximum =
        higherRank.minimum - 1;

    return (
        `${formatNumber(
            currentRank.minimum
        )}` +
        `–${formatNumber(maximum)}`
    );

}


function getDefaultAvatar(player) {

    const selectedSex =
        String(
            player.sex ||
            player.gender ||
            player.gender_identity ||
            player.identity ||
            ""
        )
            .trim()
            .toLowerCase();

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


function createAvatarImage(player) {

    if (player.avatar_url) {

        return `
            <img
                src="${escapeHTML(
                    player.avatar_url
                )}"
                alt="${escapeHTML(
                    player.username
                )}'s avatar"
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


function createAvatar(
    player,
    canEdit
) {

    const avatarImage =
        createAvatarImage(player);

    if (!canEdit) {

        return `
            <div class="profile-avatar-frame">
                ${avatarImage}
            </div>
        `;

    }

    return `
        <div class="profile-avatar-editor">

            <button
                type="button"
                id="avatar-edit-button"
                class="profile-avatar-button"
                aria-label="Change profile picture"
                title="Change profile picture"
            >

                <span class="profile-avatar-frame">
                    ${avatarImage}
                </span>

                <span class="profile-avatar-edit-icon">
                    📷
                </span>

                <span class="profile-avatar-hover-text">
                    Edit
                </span>

            </button>

            <input
                id="avatar-file"
                class="profile-avatar-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
            >

            <small
                id="avatar-upload-message"
                class="avatar-upload-message"
            >
                Click your picture to change it
            </small>

        </div>
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
            title="${escapeHTML(
                label
            )}: ${escapeHTML(range)}"
        >
            <span class="profile-rank-icon">
                ${icon}
            </span>

            ${escapeHTML(rankName)}
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

        window.location.href =
            "login.html";

        return;

    }

    const pageParameters =
        new URLSearchParams(
            window.location.search
        );

    const publicPlayerNumber =
        pageParameters.get("id");

    let player;
    let error;

    if (publicPlayerNumber) {

        const result =
            await supabaseClient
                .from("players")
                .select("*")
                .eq(
                    "player_number",
                    Number(publicPlayerNumber)
                )
                .single();

        player = result.data;
        error = result.error;

    } else {

        const result =
            await supabaseClient
                .from("players")
                .select("*")
                .eq("id", user.id)
                .single();

        player = result.data;
        error = result.error;

    }

    if (error || !player) {

        console.error(
            "Could not load player profile:",
            error
        );

        const profileCard =
            document.getElementById(
                "profile-card"
            );

        if (profileCard) {

            profileCard.innerHTML = `
                <div class="profile-error">
                    <span>⚠️</span>
                    <p>
                        Player profile could not be found.
                    </p>
                </div>
            `;

        }

        return;

    }

    viewedPlayerId = player.id;
    currentProfilePlayer = player;

    const isOwnProfile =
        viewedPlayerId === user.id;

    const lastOnlineDate =
        new Date(
            player.last_online ||
            player.created_at
        );

    const isOnline =
        Date.now() -
        lastOnlineDate.getTime() <
        5 * 60 * 1000;

    const {
        data: profileSkills,
        error: profileSkillsError
    } = await supabaseClient
        .from("skills")
        .select("*")
        .eq(
            "player_id",
            viewedPlayerId
        )
        .maybeSingle();

    if (profileSkillsError) {

        console.error(
            "Could not load profile skills:",
            profileSkillsError
        );

    }

    const playerLevel =
        profileSkills &&
        typeof totalSkillFromSkills ===
        "function"
            ? totalSkillFromSkills(
                profileSkills
            )
            : 0;

    const legacyValue =
        Number(
            player.net_worth || 0
        );

    const reviveCount =
        Number(
            player.revive_count || 0
        );

    const jailbreakCount =
        Number(
            player.jailbreak_count || 0
        );

    const pvpWins =
        Number(
            player.pvp_wins || 0
        );

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
            <span class="profile-rank-icon">
                🏘️
            </span>

            ${freedomRank}
        </span>
    `;

    const levelBadge =
        createRankBadge(
            "⭐",
            `Total Skill ${playerLevel}`,
            "Combined Skill Levels",
            `${playerLevel}`
        );

    const wealthBadge =
        createRankBadge(
            "💰",
            wealthTitle(legacyValue),
            "Legacy Value",
            getRankRange(
                legacyValue,
                WEALTH_RANKS
            )
        );

    const reviveBadge =
        createRankBadge(
            "❤️",
            reviveTitle(reviveCount),
            "Revives",
            getRankRange(
                reviveCount,
                REVIVE_RANKS
            )
        );

    const jailbreakBadge =
        createRankBadge(
            "🔓",
            jailbreakTitle(
                jailbreakCount
            ),
            "Jailbreaks",
            getRankRange(
                jailbreakCount,
                JAILBREAK_RANKS
            )
        );

    const pvpBadge =
        createRankBadge(
            "⚔️",
            pvpTitle(pvpWins),
            "PvP Wins",
            getRankRange(
                pvpWins,
                PVP_RANKS
            )
        );

    const accountCreatedDate =
        new Date(
            player.created_at
        ).toLocaleDateString();

    const profileCard =
        document.getElementById(
            "profile-card"
        );

    profileCard.innerHTML = `

        <div class="profile-banner-decoration">
            ᛗ
        </div>

        <div class="profile-avatar-column">

            ${createAvatar(
                player,
                isOwnProfile
            )}

        </div>

        <div class="profile-information">

            <div class="profile-name-row">

                <div>

                    <h1>
                        ${escapeHTML(
                            player.username
                        )}
                    </h1>

                    <div
                        class="profile-online-status ${
                            isOnline
                                ? "is-online"
                                : "is-offline"
                        }"
                    >

                        <span class="profile-status-dot"></span>

                        <span>
                            ${
                                isOnline
                                    ? "Online"
                                    : "Offline"
                            }
                        </span>

                        <span class="profile-status-divider">
                            ·
                        </span>

                        <span>
                            Last online
                            ${lastOnlineDate.toLocaleString()}
                        </span>

                    </div>

                </div>

                ${
                    player.player_number
                        ? `
                            <div class="profile-player-number">
                                <small>Player ID</small>
                                <strong>
                                    #${escapeHTML(
                                        player.player_number
                                    )}
                                </strong>
                            </div>
                        `
                        : ""
                }

            </div>

            <div class="profile-account-date">

                <span>📅</span>

                Account created
                ${accountCreatedDate}

            </div>

            <div class="profile-ranks">

                ${freedomBadge}
                ${levelBadge}
                ${wealthBadge}
                ${reviveBadge}
                ${jailbreakBadge}
                ${pvpBadge}

            </div>

            <div class="profile-world-details">

                <div class="profile-detail">

                    <span class="profile-detail-icon">
                        🛡️
                    </span>

                    <div>
                        <small>Hird</small>

                        <strong>
                            ${escapeHTML(
                                player.hird_name ||
                                "None"
                            )}
                        </strong>
                    </div>

                </div>

                <div class="profile-detail">

                    <span class="profile-detail-icon">
                        🏪
                    </span>

                    <div>
                        <small>Company</small>

                        <strong>
                            ${escapeHTML(
                                player.company_name ||
                                "None"
                            )}
                        </strong>
                    </div>

                </div>

                <div class="profile-detail">

                    <span class="profile-detail-icon">
                        🏠
                    </span>

                    <div>
                        <small>Property</small>

                        <strong>
                            ${escapeHTML(
                               getProfilePropertyName(player)
                            )}
                        </strong>
                    </div>

                </div>

            </div>

        </div>
    `;

    if (isOwnProfile) {

        loadOwnProfileActions();
        activateAvatarEditor();

        return;

    }

    await loadOtherPlayerActions(
        user.id
    );

}


/* =====================================
   AVATAR EDITOR
===================================== */

function activateAvatarEditor() {

    const editButton =
        document.getElementById(
            "avatar-edit-button"
        );

    const fileInput =
        document.getElementById(
            "avatar-file"
        );

    if (
        !editButton ||
        !fileInput
    ) {
        return;
    }

    editButton.addEventListener(
        "click",
        function () {

            fileInput.click();

        }
    );

    fileInput.addEventListener(
        "change",
        uploadOwnAvatar
    );

}


async function uploadOwnAvatar() {

    const input =
        document.getElementById(
            "avatar-file"
        );

    const message =
        document.getElementById(
            "avatar-upload-message"
        );

    const file =
        input?.files?.[0];

    if (!file) {
        return;
    }

    if (
        ![
            "image/png",
            "image/jpeg",
            "image/webp"
        ].includes(file.type)
    ) {

        if (message) {

            message.textContent =
                "❌ Choose a PNG, JPG or WebP image.";

        }

        input.value = "";

        return;

    }

    if (
        file.size >
        5 * 1024 * 1024
    ) {

        if (message) {

            message.textContent =
                "❌ The image must be smaller than 5 MB.";

        }

        input.value = "";

        return;

    }

    try {

        if (message) {

            message.textContent =
                "Uploading avatar…";

        }

        const {
            data: { user }
        } = await supabaseClient.auth.getUser();

        if (!user) {

            throw new Error(
                "You are not signed in."
            );

        }

        const extension =
            (
                file.name
                    .split(".")
                    .pop() ||
                "png"
            )
                .toLowerCase();

        const path =
            `${user.id}/avatar.${extension}`;

        const {
            error: uploadError
        } = await supabaseClient
            .storage
            .from("avatars")
            .upload(
                path,
                file,
                {
                    upsert: true,
                    contentType:
                        file.type,
                    cacheControl:
                        "3600"
                }
            );

        if (uploadError) {
            throw uploadError;
        }

        const {
            data: publicUrlData
        } = supabaseClient
            .storage
            .from("avatars")
            .getPublicUrl(path);

        const avatarUrl =
            `${publicUrlData.publicUrl}` +
            `?v=${Date.now()}`;

        const {
            error: updateError
        } = await supabaseClient
            .from("players")
            .update({
                avatar_url: avatarUrl
            })
            .eq("id", user.id);

        if (updateError) {
            throw updateError;
        }

        if (message) {

            message.textContent =
                "✅ Avatar updated.";

        }

        input.value = "";

        await loadProfile();

    } catch (error) {

        console.error(
            "Avatar upload failed:",
            error
        );

        if (message) {

            message.textContent =
                `❌ ${error.message}`;

        }

    }

}


/* =====================================
   OWN PROFILE ACTIONS
===================================== */

function loadOwnProfileActions() {

    const profileActions =
        document.getElementById(
            "profile-actions"
        );

    profileActions.innerHTML = `

        <div class="profile-action-information">

            <span>⚙️</span>

            <div>
                <strong>
                    Profile controls
                </strong>

                <small>
                    Click your avatar to change your picture.
                </small>
            </div>

        </div>

        ${!currentProfilePlayer?.date_of_birth ? `
            <div class="profile-action-information" style="width:100%; margin-top:12px;">
                <span>📅</span>
                <div style="flex:1;">
                    <strong>Date of birth</strong>
                    <small>Add this once to complete your account details.</small>
                    <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
                        <input id="profile-date-of-birth" type="date" autocomplete="bday" style="min-width:190px;">
                        <button type="button" id="save-date-of-birth" class="profile-action-button">Save Date</button>
                    </div>
                    <small id="date-of-birth-message" style="display:block; margin-top:8px;"></small>
                </div>
            </div>
        ` : ``}

        <div class="profile-action-buttons">

            <button
                type="button"
                id="social-list-button"
                class="profile-action-button"
            >
                <span>🤝</span>
                Friends & Enemies
            </button>

            <button
                type="button"
                id="logout-button"
                class="profile-action-button profile-logout-button"
            >
                <span>🚪</span>
                Log Out
            </button>

        </div>
    `;

    document
        .getElementById("save-date-of-birth")
        ?.addEventListener("click", async function () {
            const input = document.getElementById("profile-date-of-birth");
            const message = document.getElementById("date-of-birth-message");
            const value = input?.value;

            if (!value) {
                if (message) message.textContent = "Choose your date of birth first.";
                return;
            }

            this.disabled = true;
            if (message) message.textContent = "Saving…";

            const { error } = await supabaseClient.rpc("set_my_date_of_birth", {
                p_date_of_birth: value
            });

            if (error) {
                if (message) message.textContent = `❌ ${error.message}`;
                this.disabled = false;
                return;
            }

            if (message) message.textContent = "✅ Date saved.";
            await loadProfile();
        });

    document
        .getElementById(
            "social-list-button"
        )
        ?.addEventListener(
            "click",
            function () {

                window.location.href =
                    "friends-enemies.html";

            }
        );

    document
        .getElementById(
            "logout-button"
        )
        ?.addEventListener(
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
        .eq(
            "owner_id",
            currentUserId
        )
        .eq(
            "target_id",
            viewedPlayerId
        )
        .maybeSingle();

    if (error) {

        console.error(
            "Could not load player relation:",
            error
        );

    }

    const isFriend =
        relation?.relation_type ===
        "friend";

    const isEnemy =
        relation?.relation_type ===
        "enemy";

    const profileActions =
        document.getElementById(
            "profile-actions"
        );

    profileActions.innerHTML = `

        <div class="profile-action-information">

            <span>👤</span>

            <div>
                <strong>
                    Player actions
                </strong>

                <small>
                    Manage your relationship with this player.
                </small>
            </div>

        </div>

        <div class="profile-action-buttons">

            <button
                type="button"
                id="friend-button"
                class="profile-action-button"
            >
                <span>🤝</span>

                ${
                    isFriend
                        ? "Remove Friend"
                        : "Add Friend"
                }
            </button>

            <button
                type="button"
                id="enemy-button"
                class="profile-action-button profile-enemy-button"
            >
                <span>💀</span>

                ${
                    isEnemy
                        ? "Remove Enemy"
                        : "Add Enemy"
                }
            </button>

            <button
                type="button"
                class="profile-action-button"
                disabled
            >
                <span>⚔️</span>
                Attack
                <small>Coming soon</small>
            </button>

            <button
                type="button"
                class="profile-action-button"
                disabled
            >
                <span>💰</span>
                Send Money
                <small>Coming soon</small>
            </button>

            <button
                type="button"
                class="profile-action-button"
                disabled
            >
                <span>❤️</span>
                Revive
                <small>Coming soon</small>
            </button>

        </div>
    `;

    document
        .getElementById(
            "friend-button"
        )
        ?.addEventListener(
            "click",
            function () {

                setRelation("friend");

            }
        );

    document
        .getElementById(
            "enemy-button"
        )
        ?.addEventListener(
            "click",
            function () {

                setRelation("enemy");

            }
        );

}


/* =====================================
   FRIEND AND ENEMY RELATIONS
===================================== */

async function setRelation(type) {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (
        !user ||
        !viewedPlayerId
    ) {
        return;
    }

    const {
        data: existingRelation,
        error: relationError
    } = await supabaseClient
        .from("player_relations")
        .select("*")
        .eq(
            "owner_id",
            user.id
        )
        .eq(
            "target_id",
            viewedPlayerId
        )
        .maybeSingle();

    if (relationError) {

        console.error(
            "Could not check player relation:",
            relationError
        );

        return;

    }

    if (
        existingRelation
            ?.relation_type ===
        type
    ) {

        const {
            error: deleteError
        } = await supabaseClient
            .from("player_relations")
            .delete()
            .eq(
                "id",
                existingRelation.id
            );

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
                    owner_id:
                        user.id,

                    target_id:
                        viewedPlayerId,

                    relation_type:
                        type
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


/* =====================================
   START PROFILE
===================================== */

loadProfile();