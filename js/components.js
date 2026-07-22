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
        `../components/${fileName}?v=4`,
        { cache: "no-store" }
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
        .maybeSingle();

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
   TOP-BAR REGENERATION HOVER TIMERS
===================================== */
const MIDGARD_REGEN_INTERVAL_MS = 5 * 60 * 1000;
const MIDGARD_REGEN_AMOUNT = 5;

function formatRegenDuration(totalSeconds) {
    const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;
    return hours > 0
        ? `${hours}h ${String(minutes).padStart(2, "0")}m`
        : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function ensureTopBarRegenTooltips() {
    ["health", "energy", "stamina", "courage"].forEach((name) => {
        const valueElement = document.getElementById(name);
        if (!valueElement) return;
        const statContainer = valueElement.closest(".top-stat") || valueElement.parentElement;
        if (!statContainer) return;
        statContainer.classList.add("regen-stat");
        statContainer.tabIndex = 0;
        let tooltip = statContainer.querySelector(".stat-regen-tooltip");
        if (!tooltip) {
            tooltip = document.createElement("span");
            tooltip.className = "stat-regen-tooltip";
            tooltip.setAttribute("role", "tooltip");
            statContainer.appendChild(tooltip);
        }
    });
}

function startTopBarRegenCountdown(player) {
    ensureTopBarRegenTooltips();
    if (window.midgardRegenCountdownTimer) clearInterval(window.midgardRegenCountdownTimer);
    const lastRegenMs = player.last_regen ? new Date(player.last_regen).getTime() : Date.now();
    const update = () => {
        const elapsed = Math.max(0, Date.now() - lastRegenMs);
        const remainder = elapsed % MIDGARD_REGEN_INTERVAL_MS;
        const nextTickMs = remainder === 0 ? MIDGARD_REGEN_INTERVAL_MS : MIDGARD_REGEN_INTERVAL_MS - remainder;
        const stats = [
            ["health", Number(player.health || 0), Number(player.max_health || 500)],
            ["energy", Number(player.energy || 0), Number(player.max_energy || 100)],
            ["stamina", Number(player.stamina || 0), Number(player.max_stamina || 100)],
            ["courage", Number(player.courage || 0), Number(player.max_courage || 100)]
        ];
        stats.forEach(([name, current, maximum]) => {
            const valueElement = document.getElementById(name);
            const statContainer = valueElement?.closest(".top-stat");
            const tooltip = statContainer?.querySelector(".stat-regen-tooltip");
            if (!statContainer || !tooltip) return;
            let text;
            if (current >= maximum) {
                text = "Fully restored";
            } else {
                const ticksNeeded = Math.ceil((maximum - current) / MIDGARD_REGEN_AMOUNT);
                const fullMs = nextTickMs + Math.max(0, ticksNeeded - 1) * MIDGARD_REGEN_INTERVAL_MS;
                text = `Next +${MIDGARD_REGEN_AMOUNT} in ${formatRegenDuration(nextTickMs / 1000)} · Full in ${formatRegenDuration(fullMs / 1000)}`;
            }
            tooltip.textContent = text;
            statContainer.title = text; // native fallback if custom CSS is unavailable
            statContainer.dataset.regenTooltip = text;
        });
    };
    update();
    window.midgardRegenCountdownTimer = setInterval(update, 1000);
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
            player_number,
            username,
            tutorial_complete,
            is_free_man,
            silver,
            mission_points,
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
        .maybeSingle();

    if (playerError || !player) {
        console.error("Could not load top-bar player:", playerError);
        if (typeof ensureCurrentPlayerProfile === "function") {
            const repairedPlayer = await ensureCurrentPlayerProfile();
            if (repairedPlayer) return updateTopBarPlayer();
        }
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
        .select("*")
        .eq("player_id", user.id)
        .maybeSingle();

    if (skillsError) {
        console.error("Could not load top-bar skills:", skillsError);
    }

    const totalSkill = playerSkills
        ? totalSkillFromSkills(playerSkills)
        : 0;

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
            `profile.html?id=${encodeURIComponent(player.player_number)}`;

    }

    if (levelElement) {

        levelElement.textContent =
            `Total Skill ${totalSkill}`;

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
    setStat("mission-points", Number(player.mission_points || 0).toLocaleString());
    setStat("health", `${Number(player.health || 0)} / ${Number(player.max_health || 500)}`);
    setStat("energy", `${Number(player.energy || 0)} / ${Number(player.max_energy || 100)}`);
    setStat("stamina", `${Number(player.stamina || 0)} / ${Number(player.max_stamina || 100)}`);
    setStat("courage", `${Number(player.courage || 0)} / ${Number(player.max_courage || 100)}`);

    startTopBarRegenCountdown(player);

    document.getElementById("topbar")?.classList.add("topbar-ready");

}


/* Mobile navigation */
function configureMobileNavigation() {
    const toggle = document.getElementById("mobile-nav-toggle");
    const links = document.getElementById("mobile-nav-links");
    if (!toggle || !links) return;

    toggle.addEventListener("click", () => {
        const open = links.classList.toggle("mobile-nav-open");
        toggle.setAttribute("aria-expanded", String(open));
        toggle.textContent = open ? "✕ Close Menu" : "☰ Menu";
    });
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

        configureMobileNavigation();
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
