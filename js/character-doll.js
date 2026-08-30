"use strict";

/* Shared full-body equipment figure used by the Bedroom and PvP combat.
   The base artwork stays the same while lightweight SVG layers show the
   equipment currently returned by the server. */

(function initialiseMidgardCharacterDoll(global) {
    const SLOT_LABELS = {
        head: "Head",
        body: "Body",
        armour: "Body",
        legs: "Legs",
        feet: "Feet",
        main_hand: "Main hand",
        off_hand: "Off hand",
        defence: "Shield",
        ranged: "Bow",
        ammo: "Ammunition",
        accessory: "Accessory",
        utility: "Utility"
    };

    function escapeText(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function normaliseBodyType(value) {
        return String(value || "male").toLowerCase() === "female" ? "female" : "male";
    }

    function normaliseEquipment(input) {
        if (Array.isArray(input)) {
            return input.reduce((result, item) => {
                const slot = String(item?.slot_key || item?.slot || item?.category || "").toLowerCase();
                if (slot) result[slot] = item;
                return result;
            }, {});
        }
        return input && typeof input === "object" ? input : {};
    }

    function itemName(item) {
        return String(item?.name || "").toLowerCase();
    }

    function bodyArmour(eq) {
        const item = eq.body || eq.armour;
        if (!item) return "";
        const name = itemName(item);
        const title = escapeText(`Body: ${item.name}`);

        if (name.includes("mail") || name.includes("chain")) {
            return `
                <g class="doll-svg-item doll-svg-body" data-slot="body"><title>${title}</title>
                    <path d="M99 184 L126 166 H174 L201 184 L218 315 L191 333 L180 286 H120 L109 333 L82 315 Z" fill="url(#dollMail)" stroke="#c2aa78" stroke-width="3"/>
                    <path d="M120 286 H180 L190 374 H110 Z" fill="url(#dollMail)" stroke="#c2aa78" stroke-width="3"/>
                    <circle cx="150" cy="188" r="17" fill="#4b3a24" stroke="#d2ae5e" stroke-width="4"/>
                </g>`;
        }

        const leather = name.includes("leather") || name.includes("hide");
        const fill = leather ? "#65442d" : "#4f5860";
        const edge = leather ? "#bd8c53" : "#c3a86c";
        return `
            <g class="doll-svg-item doll-svg-body" data-slot="body"><title>${title}</title>
                <path d="M104 181 L128 167 H172 L196 181 L209 306 L183 322 L176 279 H124 L117 322 L91 306 Z" fill="${fill}" stroke="${edge}" stroke-width="4"/>
                <path d="M124 279 H176 L184 352 H116 Z" fill="${fill}" stroke="${edge}" stroke-width="4"/>
                <path d="M123 214 H177 M119 249 H181" stroke="#241b13" stroke-width="5" opacity=".7"/>
                <circle cx="150" cy="190" r="15" fill="#2a2016" stroke="#d5ad55" stroke-width="4"/>
            </g>`;
    }

    function helmet(eq) {
        const item = eq.head;
        if (!item) return "";
        const name = itemName(item);
        const spectacle = name.includes("spectacle");
        return `
            <g class="doll-svg-item doll-svg-head" data-slot="head"><title>${escapeText(`Head: ${item.name}`)}</title>
                <path d="M112 105 Q150 62 188 105 L183 139 Q150 119 117 139 Z" fill="#667078" stroke="#d0b574" stroke-width="4"/>
                <path d="M150 89 V158" stroke="#d7bc7a" stroke-width="7" stroke-linecap="round"/>
                ${spectacle ? '<path d="M119 132 Q133 116 147 132 M153 132 Q167 116 181 132" fill="none" stroke="#c9ad6c" stroke-width="7"/>' : ""}
                <path d="M111 108 Q150 79 189 108" fill="none" stroke="#34383c" stroke-width="7"/>
            </g>`;
    }

    function legArmour(eq) {
        const item = eq.legs;
        if (!item) return "";
        return `
            <g class="doll-svg-item doll-svg-legs" data-slot="legs"><title>${escapeText(`Legs: ${item.name}`)}</title>
                <path d="M112 351 L145 351 L141 472 L111 472 Z" fill="#4f5860" stroke="#bd9b5c" stroke-width="3"/>
                <path d="M155 351 L188 351 L189 472 L159 472 Z" fill="#4f5860" stroke="#bd9b5c" stroke-width="3"/>
                <path d="M112 389 H143 M110 430 H142 M157 389 H188 M158 430 H190" stroke="#282d31" stroke-width="5"/>
            </g>`;
    }

    function footArmour(eq) {
        const item = eq.feet;
        if (!item) return "";
        return `
            <g class="doll-svg-item doll-svg-feet" data-slot="feet"><title>${escapeText(`Feet: ${item.name}`)}</title>
                <path d="M101 468 H143 L146 546 Q118 563 91 546 Z" fill="#49352a" stroke="#aa7b45" stroke-width="4"/>
                <path d="M157 468 H199 L209 546 Q182 563 154 546 Z" fill="#49352a" stroke="#aa7b45" stroke-width="4"/>
                <path d="M104 496 L140 521 M104 521 L140 496 M160 496 L197 521 M160 521 L197 496" stroke="#c39758" stroke-width="4"/>
            </g>`;
    }

    function shield(eq) {
        const item = eq.defence || (itemName(eq.off_hand).includes("shield") ? eq.off_hand : null);
        if (!item) return "";
        const reinforced = itemName(item).includes("reinforced") || itemName(item).includes("iron");
        return `
            <g class="doll-svg-item doll-svg-shield" data-slot="defence"><title>${escapeText(`Shield: ${item.name}`)}</title>
                <circle cx="73" cy="319" r="62" fill="${reinforced ? "#4f5960" : "#75442d"}" stroke="#2b241d" stroke-width="12"/>
                <circle cx="73" cy="319" r="49" fill="none" stroke="#d1a34e" stroke-width="5"/>
                <path d="M73 272 V366 M26 319 H120" stroke="#38261b" stroke-width="8" opacity=".65"/>
                <circle cx="73" cy="319" r="18" fill="#8e999f" stroke="#d0b66f" stroke-width="5"/>
            </g>`;
    }

    function meleeWeapon(eq) {
        const item = eq.main_hand || (eq.off_hand && !itemName(eq.off_hand).includes("shield") ? eq.off_hand : null);
        if (!item) return "";
        const name = itemName(item);
        const title = escapeText(`Weapon: ${item.name}`);

        if (name.includes("spear")) {
            return `<g class="doll-svg-item doll-svg-weapon" data-slot="main_hand"><title>${title}</title><path d="M236 105 L244 522" stroke="#795233" stroke-width="10"/><path d="M236 105 L253 151 L232 147 Z" fill="#bdc5c8" stroke="#d8b866" stroke-width="4"/></g>`;
        }
        if (name.includes("axe")) {
            return `<g class="doll-svg-item doll-svg-weapon" data-slot="main_hand"><title>${title}</title><path d="M225 207 L260 484" stroke="#755036" stroke-width="12"/><path d="M213 191 Q247 154 273 181 L262 234 Q238 216 217 220 Z" fill="#899397" stroke="#d0b36b" stroke-width="4"/></g>`;
        }
        return `<g class="doll-svg-item doll-svg-weapon" data-slot="main_hand"><title>${title}</title><path d="M225 228 L260 492" stroke="#d0d7da" stroke-width="11"/><path d="M220 216 L233 213 L219 167 Z" fill="#d8e0e1" stroke="#d1b369" stroke-width="4"/><path d="M211 244 L245 239" stroke="#d3a750" stroke-width="10"/><path d="M255 467 L266 497" stroke="#69462f" stroke-width="15"/></g>`;
    }

    function rangedWeapon(eq) {
        const item = eq.ranged;
        if (!item) return "";
        return `
            <g class="doll-svg-item doll-svg-ranged" data-slot="ranged"><title>${escapeText(`Bow: ${item.name}`)}</title>
                <path d="M218 146 Q279 300 218 477" fill="none" stroke="#8b5d32" stroke-width="10"/>
                <path d="M218 146 L218 477" stroke="#d9cfad" stroke-width="2"/>
            </g>`;
    }

    function ammunition(eq) {
        const item = eq.ammo;
        const count = Number(eq.arrow_count || item?.quantity || 0);
        if (!item && count < 1) return "";
        return `
            <g class="doll-svg-item doll-svg-ammo" data-slot="ammo"><title>${escapeText(`Ammunition: ${item?.name || "Arrows"}${count ? ` (${count})` : ""}`)}</title>
                <path d="M184 207 L212 199 L225 371 L197 381 Z" fill="#66442c" stroke="#b98a4f" stroke-width="4"/>
                <path d="M194 197 L206 151 M202 199 L216 154 M210 202 L225 160" stroke="#c8ad70" stroke-width="4"/>
                <path d="M202 151 l-8 10 M216 154 l-8 10 M225 160 l-8 9" stroke="#8d3940" stroke-width="5"/>
            </g>`;
    }

    function accessoryAndUtility(eq) {
        let result = "";
        if (eq.accessory) {
            result += `<g class="doll-svg-item doll-svg-accessory" data-slot="accessory"><title>${escapeText(`Accessory: ${eq.accessory.name}`)}</title><circle cx="150" cy="203" r="13" fill="#d5a936" stroke="#6f4a1f" stroke-width="4"/><path d="M144 203 l6-8 6 8-6 9z" fill="#8e2733"/></g>`;
        }
        if (eq.utility) {
            result += `<g class="doll-svg-item doll-svg-utility" data-slot="utility"><title>${escapeText(`Utility: ${eq.utility.name}`)}</title><path d="M188 286 Q223 284 226 320 V374 Q207 390 187 375 Z" fill="#5f3e29" stroke="#b27d42" stroke-width="4"/><path d="M191 305 H222" stroke="#d0a458" stroke-width="5"/></g>`;
        }
        return result;
    }

    function equipmentSvg(eq) {
        return `
            <svg class="character-doll-equipment" viewBox="0 0 300 600" aria-hidden="true" focusable="false">
                <defs>
                    <pattern id="dollMail" width="12" height="10" patternUnits="userSpaceOnUse">
                        <rect width="12" height="10" fill="#5f686e"/>
                        <path d="M0 5 Q3 0 6 5 T12 5" fill="none" stroke="#c0c8c9" stroke-width="2"/>
                    </pattern>
                </defs>
                ${rangedWeapon(eq)}
                ${ammunition(eq)}
                ${bodyArmour(eq)}
                ${legArmour(eq)}
                ${footArmour(eq)}
                ${helmet(eq)}
                ${accessoryAndUtility(eq)}
                ${meleeWeapon(eq)}
                ${shield(eq)}
            </svg>`;
    }

    function equipmentDescription(eq) {
        const entries = Object.entries(SLOT_LABELS)
            .filter(([slot]) => eq[slot])
            .map(([slot, label]) => `${label}: ${eq[slot].name}`);
        if (!entries.length) return "No armour or weapons equipped";
        return entries.join(", ");
    }

    function render(options = {}) {
        const bodyType = normaliseBodyType(options.bodyType);
        const eq = normaliseEquipment(options.equipment);
        const assetRoot = String(options.assetRoot || "../images/characters").replace(/\/$/, "");
        const label = options.label || `${bodyType === "female" ? "Female" : "Male"} Viking equipment figure`;
        const className = options.className ? ` ${escapeText(options.className)}` : "";
        const description = equipmentDescription(eq);

        return `
            <div class="character-doll${className}" role="img" aria-label="${escapeText(`${label}. ${description}`)}">
                <div class="character-doll-glow" aria-hidden="true"></div>
                <img class="character-doll-base" src="${escapeText(`${assetRoot}/viking-base-${bodyType}.png`)}" alt="" loading="eager">
                ${equipmentSvg(eq)}
                <span class="character-doll-floor" aria-hidden="true"></span>
            </div>`;
    }

    global.MidgardCharacterDoll = {
        render,
        normaliseEquipment,
        normaliseBodyType
    };
})(window);
