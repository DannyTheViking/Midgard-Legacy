/* =====================================
   EQUIPMENT FUNCTIONS
===================================== */

/*
    Reduce durability on an equipped item.

    Later this function will work for:

    - Axes
    - Pickaxes
    - Fishing Rods
    - Hammers
    - Weapons
*/

async function damageEquippedTool(slot, amount) {

    // Find equipped tool

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) return;

    const { data: tool } = await supabaseClient

        .from("equipment")

        .select("*")

        .eq("player_id", user.id)

        .eq("slot", slot)

        .eq("is_equipped", true)

        .single();

    if (!tool) return;

    // Calculate new durability

    const newDurability = Math.max(
        tool.durability - amount,
        0
    );

    /* =====================================
   CHECK IF TOOL HAS BROKEN
===================================== */

/*
    If the durability reaches zero,
    the tool is broken.

    It can no longer be used until
    repaired at the Blacksmith.
*/

if (newDurability === 0) {

   const brokenMessage =
    "💀 <strong>Your Rusty Axe has broken!</strong><br><br>" +
    "Visit a Blacksmith to repair it.";

showForestMessage(brokenMessage);
}

    // Save durability

    await supabaseClient

        .from("equipment")

        .update({

            durability: newDurability

        })

        .eq("id", tool.id);

}