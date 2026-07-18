/* =====================================
   LOAD AN HTML COMPONENT
===================================== */

async function loadComponent(
    elementId,
    fileName
) {

    const element =
        document.getElementById(elementId);

    if (!element) {
        return;
    }

    const response = await fetch(
        `../components/${fileName}`
    );

    if (!response.ok) {

        throw new Error(
            `Could not load ${fileName}`
        );

    }

    element.innerHTML =
        await response.text();

}


/* =====================================
   UPDATE SIDEBAR NAVIGATION
===================================== */

async function updateNavigation() {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) {
        return;
    }

    const {
        data: player,
        error
    } = await supabaseClient
        .from("players")
        .select(`
            tutorial_complete,
            is_free_man
        `)
        .eq("id", user.id)
        .single();

    if (error) {

        console.error(
            "Could not update navigation:",
            error
        );

        return;
    }


    /* Property lock */

    const propertyLink =
        document.getElementById(
            "property-nav"
        );

    const propertyUnlocked =
        player?.tutorial_complete &&
        player?.is_free_man;

    if (
        propertyLink &&
        !propertyUnlocked
    ) {

        propertyLink.href = "#";

        propertyLink.innerHTML =
            "🔒 Property";

        propertyLink.classList.add(
            "locked-nav"
        );

        propertyLink.onclick = event => {

            event.preventDefault();

            alert(
                "Earn your freedom from King Harald before claiming land."
            );

        };

    }


    /* Active page highlight */

    const currentPage =
        window.location.pathname
            .split("/")
            .pop();

    document
        .querySelectorAll(
            ".sidebar a.nav"
        )
        .forEach(link => {

            const linkPage =
                link.getAttribute("href");

            if (linkPage === currentPage) {

                link.classList.add(
                    "active"
                );

            }

        });

}

/* =====================================
   UPDATE TOP BAR PLAYER
===================================== */

async function updateTopBarPlayer() {

    const {
        data: { user },
        error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {

        console.error(
            "Could not load logged-in user:",
            userError
        );

        return;
    }

    const {
        data: player,
        error: playerError
    } = await supabaseClient
        .from("players")
        .select(`
            username,
            tutorial_complete,
            is_free_man,
            silver,
            health,
            max_health,
            energy,
            max_energy,
            stamina,
            max_stamina,
            courage,
            max_courage,
            last_regen
        `)
        .eq("id", user.id)
        .single();

    if (playerError || !player) {

        console.error(
            "Could not load top-bar player:",
            playerError
        );

        return;
    }

    /* Apply passive regeneration before drawing the top bar.
       One tick occurs every 5 minutes and restores 5 points. */
    const now = new Date();
    const lastRegen = player.last_regen
        ? new Date(player.last_regen)
        : now;

    const elapsedMs = Math.max(0, now.getTime() - lastRegen.getTime());
    const regenTicks = Math.floor(elapsedMs / (5 * 60 * 1000));

    if (regenTicks > 0) {
        const regenAmount = regenTicks * 5;
        const regenerated = {
            health: Math.min(Number(player.health || 0) + regenAmount, Number(player.max_health || 500)),
            energy: Math.min(Number(player.energy || 0) + regenAmount, Number(player.max_energy || 100)),
            stamina: Math.min(Number(player.stamina || 0) + regenAmount, Number(player.max_stamina || 100)),
            courage: Math.min(Number(player.courage || 0) + regenAmount, Number(player.max_courage || 100)),
            last_regen: new Date(lastRegen.getTime() + regenTicks * 5 * 60 * 1000).toISOString()
        };

        const { error: regenError } = await supabaseClient
            .from("players")
            .update(regenerated)
            .eq("id", user.id);

        if (regenError) {
            console.error("Could not apply regeneration:", regenError);
        } else {
            Object.assign(player, regenerated);
        }
    }

    const {
        data: playerSkills,
        error: skillsError
    } = await supabaseClient
        .from("skills")
        .select("level")
        .eq("player_id", user.id);

    if (skillsError) {

        console.error(
            "Could not load top-bar skills:",
            skillsError
        );

    }

    const playerLevel = 1 +
        (playerSkills || []).reduce(
            (total, skill) => {
                const skillLevel = Number(skill.level || 1);
                return total + Math.max(0, skillLevel - 1);
            },
            0
        );

    const profileLink =
        document.getElementById(
            "topbar-profile-link"
        );

    const levelElement =
        document.getElementById(
            "topbar-level"
        );

    const rankElement =
        document.getElementById(
            "topbar-rank"
        );

    const freedomRank =
        player.tutorial_complete &&
        player.is_free_man
            ? "Freeman"
            : "Thrall";

    if (profileLink) {

        profileLink.textContent =
            player.username || "Viking";

        profileLink.href =
            `profile.html?id=${encodeURIComponent(user.id)}`;

    }

    if (levelElement) {

        levelElement.textContent =
            `Level ${playerLevel}`;

    }

    if (rankElement) {

        rankElement.textContent =
            freedomRank;

    }

    const setStat = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };

    setStat("silver", Number(player.silver || 0).toLocaleString());
    setStat("health", `${Number(player.health || 0)} / ${Number(player.max_health || 500)}`);
    setStat("energy", `${Number(player.energy || 0)} / ${Number(player.max_energy || 100)}`);
    setStat("stamina", `${Number(player.stamina || 0)} / ${Number(player.max_stamina || 100)}`);
    setStat("courage", `${Number(player.courage || 0)} / ${Number(player.max_courage || 100)}`);

    document.getElementById("topbar")?.classList.add("topbar-ready");

}
/* =====================================
   LOAD SIDEBAR AND TOP BAR
===================================== */

async function loadGameLayout() {

    try {

        await Promise.all([
            loadComponent(
                "sidebar",
                "sidebar.html"
            ),

            loadComponent(
                "topbar",
                "topbar.html"
            )
        ]);

        await updatePlayerOnlineStatus();
        await updateNavigation();
        await updateTopBarPlayer();

        if (
            typeof refreshTutorialUI ===
            "function"
        ) {

            await refreshTutorialUI();

        }

    } catch (error) {

        console.error(
            "Layout failed:",
            error
        );

    }

}

/* =====================================
   UPDATE PLAYER ONLINE STATUS
===================================== */

async function updatePlayerOnlineStatus() {

    const {
        data: { user },
        error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {

        console.error(
            "Could not update online status:",
            userError
        );

        return;
    }

    const {
        error: updateError
    } = await supabaseClient
        .from("players")
        .update({
            last_online: new Date().toISOString()
        })
        .eq("id", user.id);

    if (updateError) {

        console.error(
            "Could not save online status:",
            updateError
        );

    }

}
loadGameLayout();

// Keep regenerated stats current while a player leaves a page open.
if (!window.midgardTopBarRefreshTimer) {
    window.midgardTopBarRefreshTimer = window.setInterval(() => {
        updateTopBarPlayer();
        updatePlayerOnlineStatus();
    }, 60 * 1000);
}
