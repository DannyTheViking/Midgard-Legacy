/* ============================================================
   MIDGARD LEGACY - NOTIFICATIONS PAGE
   ============================================================ */

const notificationState = { notifications: [], activeFilter: "all" };

function notificationEscape(value) {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
}

function notificationTime(value) {
    const date = new Date(value);
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return "Just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

async function loadNotifications() {
    const { data, error } = await supabaseClient.rpc("get_my_notifications", { p_limit: 200 });
    if (error) throw error;
    notificationState.notifications = data?.notifications || [];
    document.getElementById("notification-page-unread").textContent = Number(data?.unread_count || 0);
    renderNotifications();
}

function renderNotifications() {
    const list = document.getElementById("notification-list");
    const visible = notificationState.notifications.filter((item) => {
        if (notificationState.activeFilter === "all") return true;
        if (notificationState.activeFilter === "unread") return !item.is_read;
        return item.notification_type === notificationState.activeFilter;
    });
    if (!visible.length) {
        list.innerHTML = '<div class="notification-empty">🔔<h2>No notifications here</h2><p>New level-ups and equipment unlocks will appear on this page.</p></div>';
        return;
    }
    list.innerHTML = visible.map((item) => `
        <article class="notification-card ${item.is_read ? "read" : "unread"}" data-notification-id="${Number(item.id)}">
            <div class="notification-icon">${notificationEscape(item.icon || "🔔")}</div>
            <div class="notification-content">
                <div class="notification-heading">
                    <h2>${notificationEscape(item.title)}</h2>
                    ${item.is_read ? "" : '<span class="notification-new">NEW</span>'}
                </div>
                <p>${notificationEscape(item.message)}</p>
                <div class="notification-meta">
                    <span>${notificationEscape(notificationTime(item.created_at))}</span>
                    ${item.link ? `<a href="${notificationEscape(item.link)}">View</a>` : ""}
                </div>
            </div>
        </article>`).join("");
    list.querySelectorAll(".notification-card.unread").forEach((card) => {
        card.addEventListener("click", async (event) => {
            if (event.target.closest("a")) return;
            await supabaseClient.rpc("mark_notification_read", { p_notification_id: Number(card.dataset.notificationId) });
            await loadNotifications();
            if (typeof updateNotificationBell === "function") await updateNotificationBell();
        });
    });
}

document.querySelectorAll("[data-notification-filter]").forEach((button) => {
    button.addEventListener("click", () => {
        notificationState.activeFilter = button.dataset.notificationFilter;
        document.querySelectorAll("[data-notification-filter]").forEach((item) => item.classList.toggle("active", item === button));
        renderNotifications();
    });
});

document.getElementById("mark-all-read").addEventListener("click", async () => {
    const { error } = await supabaseClient.rpc("mark_all_notifications_read");
    if (error) return;
    await loadNotifications();
    if (typeof updateNotificationBell === "function") await updateNotificationBell();
});

document.getElementById("delete-read").addEventListener("click", async () => {
    const { error } = await supabaseClient.rpc("delete_read_notifications");
    if (error) return;
    await loadNotifications();
});

loadNotifications().catch((error) => {
    console.error(error);
    document.getElementById("notification-message").textContent = `Could not load notifications: ${error.message}`;
});
