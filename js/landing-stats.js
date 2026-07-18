(() => {
    const SUPABASE_URL = "https://mvjwsxzmdbtwtixowjym.supabase.co";
    const SUPABASE_KEY = "sb_publishable_-Jc9ho5n63kRLK1VFc8Yxw_va8ffYVC";

    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };

    async function loadLandingStats() {
        if (!window.supabase) {
            setText("landing-server-status", "Unavailable");
            return;
        }

        const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        const now = Date.now();
        const onlineSince = new Date(now - 5 * 60 * 1000).toISOString();
        const hourSince = new Date(now - 60 * 60 * 1000).toISOString();

        try {
            const [onlineResult, hourResult, accountsResult] = await Promise.all([
                client
                    .from("players")
                    .select("id", { count: "exact", head: true })
                    .gte("last_online", onlineSince),
                client
                    .from("players")
                    .select("id", { count: "exact", head: true })
                    .gte("last_online", hourSince),
                client
                    .from("players")
                    .select("id", { count: "exact", head: true })
            ]);

            const firstError = onlineResult.error || hourResult.error || accountsResult.error;
            if (firstError) throw firstError;

            setText("landing-online-now", Number(onlineResult.count || 0).toLocaleString());
            setText("landing-last-hour", Number(hourResult.count || 0).toLocaleString());
            setText("landing-accounts", Number(accountsResult.count || 0).toLocaleString());
            setText("landing-server-status", "Online");
        } catch (error) {
            console.warn("Landing statistics could not be loaded:", error);
            setText("landing-online-now", "—");
            setText("landing-last-hour", "—");
            setText("landing-accounts", "—");
            setText("landing-server-status", "Online");
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", loadLandingStats);
    } else {
        loadLandingStats();
    }
})();
