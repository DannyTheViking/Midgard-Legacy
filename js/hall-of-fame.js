const HALL_BOARDS = [
    {
        key: "reputation",
        title: "Village Reputation",
        icon: "👑",
        description: "The most respected names in Midgard.",
        column: "reputation",
        formatter: value => Number(value || 0).toLocaleString()
    },
    {
        key: "skill",
        title: "Total Skill",
        icon: "🏆",
        description: "The most experienced players across every skill.",
        calculated: true
    },
    {
        key: "wealth",
        title: "Wealth Ranking",
        icon: "💰",
        description: "The richest players in Midgard.",
        column: "net_worth",
        formatter: value =>
            `${Number(value || 0).toLocaleString()} value · ${wealthTitle(value)}`
    },
    {
        key: "revivers",
        title: "Revivers",
        icon: "🌿",
        description: "Players who have restored the most lives.",
        column: "revive_count",
        formatter: value => Number(value || 0).toLocaleString()
    },
    {
        key: "jailbreakers",
        title: "Jailbreakers",
        icon: "🔓",
        description: "Players responsible for the most successful escapes.",
        column: "jailbreak_count",
        formatter: value => Number(value || 0).toLocaleString()
    },
    {
        key: "pvp",
        title: "PvP Victories",
        icon: "⚔️",
        description: "The most successful warriors in player combat.",
        column: "pvp_wins",
        formatter: value => Number(value || 0).toLocaleString()
    }
];

let activeHallBoard = "reputation";
let hallBoardCache = {};

function hallMedal(index) {
    if (index === 0) {
        return "🥇";
    }

    if (index === 1) {
        return "🥈";
    }

    if (index === 2) {
        return "🥉";
    }

    return `${index + 1}.`;
}

function escapeHallText(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function loadStandardBoard(board) {
    const { data, error } = await supabaseClient
        .from("players")
        .select(`
            id,
            player_number,
            username,
            ${board.column}
        `)
        .order(board.column, {
            ascending: false
        })
        .limit(10);

    if (error) {
        console.error(`${board.title} failed to load:`, error);
        throw error;
    }

    return (data || []).map(player => ({
        id: player.id,
        playerNumber: player.player_number,
        username: player.username,
        value: player[board.column] || 0,
        formattedValue: board.formatter(player[board.column] || 0)
    }));
}

async function loadTotalSkillBoard() {
    const [
        playersResult,
        skillsResult
    ] = await Promise.all([
        supabaseClient
            .from("players")
            .select(`
                id,
                player_number,
                username
            `),

        supabaseClient
            .from("skills")
            .select("*")
    ]);

    if (playersResult.error) {
        throw playersResult.error;
    }

    if (skillsResult.error) {
        throw skillsResult.error;
    }

    return (playersResult.data || [])
        .map(player => {
            const playerSkills = (skillsResult.data || []).find(
                skill => skill.player_id === player.id
            );

            const totalSkill = playerSkills
                ? totalSkillFromSkills(playerSkills)
                : 0;

            return {
                id: player.id,
                playerNumber: player.player_number,
                username: player.username,
                value: totalSkill,
                formattedValue: totalSkill.toLocaleString()
            };
        })
        .sort((first, second) => second.value - first.value)
        .slice(0, 10);
}

async function getHallBoardData(board) {
    if (hallBoardCache[board.key]) {
        return hallBoardCache[board.key];
    }

    const rows = board.calculated
        ? await loadTotalSkillBoard()
        : await loadStandardBoard(board);

    hallBoardCache[board.key] = rows;

    return rows;
}

function renderHallMenu() {
    const menu = document.getElementById("hof-menu");

    menu.innerHTML = HALL_BOARDS
        .map(board => {
            const activeClass =
                board.key === activeHallBoard
                    ? "active"
                    : "";

            return `
                <button
                    type="button"
                    class="hof-menu-button ${activeClass}"
                    data-hof-board="${board.key}"
                >
                    <span class="hof-menu-icon">${board.icon}</span>

                    <span class="hof-menu-text">
                        <strong>${board.title}</strong>
                        <small>${board.description}</small>
                    </span>

                    <span class="hof-menu-arrow">
                        ${board.key === activeHallBoard ? "▼" : "▶"}
                    </span>
                </button>
            `;
        })
        .join("");

    menu
        .querySelectorAll("[data-hof-board]")
        .forEach(button => {
            button.addEventListener("click", async () => {
                activeHallBoard = button.dataset.hofBoard;

                renderHallMenu();
                await renderActiveHallBoard();
            });
        });
}

async function renderActiveHallBoard() {
    const container =
        document.getElementById("hof-board-content");

    const board = HALL_BOARDS.find(
        item => item.key === activeHallBoard
    );

    if (!board) {
        return;
    }

    container.innerHTML = `
        <div class="hof-loading">
            Loading ${escapeHallText(board.title)}...
        </div>
    `;

    try {
        const rows = await getHallBoardData(board);

        container.innerHTML = `
            <div class="hof-board-header">
                <div>
                    <h2>${board.icon} ${escapeHallText(board.title)}</h2>
                    <p>${escapeHallText(board.description)}</p>
                </div>

                <span class="hof-top-ten-badge">Top 10</span>
            </div>

            <div class="hof-ranking-list">
                ${
                    rows.length
                        ? rows
                            .map((player, index) => `
                                <article class="hof-ranking-row hof-rank-${index + 1}">

                                    <span class="hof-rank-position">
                                        ${hallMedal(index)}
                                    </span>

                                    <div class="hof-player-details">
                                        <a
                                            href="profile.html?id=${player.playerNumber}"
                                            class="hof-player-name"
                                        >
                                            ${escapeHallText(player.username)}
                                        </a>
                                    </div>

                                    <strong class="hof-ranking-value">
                                        ${escapeHallText(player.formattedValue)}
                                    </strong>

                                </article>
                            `)
                            .join("")
                        : `
                            <div class="hof-empty">
                                No players have entered this ranking yet.
                            </div>
                        `
                }
            </div>
        `;
    } catch (error) {
        console.error(
            `${board.title} failed to render:`,
            error
        );

        container.innerHTML = `
            <div class="hof-error">
                Could not load this leaderboard.
            </div>
        `;
    }
}

async function loadHall() {
    try {
        await refreshMyNetWorth();
    } catch (error) {
        console.error(
            "Could not refresh net worth:",
            error
        );
    }

    renderHallMenu();
    await renderActiveHallBoard();
}

loadHall();