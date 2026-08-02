"use strict";

let activeTaskPeriod = "daily";

function taskEscape(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

async function loadTasks() {
    const message = document.getElementById("task-message");
    const badge = document.getElementById("task-reset-badge");
    if (message) message.textContent = "Loading tasks…";
    try {
    const { data: rawData, error } = await supabaseClient.rpc("get_player_tasks", {
        p_period: activeTaskPeriod
    });

    if (error) throw error;
    const data = typeof rawData === "string" ? JSON.parse(rawData) : (rawData || {});
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    const completed = tasks.filter((task) => task.completed).length;
    document.getElementById("task-reset-badge").textContent = `Resets ${data.resets_at_display}`;
    document.getElementById("task-summary").innerHTML = `<h2>${taskEscape(data.period_name)} Tasks: ${completed} / 10</h2>`;

    document.getElementById("task-list").innerHTML = tasks.map((task) => {
        const progress = Math.min(Number(task.progress || 0), Number(task.target || 0));
        const percent = Math.min(100, Math.floor((progress / Math.max(1, Number(task.target))) * 100));
        return `
            <article class="task-row ${task.completed ? "done" : ""}">
                <span>${task.completed ? "✅" : "⬜"}</span>
                <div>
                    <strong>${taskEscape(task.label)}</strong>
                    <div class="task-bar"><span style="width:${percent}%"></span></div>
                </div>
                <span class="task-progress">${progress.toLocaleString()} / ${Number(task.target).toLocaleString()}</span>
            </article>
        `;
    }).join("");

    const reward = Number(data.reward_silver || 0);
    const ready = completed === 10;
    document.getElementById("task-reward").innerHTML = `
        <strong>Reward: ${reward.toLocaleString()} Silver</strong><br><br>
        <button id="claim-task-reward" ${!ready || data.reward_claimed ? "disabled" : ""}>
            ${data.reward_claimed ? "Reward Claimed" : ready ? "Claim Reward" : "Complete All 10 Tasks"}
        </button>
    `;

    document.getElementById("claim-task-reward")?.addEventListener("click", claimTaskReward);
    if (message) message.textContent = "";
    } catch (error) {
        console.error("Task loading failed:", error);
        if (badge) badge.textContent = "Could not load";
        if (message) message.innerHTML = `❌ ${taskEscape(error.message || "Tasks could not be loaded.")} <button id="retry-tasks" type="button">Try Again</button>`;
        document.getElementById("retry-tasks")?.addEventListener("click", loadTasks);
    }
}

async function claimTaskReward() {
    const button = document.getElementById("claim-task-reward");
    button.disabled = true;

    const { data, error } = await supabaseClient.rpc("claim_task_reward", {
        p_period: activeTaskPeriod
    });

    const message = document.getElementById("task-message");
    if (error) {
        message.textContent = error.message;
        button.disabled = false;
        return;
    }

    message.textContent = `Good work, warrior! ${Number(data.silver_awarded).toLocaleString()} Silver was added.`;
    await loadTasks();
}

document.addEventListener("DOMContentLoaded", async () => {
    // Tasks must not wait for the shared layout. A sidebar/topbar problem should
    // never leave the actual task page stuck on Loading.
    document.querySelectorAll("[data-task-period]").forEach((button) => {
        button.addEventListener("click", async () => {
            activeTaskPeriod = button.dataset.taskPeriod;
            document.querySelectorAll("[data-task-period]").forEach((item) => item.classList.toggle("active", item === button));
            await loadTasks();
        });
    });
    await loadTasks();
});
