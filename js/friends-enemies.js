/* =====================================
   FRIENDS & ENEMIES PAGE
===================================== */

let currentPlayerId = null;

function escapeSocialHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function showRelationsMessage(message, type = "info") {
    const element = document.getElementById("relations-message");
    if (!element) return;

    element.className = `social-message social-message-${type}`;
    element.textContent = message;

    window.clearTimeout(showRelationsMessage.timer);
    showRelationsMessage.timer = window.setTimeout(() => {
        element.textContent = "";
        element.className = "social-message";
    }, 3500);
}

function playerIsInHospital(player) {
    if (!player?.hospital_until) return false;
    return new Date(player.hospital_until).getTime() > Date.now();
}

function createFriendRow(relation) {
    const player = relation.target;
    if (!player) return "";

    const inHospital = playerIsInHospital(player);
    const playerId = escapeSocialHTML(player.player_number);
    const username = escapeSocialHTML(player.username || "Unknown Viking");

    return `
        <article class="social-row" data-relation-id="${escapeSocialHTML(relation.id)}">
            <a class="social-player-name" href="profile.html?id=${playerId}">${username}</a>
            <div class="social-actions">
                <button type="button" data-action="trade" data-player-name="${username}">Trade</button>
                ${
                    inHospital
                        ? `<button type="button" data-action="revive" data-player-name="${username}">Revive</button>`
                        : `<button type="button" class="social-status-button" disabled title="This friend is not in hospital">Okay</button>`
                }
                <button type="button" data-action="money" data-player-name="${username}">Send Money</button>
                <button type="button" class="danger-button" data-action="remove" data-relation-id="${escapeSocialHTML(relation.id)}">Remove</button>
            </div>
        </article>
    `;
}

function createEnemyRow(relation) {
    const player = relation.target;
    if (!player) return "";

    const playerId = escapeSocialHTML(player.player_number);
    const username = escapeSocialHTML(player.username || "Unknown Viking");

    return `
        <article class="social-row" data-relation-id="${escapeSocialHTML(relation.id)}">
            <a class="social-player-name" href="profile.html?id=${playerId}">${username}</a>
            <div class="social-actions">
                <button type="button" data-action="attack" data-player-name="${username}">Attack</button>
                <button type="button" class="danger-button" data-action="remove" data-relation-id="${escapeSocialHTML(relation.id)}">Remove</button>
            </div>
        </article>
    `;
}

async function loadRelations() {
    const {
        data: { user },
        error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
        window.location.href = "login.html";
        return;
    }

    currentPlayerId = user.id;

    const { data, error } = await supabaseClient
        .from("player_relations")
        .select(`
            id,
            relation_type,
            target:players!player_relations_target_id_fkey (
                id,
                player_number,
                username,
                hospital_until
            )
        `)
        .eq("owner_id", currentPlayerId)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Could not load friends and enemies:", error);
        document.getElementById("friends-list").innerHTML =
            "<p>Friends could not be loaded. Run the player relations SQL migration in Supabase.</p>";
        document.getElementById("enemies-list").innerHTML =
            "<p>Enemies could not be loaded.</p>";
        return;
    }

    const friends = (data || []).filter(row => row.relation_type === "friend");
    const enemies = (data || []).filter(row => row.relation_type === "enemy");

    document.getElementById("friend-count").textContent = `(${friends.length})`;
    document.getElementById("enemy-count").textContent = `(${enemies.length})`;

    document.getElementById("friends-list").innerHTML =
        friends.length
            ? friends.map(createFriendRow).join("")
            : "<p>You have not added any friends yet.</p>";

    document.getElementById("enemies-list").innerHTML =
        enemies.length
            ? enemies.map(createEnemyRow).join("")
            : "<p>You have not added any enemies yet.</p>";
}

async function removeRelation(relationId) {
    const { error } = await supabaseClient
        .from("player_relations")
        .delete()
        .eq("id", relationId)
        .eq("owner_id", currentPlayerId);

    if (error) {
        console.error("Could not remove relation:", error);
        showRelationsMessage("That player could not be removed.", "error");
        return;
    }

    showRelationsMessage("Player removed from your list.", "success");
    await loadRelations();
}

function handleFutureAction(action, playerName) {
    const labels = {
        trade: `Trading with ${playerName} is coming soon.`,
        revive: `The revive system for ${playerName} is coming soon.`,
        money: `Sending silver to ${playerName} is coming soon.`,
        attack: `Combat against ${playerName} is coming soon.`
    };

    showRelationsMessage(labels[action] || "This action is coming soon.");
}

document.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const action = button.dataset.action;

    if (action === "remove") {
        removeRelation(button.dataset.relationId);
        return;
    }

    handleFutureAction(action, button.dataset.playerName || "this player");
});

loadRelations();
