/* Midgard Legacy - secure global player directory */
let playerPage = 1;
let playerPages = 1;
let playerSearchTimer = null;

function playerEscape(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function relativeLastOnline(value, online) {
    if (online) return "Online now";
    if (!value) return "Last online unknown";
    const ms = Date.now() - new Date(value).getTime();
    const minutes = Math.max(1, Math.floor(ms / 60000));
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function defaultPlayerAvatar(name) {
    const letter = String(name || "V").trim().charAt(0).toUpperCase() || "V";
    return `<span class="player-avatar-fallback">${playerEscape(letter)}</span>`;
}

function renderPlayerRows(players) {
    const list = document.getElementById("players-list");
    if (!players.length) {
        list.innerHTML = `<div class="players-empty"><span>🔎</span><h2>No Vikings found</h2><p>Try a different username.</p></div>`;
        return;
    }

    list.innerHTML = players.map(player => {
        const avatar = player.avatar_url
            ? `<img src="${playerEscape(player.avatar_url)}" alt="${playerEscape(player.username)} avatar">`
            : defaultPlayerAvatar(player.username);
        return `
            <article class="player-directory-row">
                <a class="player-directory-main" href="profile.html?id=${encodeURIComponent(player.player_number)}">
                    <div class="player-directory-avatar">${avatar}<span class="player-online-dot ${player.online ? "online" : "offline"}"></span></div>
                    <div class="player-directory-name">
                        <strong>${playerEscape(player.username)}</strong>
                        <span>#${Number(player.player_number || 0)} · ${playerEscape(relativeLastOnline(player.last_online, player.online))}</span>
                    </div>
                </a>
                <div class="player-directory-stat"><span>Skill Rank</span><strong>${playerEscape(player.skill_rank)}</strong></div>
                <div class="player-directory-stat"><span>Total Skill</span><strong>${Number(player.total_skill || 1).toLocaleString()}</strong></div>
                <div class="player-directory-stat"><span>Status</span><strong>${playerEscape(player.freedom_status)}</strong></div>
                <div class="player-directory-stat"><span>Reputation</span><strong>${Number(player.reputation || 0).toLocaleString()}</strong></div>
                <a class="player-profile-button" href="profile.html?id=${encodeURIComponent(player.player_number)}">View Profile</a>
            </article>`;
    }).join("");
}

function renderPlayerPagination(current, pages) {
    playerPage = current;
    playerPages = pages;
    const nav = document.getElementById("players-pagination");
    if (pages <= 1) {
        nav.innerHTML = "";
        return;
    }
    const buttons = [];
    buttons.push(`<button type="button" data-page="${Math.max(1,current-1)}" ${current<=1 ? "disabled" : ""}>‹</button>`);
    const start = Math.max(1, current - 2);
    const end = Math.min(pages, current + 2);
    for (let page = start; page <= end; page += 1) {
        buttons.push(`<button type="button" data-page="${page}" class="${page===current ? "active" : ""}">${page}</button>`);
    }
    buttons.push(`<button type="button" data-page="${Math.min(pages,current+1)}" ${current>=pages ? "disabled" : ""}>›</button>`);
    nav.innerHTML = buttons.join("");
    nav.querySelectorAll("button[data-page]").forEach(button => button.addEventListener("click", () => loadPlayers(Number(button.dataset.page))));
}

async function loadPlayers(page = 1) {
    const message = document.getElementById("players-message");
    message.textContent = "Searching Midgard...";
    const query = document.getElementById("player-search-input").value.trim();
    const onlineOnly = document.getElementById("player-online-only").checked;
    const { data, error } = await supabaseClient.rpc("search_midgard_players", {
        p_query: query,
        p_page: Math.max(1, Number(page || 1)),
        p_page_size: 25,
        p_online_only: onlineOnly
    });
    if (error) {
        console.error("Player search failed:", error);
        message.textContent = error.message || "Could not search players.";
        return;
    }
    message.textContent = "";
    const players = data?.players || [];
    document.getElementById("player-result-count").textContent = `${Number(data?.total || 0).toLocaleString()} Players`;
    renderPlayerRows(players);
    renderPlayerPagination(Number(data?.page || 1), Number(data?.pages || 1));

    const url = new URL(window.location.href);
    if (query) url.searchParams.set("q", query); else url.searchParams.delete("q");
    if (onlineOnly) url.searchParams.set("online", "1"); else url.searchParams.delete("online");
    if (Number(data?.page || 1) > 1) url.searchParams.set("page", String(data.page)); else url.searchParams.delete("page");
    history.replaceState({}, "", url);
}

function setupPlayerSearch() {
    const form = document.getElementById("player-search-form");
    const input = document.getElementById("player-search-input");
    const online = document.getElementById("player-online-only");
    const params = new URLSearchParams(window.location.search);
    input.value = params.get("q") || "";
    online.checked = params.get("online") === "1";
    playerPage = Math.max(1, Number(params.get("page") || 1));

    form.addEventListener("submit", event => {
        event.preventDefault();
        loadPlayers(1);
    });
    input.addEventListener("input", () => {
        clearTimeout(playerSearchTimer);
        playerSearchTimer = setTimeout(() => loadPlayers(1), 300);
    });
    online.addEventListener("change", () => loadPlayers(1));
}

(async function initialisePlayers() {
    if (window.midgardAuthReady) await window.midgardAuthReady;
    setupPlayerSearch();
    await loadPlayers(playerPage);
})();
