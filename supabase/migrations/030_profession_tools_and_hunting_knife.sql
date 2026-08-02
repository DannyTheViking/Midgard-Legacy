-- Midgard Legacy Hotfix 030
-- Applied directly to Supabase on 31 July 2026.
-- Keeps this project copy in sync with the live database.

-- This migration adds the Hunting Knife to Eirik's market for 5 Job Points,
-- classifies profession tools for the Bedroom, and updates the Bedroom RPCs
-- so permanent tools appear alongside ordinary inventory equipment.

-- The live migration was applied in two safe parts:
--   hotfix_030_add_hunting_tool_shop_item
--   hotfix_030_bedroom_profession_tools

-- Do not rerun this file on the current live project.
