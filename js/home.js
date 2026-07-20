/* =====================================
   HELPER FUNCTIONS
===================================== */

function formatHomeNumber(value) {

    return Number(value || 0).toLocaleString();

}


function escapeHomeHTML(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


/* =====================================
   LOAD CURRENT PLAYER
===================================== */

async function loadHomePlayer() {

    const {
        data: { user },
        error: userError
    } = await supabaseClient.auth.getUser();

    if (userError) {

        console.error(
            "Could not check logged-in user:",
            userError
        );

        return;
    }

    if (!user) {

        window.location.href = "login.html";
        return;

    }

    const {
        data: player,
        error: playerError
    } = await supabaseClient
        .from("players")
        .select(`
    id,
    player_number,
    username,
    reputation,
    net_worth,
    silver,
    last_online
`)
        .eq("id", user.id)
        .single();

    if (playerError || !player) {

        console.error(
            "Could not load player:",
            playerError
        );

        showHomeLoadingError();
        return;
    }

    const reputation =
        Number(player.reputation || 0);

   const {
    data: playerSkills,
    error: skillsError
} = await supabaseClient
    .from("skills")
    .select("*")
    .eq("player_id", user.id)
    .maybeSingle();

if (skillsError) {

    console.error(
        "Could not load player skills:",
        skillsError
    );

}

const playerLevel = playerSkills
    ? totalSkillFromSkills(playerSkills)
    : 0;

    const legacyValue =
        Number(player.net_worth || 0);

    const silver =
        Number(player.silver || 0);

    const username =
        player.username || "Viking";

    const usernameElement =
        document.getElementById(
            "home-username"
        );

    if (usernameElement) {

        usernameElement.textContent =
            username;

    }

    const reputationElement =
        document.getElementById(
            "reputation"
        );

    if (reputationElement) {

        reputationElement.textContent =
            formatHomeNumber(reputation);

    }

    const levelElement =
        document.getElementById(
            "level"
        );

    if (levelElement) {

        levelElement.textContent =
            `Total Skill ${formatHomeNumber(playerLevel)}`;

    }

    const legacyValueElement =
        document.getElementById(
            "legacy-value"
        );

    if (legacyValueElement) {

        legacyValueElement.textContent =
            formatHomeNumber(legacyValue);

    }

    const silverElement =
        document.getElementById(
            "silver-card"
        );

    if (silverElement) {

        silverElement.textContent =
            formatHomeNumber(silver);

    }

}


/* =====================================
   PLAYER LOADING ERROR
===================================== */

function showHomeLoadingError() {

    const reputation =
        document.getElementById("reputation");

    const level =
        document.getElementById("level");

    const legacyValue =
        document.getElementById("legacy-value");

    const silver =
        document.getElementById("silver-card");

    if (reputation) {
        reputation.textContent = "Could not load";
    }

    if (level) {
        level.textContent = "Could not load";
    }

    if (legacyValue) {
        legacyValue.textContent = "Could not load";
    }

    if (silver) {
        silver.textContent = "Could not load";
    }

}


/* =====================================
   LOAD ONLINE PLAYERS
===================================== */

async function loadOnlinePlayers() {

    const onlinePlayersList =
        document.getElementById(
            "online-players-list"
        );

    if (!onlinePlayersList) {
        return;
    }

    const fiveMinutesAgo =
        new Date(
            Date.now() - 5 * 60 * 1000
        ).toISOString();

    const {
        data: onlinePlayers,
        error
    } = await supabaseClient
        .from("players")
        .select(`
            id,
            player_number,
            username,
            last_online
        `)
        .gte(
            "last_online",
            fiveMinutesAgo
        )
        .order(
            "last_online",
            { ascending: false }
        )
        .limit(10);

    if (error) {

        console.error(
            "Could not load online players:",
            error
        );

        onlinePlayersList.innerHTML = `
            <p>Could not load online players.</p>
        `;

        return;
    }

    if (
        !onlinePlayers ||
        onlinePlayers.length === 0
    ) {

        onlinePlayersList.innerHTML = `
            <p>No players online.</p>
        `;

        return;
    }

    onlinePlayersList.innerHTML = `
        <p class="online-player-links">
            ${
                onlinePlayers
                    .map(player => {

                        const playerId =
                            encodeURIComponent(
                                player.player_number
                            );

                        const username =
                            escapeHomeHTML(
                                player.username
                            );

                        return `
                            <a href="profile.html?id=${playerId}">
                                ${username}
                            </a>
                        `;

                    })
                    .join(
                        '<span class="online-player-separator"> - </span>'
                    )
            }
        </p>
    `;

}


/* =====================================
   LOAD HALL OF FAME PREVIEW
===================================== */

async function loadHallOfFamePreview() {

    const hallOfFameList =
        document.getElementById(
            "home-hof-list"
        );

    if (!hallOfFameList) {
        return;
    }

    const {
        data: topPlayers,
        error
    } = await supabaseClient
        .from("players")
        .select(`
            id,
            player_number,
            username,
            reputation
        `)
        .order(
            "reputation",
            { ascending: false }
        )
        .limit(5);

    if (error) {

        console.error(
            "Could not load Hall of Fame:",
            error
        );

        hallOfFameList.innerHTML = `
            <p>Could not load the Hall of Fame.</p>
        `;

        return;
    }

    if (
        !topPlayers ||
        topPlayers.length === 0
    ) {

        hallOfFameList.innerHTML = `
            <p>No players ranked yet.</p>
        `;

        return;
    }

    hallOfFameList.innerHTML =
        topPlayers
            .map((player, index) => {

                const playerId =
                    encodeURIComponent(player.player_number);

                const username =
                    escapeHomeHTML(player.username);

                const reputation =
                    formatHomeNumber(
                        player.reputation
                    );

                return `
                    <p>
                        ${index + 1}.
                        <a href="profile.html?id=${playerId}">
                            ${username}
                        </a>
                        —
                        ${reputation} Reputation
                    </p>
                `;

            })
            .join("");

}


/* =====================================
   START HOME PAGE
===================================== */

async function loadHomePage() {

    await loadHomePlayer();

    await Promise.all([
        loadOnlinePlayers(),
        loadHallOfFamePreview()
    ]);

}


loadHomePage();