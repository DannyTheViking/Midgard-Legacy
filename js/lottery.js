let raffleValues = [];

function getLocalDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getWeekStart() {
    const date = new Date();
    const day = date.getDay();
    const daysSinceMonday = day === 0 ? 6 : day - 1;

    date.setDate(date.getDate() - daysSinceMonday);

    return getLocalDate(date);
}

async function loadLottery() {
    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) {
        return;
    }

    const { data: prices, error: pricesError } =
        await supabaseClient
            .from("item_values")
            .select("item_id, silver_value, items(name)");

    if (pricesError) {
        console.error("Could not load raffle prices:", pricesError);
        raffleValues = [];
    } else {
        raffleValues = prices || [];
    }

    const itemSelect =
        document.getElementById("lottery-item");

    itemSelect.innerHTML =
        '<option value="silver">Silver</option>' +
        raffleValues
            .map((item) => {
                const itemName =
                    item.items?.name || "Unknown Item";

                const itemValue =
                    Number(item.silver_value || 0);

                return `
                    <option value="${item.item_id}">
                        ${itemName}
                        (${itemValue.toLocaleString("en-GB")} each)
                    </option>
                `;
            })
            .join("");

    updateRaffleRequiredQuantity();

    const currentDrawKey = getNextRaffleDraw()
        .toLocaleDateString("en-CA", { timeZone: "Europe/London" });

    const { data: entries, error: entriesError } =
        await supabaseClient
            .from("lottery_entries")
            .select("entry_count")
            .eq("player_id", user.id)
            .eq("draw_key", currentDrawKey);

    if (entriesError) {
        console.error(
            "Could not load private raffle entries:",
            entriesError
        );
    }

    const totalEntries = (entries || []).reduce(
        (total, entry) =>
            total + Number(entry.entry_count || 0),
        0
    );

    document.getElementById(
        "my-lottery-entries"
    ).textContent = totalEntries.toLocaleString("en-GB");

    const { data: pool, error: poolError } =
        await supabaseClient
            .from("lottery_pool_view")
            .select("*");

    if (poolError) {
        console.error(
            "Could not load raffle pool:",
            poolError
        );
    }

    document.getElementById("lottery-pool").innerHTML =
        (pool || [])
            .map(
                (item) =>
                    `<p>${item.item_name}: ${Number(
                        item.total_quantity || 0
                    ).toLocaleString("en-GB")}</p>`
            )
            .join("") || "<p>Empty</p>";

    const { data: history, error: historyError } =
        await supabaseClient
            .from("lottery_draws")
            .select("*, players(username)")
            .order("drawn_at", { ascending: false })
            .limit(100);

    if (historyError) {
        console.error(
            "Could not load raffle history:",
            historyError
        );
    }

    document.getElementById("lottery-history").innerHTML =
        (history || [])
            .map(
                (draw) =>
                    `<p>${
                        draw.players?.username || "Unknown Player"
                    } — ${new Date(
                        draw.drawn_at
                    ).toLocaleDateString("en-GB")}</p>`
            )
            .join("") || "<p>No winners yet.</p>";

    const biggest = [...(history || [])]
        .sort(
            (first, second) =>
                Number(second.total_value || 0) -
                Number(first.total_value || 0)
        )
        .slice(0, 10);

    document.getElementById("lottery-biggest").innerHTML =
        biggest
            .map(
                (draw, index) =>
                    `<p>${index + 1}. ${
                        draw.players?.username || "Unknown Player"
                    } — ${Number(
                        draw.total_value || 0
                    ).toLocaleString("en-GB")} value</p>`
            )
            .join("") || "<p>No jackpots yet.</p>";
}


function updateRaffleRequiredQuantity() {
    const item = document.getElementById("lottery-item")?.value;
    const quantityInput = document.getElementById("lottery-quantity");
    if (!quantityInput || !item) return;
    if (item === "silver") { quantityInput.value = 1000; return; }
    const selected = raffleValues.find(row => String(row.item_id) === String(item));
    const value = Math.max(1, Number(selected?.silver_value || 0));
    quantityInput.value = Math.ceil(1000 / value);
}

