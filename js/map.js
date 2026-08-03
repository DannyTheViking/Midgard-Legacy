(() => {
    const locations = {
        village: {
            icon: "🏘️",
            title: "Village",
            description: "Visit the village for local jobs, healing, training, trades and village craftsmen.",
            href: "village.html",
            button: "Enter Village"
        },
        property: {
            icon: "🏡",
            title: "My Property",
            description: "Return to your homestead, Storage Yard, property forge, workbench, apiary and other linked buildings.",
            href: "property.html",
            button: "Return to Property"
        },
        forest: {
            icon: "🌲",
            title: "Dark Forest",
            description: "Enter the forest to cut wood, explore and prepare for future creatures and dangers.",
            href: "forest.html",
            button: "Enter Dark Forest"
        },
        caves: {
            icon: "⛏️",
            title: "Caves",
            description: "Travel into the caves to mine stone, ore and other underground resources.",
            href: "mining.html",
            button: "Enter Caves"
        },
        coast: {
            icon: "🌊",
            title: "Coast",
            description: "Travel to the coast for fishing and future sailing adventures.",
            href: "fishing.html",
            button: "Visit Coast"
        },
        trade: {
            icon: "⚖️",
            title: "World Trade",
            description: "The main player marketplace. Buy and sell resources, tools, weapons and crafted goods with players from across Midgard.",
            href: "world-trade.html",
            button: "Enter World Trade"
        }
    };

    const title = document.getElementById("map-location-title");
    const description = document.getElementById("map-location-description");
    const icon = document.getElementById("map-location-icon");
    const link = document.getElementById("map-location-link");
    const hotspots = document.querySelectorAll(".map-hotspot");

    function selectLocation(key) {
        const location = locations[key];
        if (!location) return;

        hotspots.forEach(hotspot => {
            hotspot.classList.toggle(
                "is-active",
                hotspot.dataset.location === key
            );
        });

        icon.textContent = location.icon;
        title.textContent = location.title;
        description.textContent = location.description;
        link.textContent = location.button;
        link.href = location.href;
        link.classList.remove("is-disabled");
        link.removeAttribute("aria-disabled");
    }

    hotspots.forEach(hotspot => {
        hotspot.addEventListener("click", () => {
            selectLocation(hotspot.dataset.location);
        });

        hotspot.addEventListener("dblclick", () => {
            const location = locations[hotspot.dataset.location];
            if (location) window.location.href = location.href;
        });
    });

    selectLocation("trade");
})();
