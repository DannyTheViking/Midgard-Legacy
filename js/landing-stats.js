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

        try {
            const { data, error } = await client.rpc("get_public_game_stats");
            if (error) throw error;

            const stats = Array.isArray(data) ? data[0] : data;
            setText("landing-online-now", Number(stats?.online_now || 0).toLocaleString());
            setText("landing-last-hour", Number(stats?.active_last_hour || 0).toLocaleString());
            setText("landing-accounts", Number(stats?.accounts_created || 0).toLocaleString());
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