async function enterLottery() {
    const message =
        document.getElementById("lottery-message");

    const button =
        document.getElementById("lottery-enter-button");

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) {
        message.textContent =
            "❌ You must be signed in.";
        return;
    }

    const item =
        document.getElementById("lottery-item").value;

    const quantity = Math.floor(
        Number(
            document.getElementById(
                "lottery-quantity"
            ).value
        )
    );

    if (!Number.isFinite(quantity) || quantity < 1) {
        message.textContent =
            "❌ Quantity must be at least 1.";
        return;
    }

    const today = getLocalDate();

    const { data: existing, error: existingError } =
        await supabaseClient
            .from("lottery_entries")
            .select("id")
            .eq("player_id", user.id)
            .eq("entry_date", today)
            .maybeSingle();

    if (existingError) {
        console.error(
            "Could not check today's entry:",
            existingError
        );

        message.textContent =
            "❌ The raffle could not be checked.";
        return;
    }

    if (existing) {
        message.textContent =
            "❌ You already entered today.";
        return;
    }

    let contributionValue;

    if (item === "silver") {
        contributionValue = quantity;
    } else {
        const selectedItem = raffleValues.find(
            (raffleItem) =>
                String(raffleItem.item_id) === item
        );

        contributionValue =
            quantity *
            Number(selectedItem?.silver_value || 0);
    }

    if (contributionValue < 1000) {
        message.textContent =
            "❌ Contribution must be worth at least 1,000 silver.";
        return;
    }

    const tickets =
        Math.floor(contributionValue / 1000);

    button.disabled = true;
    message.textContent = "Entering raffle...";

    const { error } = await supabaseClient.rpc(
        "enter_weekly_lottery",
        {
            p_item_id:
                item === "silver"
                    ? null
                    : Number(item),

            p_quantity: quantity,
            p_entry_count: tickets
        }
    );

    button.disabled = false;

    if (error) {
        message.textContent =
            `❌ ${error.message}`;

        return;
    }

    message.textContent =
        tickets === 1
            ? "✅ Your 1 raffle entry has been accepted."
            : `✅ Your ${tickets.toLocaleString(
                  "en-GB"
              )} raffle entries have been accepted.`;

    await loadLottery();
}

document.getElementById("lottery-item")?.addEventListener("change", updateRaffleRequiredQuantity);

document
    .getElementById("lottery-enter-button")
    ?.addEventListener("click", enterLottery);

    function getNextRaffleDraw() {
    const now = new Date();

    const ukParts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    }).formatToParts(now);

    const values = {};

    for (const part of ukParts) {
        if (part.type !== "literal") {
            values[part.type] = part.value;
        }
    }

    const weekdayNumbers = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6
    };

    const currentWeekday = weekdayNumbers[values.weekday];

    let daysUntilThursday = (4 - currentWeekday + 7) % 7;

    const currentHour = Number(values.hour);
    const currentMinute = Number(values.minute);
    const currentSecond = Number(values.second);

    if (
        daysUntilThursday === 0 &&
        (
            currentHour > 15 ||
            (
                currentHour === 15 &&
                (currentMinute > 0 || currentSecond > 0)
            )
        )
    ) {
        daysUntilThursday = 7;
    }

    const currentUkDate = new Date(
        Date.UTC(
            Number(values.year),
            Number(values.month) - 1,
            Number(values.day)
        )
    );

    currentUkDate.setUTCDate(
        currentUkDate.getUTCDate() + daysUntilThursday
    );

    const drawYear = currentUkDate.getUTCFullYear();
    const drawMonth = currentUkDate.getUTCMonth();
    const drawDay = currentUkDate.getUTCDate();

    const londonOffset = getLondonOffsetMinutes(
        drawYear,
        drawMonth,
        drawDay
    );

    return new Date(
        Date.UTC(
            drawYear,
            drawMonth,
            drawDay,
            15 - londonOffset / 60,
            0,
            0
        )
    );
}

function getLondonOffsetMinutes(year, month, day) {
    const testDate = new Date(Date.UTC(year, month, day, 12, 0, 0));

    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        timeZoneName: "shortOffset"
    }).formatToParts(testDate);

    const zone = parts.find(
        part => part.type === "timeZoneName"
    )?.value || "GMT";

    const match = zone.match(/GMT([+-]\d+)?/);

    return match?.[1]
        ? Number(match[1]) * 60
        : 0;
}

function updateRaffleCountdown() {
    const nextDrawElement =
        document.getElementById("raffle-next-draw");

    const countdownElement =
        document.getElementById("raffle-countdown");

    if (!nextDrawElement || !countdownElement) {
        return;
    }

    const drawDate = getNextRaffleDraw();
    const now = new Date();

    const difference = Math.max(
        0,
        drawDate.getTime() - now.getTime()
    );

    const totalSeconds = Math.floor(difference / 1000);

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    nextDrawElement.textContent =
        `Next draw: ${drawDate.toLocaleDateString("en-GB", {
            timeZone: "Europe/London",
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        })}`;

    countdownElement.textContent =
        `⏳ ${days}d ${hours}h ${minutes}m ${seconds}s`;
}

updateRaffleCountdown();

setInterval(updateRaffleCountdown, 1000);

loadLottery();