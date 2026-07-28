/* MIDGARD LEGACY - central game configuration */

const TEST_MODE = true;

/*
    All production timers live here.
    Pages should never define their own hours/minutes.
*/
const GAME_TIMERS = Object.freeze({
    honey_seconds: TEST_MODE ? 5 * 60 : 12 * 60 * 60,
    young_mead_seconds: TEST_MODE ? 5 * 60 : 24 * 60 * 60,

    /* Future systems */
    iron_bar_seconds: TEST_MODE ? 10 : 30 * 60,
    crop_growth_seconds: TEST_MODE ? 5 * 60 : 12 * 60 * 60,
    cooking_seconds: TEST_MODE ? 10 : 10 * 60,
    hospital_seconds: TEST_MODE ? 60 : 60 * 60
});

/* Backwards-compatible names used by current pages. */
const HONEY_TIME_SECONDS = GAME_TIMERS.honey_seconds;
const YOUNG_MEAD_TIME_SECONDS = GAME_TIMERS.young_mead_seconds;

function getGameTimerSeconds(timerKey, fallbackSeconds = 0) {
    const value = Number(GAME_TIMERS[timerKey]);
    return Number.isFinite(value) && value >= 0
        ? value
        : Math.max(0, Number(fallbackSeconds || 0));
}


function updateSidebarClock() {
    const dateElement = document.getElementById("sidebar-date");
    const timeElement = document.getElementById("sidebar-time");

    if (!dateElement || !timeElement) {
        return;
    }

    const now = new Date();

    dateElement.textContent = now.toLocaleDateString("en-GB", {
        timeZone: "Europe/London",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });

    timeElement.textContent = now.toLocaleTimeString("en-GB", {
        timeZone: "Europe/London",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    });
}

updateSidebarClock();
setInterval(updateSidebarClock, 1000);

