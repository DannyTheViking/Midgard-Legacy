const SUPABASE_URL = "https://mvjwsxzmdbtwtixowjym.supabase.co";
const SUPABASE_KEY = "sb_publishable_-Jc9ho5n63kRLK1VFc8Yxw_va8ffYVC";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* =====================================
   AUTH HELPERS
===================================== */

function getMidgardOrigin() {
    // This automatically uses your paid domain when the game is opened there.
    // It also continues to work during local testing.
    return window.location.origin;
}

function getPageUrl(pageName, query = "") {
    return `${getMidgardOrigin()}/pages/${pageName}${query}`;
}

function setAuthMessage(element, message, type = "error") {
    if (!element) return;
    element.className = `auth-message auth-message-${type}`;
    element.innerHTML = message;
}

function friendlyAuthError(error) {
    const message = String(error?.message || error || "Something went wrong.");

    if (/email not confirmed/i.test(message)) {
        return "Please confirm your email address before logging in. Check your inbox and junk folder.";
    }

    if (/invalid login credentials/i.test(message)) {
        return "The email address or password is incorrect.";
    }

    if (/user already registered/i.test(message)) {
        return "An account already exists with that email address. Try logging in instead.";
    }

    return message;
}

/*
   Ensures older Auth accounts also receive a players/skills/statistics row.
   The SQL file included with this build creates this safe database function.
*/
async function ensureCurrentPlayerProfile() {
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) return null;

    const { error: ensureError } = await supabaseClient.rpc("ensure_my_player_profile");

    // Keep the game usable while the SQL update is being installed.
    if (ensureError && ensureError.code !== "PGRST202") {
        console.warn("Player profile repair could not run:", ensureError);
    }

    const { data: player, error: playerError } = await supabaseClient
        .from("players")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

    if (playerError) {
        console.error("Player profile could not be loaded:", playerError);
        return null;
    }

    return player;
}

window.ensureCurrentPlayerProfile = ensureCurrentPlayerProfile;

/* =====================================
   SIGN UP
===================================== */

const signupButton = document.getElementById("signup-button");

if (signupButton) {
    signupButton.addEventListener("click", async () => {
        const username = document.getElementById("signup-username")?.value.trim();
        const email = document.getElementById("signup-email")?.value.trim();
        const password = document.getElementById("signup-password")?.value || "";
        const genderIdentity = document.getElementById("signup-gender")?.value || "prefer_not_to_say";
        const output = document.getElementById("signup-message");

        if (!username || !email || password.length < 6) {
            setAuthMessage(
                output,
                "Enter a username, a valid email address and a password of at least 6 characters."
            );
            return;
        }

        signupButton.disabled = true;
        signupButton.textContent = "Creating your Viking…";
        setAuthMessage(output, "Creating your account…", "info");

        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: getPageUrl("login.html", "?confirmed=1"),
                data: {
                    username,
                    gender_identity: genderIdentity,
                    title_style:
                        genderIdentity === "man"
                            ? "freeman"
                            : genderIdentity === "woman"
                                ? "freewoman"
                                : "freeperson"
                }
            }
        });

        if (error) {
            setAuthMessage(output, friendlyAuthError(error));
            signupButton.disabled = false;
            signupButton.textContent = "Create Viking";
            return;
        }

        // When email confirmation is enabled, there is deliberately no session yet.
        if (!data.session) {
            setAuthMessage(
                output,
                `
                    <strong>✅ Check your email to finish creating your Viking.</strong><br><br>
                    We sent a confirmation link to <strong>${email}</strong>.<br>
                    Open it, confirm your address, and you will return to Midgard Legacy.<br><br>
                    <small>Nothing there? Check your junk or spam folder.</small>
                `,
                "success"
            );
            signupButton.textContent = "Confirmation Email Sent";
            return;
        }

        await ensureCurrentPlayerProfile();
        window.location.replace("home.html");
    });
}

/* =====================================
   EMAIL CONFIRMATION CALLBACK
===================================== */

async function handleEmailConfirmationCallback() {
    const output = document.getElementById("login-message");
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const authError = params.get("error_description") || hashParams.get("error_description");
    const code = params.get("code");
    const confirmationFlag = params.get("confirmed") === "1";

    if (authError) {
        setAuthMessage(output, decodeURIComponent(authError));
        return;
    }

    if (code) {
        const { error } = await supabaseClient.auth.exchangeCodeForSession(code);
        if (error) {
            setAuthMessage(output, friendlyAuthError(error));
            return;
        }
    }

    const { data: { session } } = await supabaseClient.auth.getSession();

    if ((code || confirmationFlag || window.location.hash.includes("access_token")) && session) {
        setAuthMessage(
            output,
            "✅ Your email is confirmed. Preparing your Viking and entering Midgard…",
            "success"
        );
        await ensureCurrentPlayerProfile();
        window.setTimeout(() => window.location.replace("home.html"), 900);
        return;
    }

    if (confirmationFlag) {
        setAuthMessage(
            output,
            "✅ Your email has been confirmed. Log in below to begin your saga.",
            "success"
        );
    }
}

