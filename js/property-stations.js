/* =====================================
   MIDGARD LEGACY - PROPERTY STATIONS

   WHY THIS FILE EXISTS
   --------------------
   Forge and Workbench progression belongs to the player's homestead,
   not to separate Blacksmithing, Carpentry or Sawmill skills.

   This helper loads station levels from the players table and can lock
   a whole crafting page until the required property upgrade is owned.
===================================== */

const PROPERTY_STATIONS = Object.freeze({
    WORKBENCH: "workbench",
    FORGE: "forge"
});

async function loadMyPropertyStations() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabaseClient
        .from("players")
        .select("property_level, workbench_level, forge_level")
        .eq("id", user.id)
        .single();

    if (error) {
        console.error("Could not load property stations:", error);
        return null;
    }

    return {
        propertyLevel: Math.max(0, Number(data.property_level || 0)),
        workbenchLevel: Math.max(0, Number(data.workbench_level || 0)),
        forgeLevel: Math.max(0, Number(data.forge_level || 0))
    };
}

function propertyStationLevel(stations, stationName) {
    if (!stations) return 0;
    return stationName === PROPERTY_STATIONS.FORGE
        ? stations.forgeLevel
        : stations.workbenchLevel;
}

function lockPropertyStationPage(stationName, requiredLevel, currentLevel) {
    const displayName = stationName === PROPERTY_STATIONS.FORGE
        ? "Forge"
        : "Workbench";

    document.querySelectorAll("button, input").forEach(element => {
        if (element.closest("#sidebar") || element.closest("#topbar")) return;
        element.disabled = true;
    });

    const page = document.querySelector(".game-page");
    if (!page || document.getElementById("property-station-lock")) return;

    const notice = document.createElement("section");
    notice.id = "property-station-lock";
    notice.className = "game-panel";
    notice.innerHTML = `
        <h2>🔒 ${displayName} Locked</h2>
        <p>
            This page requires ${displayName} Level ${requiredLevel}.
            Your current ${displayName} level is ${currentLevel}.
        </p>
        <p>Upgrade your property to unlock and improve this station.</p>
        <a class="forge-button" href="property.html">🏡 Open Your Property</a>
    `;
    page.prepend(notice);
}

async function requirePropertyStation(stationName, requiredLevel = 1) {
    const stations = await loadMyPropertyStations();
    if (!stations) return false;

    const currentLevel = propertyStationLevel(stations, stationName);
    if (currentLevel < requiredLevel) {
        lockPropertyStationPage(stationName, requiredLevel, currentLevel);
        return false;
    }

    document.querySelectorAll("[data-station-level]").forEach(element => {
        element.textContent = currentLevel;
    });

    return true;
}
