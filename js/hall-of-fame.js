async function board(
    title,
    column,
    formatter = value => value
) {
    const { data, error } = await supabaseClient
        .from("players")
        .select(`id, player_number, username, ${column}`)
        .order(column, { ascending: false })
        .limit(10);

    if (error) {
        console.error(`${title} failed to load:`, error);
    }

    return `
        <section class="card">
            <h3>${title}</h3>

            ${
                (data || [])
                    .map(
                        (player, index) => `
                            <p>
                                ${index + 1}.
                                <a href="profile.html?id=${player.player_number}">
                                    ${player.username}
                                </a>
                                —
                                ${formatter(player[column] || 0)}
                            </p>
                        `
                    )
                    .join("") ||
                "<p>No players yet.</p>"
            }
        </section>
    `;
}


/* =====================================
   CALCULATED PLAYER LEVEL BOARD
===================================== */

async function playerLevelBoard() {

    const { data: players, error: playerError } =
        await supabaseClient
            .from("players")
            .select("id, player_number, username");

    if (playerError) {
        console.error(
            "Total Skill board failed to load:",
            playerError
        );

        return `
            <section class="card">
                <h3>Total Skill</h3>
                <p>Could not load rankings.</p>
            </section>
        `;
    }

    const { data: skills, error: skillsError } =
        await supabaseClient
            .from("skills")
            .select("*");

    if (skillsError) {
        console.error(
            "Player skills failed to load:",
            skillsError
        );
    }

    const rankedPlayers = (players || [])
        .map(player => {

            const playerSkills = (skills || []).find(
                skill => skill.player_id === player.id
            );

            const calculatedLevel = playerSkills
                ? totalSkillFromSkills(playerSkills)
                : 0;

            return {
                ...player,
                calculatedLevel
            };

        })
        .sort(
            (a, b) =>
                b.calculatedLevel -
                a.calculatedLevel
        )
        .slice(0, 10);

    return `
        <section class="card">
            <h3>Total Skill</h3>

            ${
                rankedPlayers
                    .map(
                        (player, index) => `
                            <p>
                                ${index + 1}.
                                <a href="profile.html?id=${player.player_number}">
                                    ${player.username}
                                </a>
                                —
                                ${player.calculatedLevel}
                            </p>
                        `
                    )
                    .join("") ||
                "<p>No players yet.</p>"
            }
        </section>
    `;
}


/* =====================================
   LOAD HALL OF FAME
===================================== */

async function loadHall() {

    await refreshMyNetWorth();

    const hallGrid =
        document.getElementById("hof-grids");

    hallGrid.innerHTML = (
        await Promise.all([

            board(
                "Village Reputation",
                "reputation",
                value =>
                    Number(value).toLocaleString()
            ),

            playerLevelBoard(),

            board(
                "Wealth Ranking",
                "net_worth",
                value =>
                    `${Number(value).toLocaleString()} value · ${wealthTitle(value)}`
            ),

            board(
                "Revivers",
                "revive_count"
            ),

            board(
                "Jailbreakers",
                "jailbreak_count"
            ),

            board(
                "PvP Victories",
                "pvp_wins"
            )

        ])
    ).join("");

}

loadHall();