if (document.getElementById("login-button")) {
    handleEmailConfirmationCallback();
}

/* =====================================
   LOG IN
===================================== */

const loginButton = document.getElementById("login-button");

if (loginButton) {
    loginButton.addEventListener("click", async () => {
        const email = document.getElementById("login-email")?.value.trim();
        const password = document.getElementById("login-password")?.value || "";
        const output = document.getElementById("login-message");

        if (!email || !password) {
            setAuthMessage(output, "Enter your email address and password.");
            return;
        }

        loginButton.disabled = true;
        loginButton.textContent = "Entering Midgard…";
        setAuthMessage(output, "Checking your details…", "info");

        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

        if (error) {
            setAuthMessage(output, friendlyAuthError(error));
            loginButton.disabled = false;
            loginButton.textContent = "Login";
            return;
        }

        if (!data.user) {
            setAuthMessage(output, "Your account could not be loaded. Please try again.");
            loginButton.disabled = false;
            loginButton.textContent = "Login";
            return;
        }

        const player = await ensureCurrentPlayerProfile();

        if (!player) {
            setAuthMessage(
                output,
                "Your login worked, but your Viking profile is still being prepared. Refresh once, or ask the game owner to run SUPABASE_AUTH_SETUP.sql.",
                "error"
            );
            loginButton.disabled = false;
            loginButton.textContent = "Login";
            return;
        }

        await supabaseClient
            .from("players")
            .update({ last_online: new Date().toISOString() })
            .eq("id", data.user.id);

        window.location.replace("home.html");
    });

    ["login-email", "login-password"].forEach(id => {
        document.getElementById(id)?.addEventListener("keydown", event => {
            if (event.key === "Enter" && !loginButton.disabled) loginButton.click();
        });
    });
}

/* =====================================
   LOG OUT
===================================== */

async function logoutGame() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();

        if (user) {
            await supabaseClient
                .from("players")
                .update({ last_online: new Date().toISOString() })
                .eq("id", user.id);
        }

        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;

        window.location.replace("login.html");
    } catch (error) {
        console.error("Logout failed:", error);
        alert("Logout failed. Please try again.");
    }
}

window.logoutGame = logoutGame;

/* =====================================
   LOAD SHARED PLAYER DATA
===================================== */

async function loadHomePage() {
    const { data: { user } } = await supabaseClient.auth.getUser();

    if (!user) {
        const publicPages = ["login.html", "signup.html", "index.html", ""];
        const currentPage = window.location.pathname.split("/").pop();
        if (!publicPages.includes(currentPage)) window.location.replace("login.html");
        return;
    }

    let data = await ensureCurrentPlayerProfile();

    if (!data) {
        document.querySelectorAll("[id$='loading'], .oak-loading").forEach(element => {
            element.textContent = "Your Viking profile could not be loaded. Please refresh after the database setup is applied.";
        });
        return;
    }

    const now = new Date();
    const last = new Date(data.last_regen || now);
    const ticks = Math.floor(Math.floor((now - last) / 60000) / 5);

    if (ticks > 0) {
        const gain = ticks * 5;
        for (const stat of ["health", "energy", "stamina", "courage"]) {
            data[stat] = Math.min(
                Number(data[stat] || 0) + gain,
                Number(data[`max_${stat}`] || 100)
            );
        }

        data.last_regen = now.toISOString();
        await supabaseClient
            .from("players")
            .update({
                health: data.health,
                energy: data.energy,
                stamina: data.stamina,
                courage: data.courage,
                last_regen: data.last_regen
            })
            .eq("id", user.id);
    }

    await supabaseClient
        .from("players")
        .update({ last_online: now.toISOString() })
        .eq("id", user.id);

    const set = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.innerText = value;
    };

    set("username", data.username);
    set("home-username", data.username);
    set("reputation", Number(data.reputation || 0).toLocaleString());
    set("rank", typeof reputationTitle === "function" ? reputationTitle(data.reputation) : (data.is_free_man ? "Freeman" : "Thrall"));
    set("player-rank", typeof reputationTitle === "function" ? reputationTitle(data.reputation) : (data.is_free_man ? "Freeman" : "Thrall"));
    set("silver", Number(data.silver || 0).toLocaleString());
    set("silver-card", Number(data.silver || 0).toLocaleString());
    set("health", `${data.health || 0} / ${data.max_health || 500}`);
    set("energy", `${data.energy || 0} / ${data.max_energy || 100}`);
    set("stamina", `${data.stamina || 0} / ${data.max_stamina || 100}`);
    set("courage", `${data.courage || 0} / ${data.max_courage || 100}`);
}
