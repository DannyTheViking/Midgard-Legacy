"use strict";

/*
 * Midgard Legacy - Property Preview System
 *
 * The actual upgrade system is deliberately disabled for the first test.
 * This file allows testers to preview each future house without changing
 * their saved property level or spending resources.
 */

const propertyStages = [
    {
        level: 0,
        name: "Old Shack",
        image: "../images/property/old shack.png",
        alt: "A broken and run-down wooden shack",
        description:
            "An abandoned shack with a damaged roof, broken timbers and unsafe walls. It is not much, but the land now belongs to you."
    },
    {
        level: 1,
        name: "Upgraded Shack",
        image: "../images/property/upgraded shack.png",
        alt: "A repaired wooden Viking shack",
        description:
            "The roof and walls have been repaired, creating a secure wooden home and unlocking space for your first Apiary."
    },
    {
        level: 2,
        name: "Small House",
        image: "../images/property/small house.png",
        alt: "A small Viking wooden house",
        description:
            "A proper Viking house with stronger foundations, more living space and enough land to begin expanding your estate."
    },
    {
        level: 3,
        name: "Medium House",
        image: "../images/property/med house.png",
        alt: "A medium-sized Viking house",
        description:
            "A larger timber-and-stone homestead that displays your growing wealth, reputation and influence."
    },
    {
        level: 4,
        name: "Large House",
        image: "../images/property/large house.png",
        alt: "A large two-floor Viking house",
        description:
            "A grand two-floor homestead worthy of a wealthy Viking, with room for servants, storage and further estate buildings."
    }
];

/*
 * Keep this at zero for the first public test.
 *
 * Later this value should be loaded from Supabase using the signed-in
 * player's property_level column.
 */
let CURRENT_PROPERTY_LEVEL = 0;

const currentPropertyImage =
    document.getElementById("current-property-image");

const currentPropertyName =
    document.getElementById("current-property-name");

const currentPropertyLevel =
    document.getElementById("current-property-level");

const currentPropertyDescription =
    document.getElementById("current-property-description");

const returnCurrentPropertyButton =
    document.getElementById("return-current-property");

const previewButtons =
    document.querySelectorAll(".preview-property-button");

const propertyStageCards =
    document.querySelectorAll(".property-stage");

function getPropertyStage(level) {
    return propertyStages.find((stage) => stage.level === level);
}

function removePreviewHighlight() {
    propertyStageCards.forEach((card) => {
        card.classList.remove("previewed-stage");
    });
}

function highlightStage(level) {
    removePreviewHighlight();

    const selectedCard = document.querySelector(
        `[data-property-level="${level}"]`
    );

    if (selectedCard) {
        selectedCard.classList.add("previewed-stage");
    }
}

function displayProperty(stage, isPreview = false) {
    if (!stage) {
        console.error("Property stage could not be found.");
        return;
    }

    currentPropertyImage.src = stage.image;
    currentPropertyImage.alt = stage.alt;

    currentPropertyName.textContent = stage.name;
    currentPropertyLevel.textContent = `Level ${stage.level}`;
    currentPropertyDescription.textContent = stage.description;

    returnCurrentPropertyButton.hidden = !isPreview;

    highlightStage(stage.level);

    if (isPreview) {
        currentPropertyLevel.textContent =
            `Level ${stage.level} Preview`;
    }

    currentPropertyImage.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
    });
}

function displayCurrentProperty() {
    const currentStage = getPropertyStage(CURRENT_PROPERTY_LEVEL);

    displayProperty(currentStage, false);
}

previewButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const previewLevel = Number(button.dataset.previewLevel);

        if (!Number.isInteger(previewLevel)) {
            console.error("Invalid property preview level.");
            return;
        }

        const selectedStage = getPropertyStage(previewLevel);

        displayProperty(
            selectedStage,
            previewLevel !== CURRENT_PROPERTY_LEVEL
        );
    });
});

returnCurrentPropertyButton.addEventListener(
    "click",
    displayCurrentProperty
);

async function loadSavedPropertyLevel() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;

        const { data, error } = await supabaseClient
            .from("players")
            .select("property_level")
            .eq("id", user.id)
            .maybeSingle();

        if (!error && data) {
            CURRENT_PROPERTY_LEVEL = Math.max(0, Number(data.property_level) || 0);
        }
    } catch (error) {
        console.warn("Could not load property level:", error);
    }

    const apiaryCard = document.getElementById("apiary-building-card");
    const apiaryText = document.getElementById("apiary-unlock-text");

    if (apiaryCard && CURRENT_PROPERTY_LEVEL >= 1) {
        const link = document.createElement("a");
        link.id = apiaryCard.id;
        link.className = "property-building available";
        link.href = "apiary.html";
        link.innerHTML = apiaryCard.innerHTML;
        apiaryCard.replaceWith(link);
        if (apiaryText) apiaryText.textContent = "Available";
        const newText = document.getElementById("apiary-unlock-text");
        if (newText) newText.textContent = "Available";
    }

    displayCurrentProperty();
}

loadSavedPropertyLevel();