// Render layer constants for depth management in the board scene.
// World-space layers use Y-sorted depth (base + worldY) for isometric ordering.
// Screen-space layers use fixed depth values independent of world position.

// World-space layers (Y-sorted: base + worldY for isometric ordering)
export const LAYER_TILE_BASE = 0;          // tilemap layers
export const LAYER_OBJECT_BASE = 100;      // shrines, doors, warp doors
export const LAYER_CELL_BASE = 200;        // cell markers, cell labels
export const LAYER_CHARACTER_BASE = 300;   // player sprites (depth = LAYER + Y)
export const LAYER_PLAYER_NAME_BASE = 400; // player name labels
export const LAYER_EFFECT_BASE = 500;      // localized effects: rings, heal/damage sprites
export const LAYER_EFFECT_TEXT_BASE = 600; // floating text labels above effects

// Screen-space layers (fixed depth, not Y-sorted)
// Ordering: popup background < fullscreen effects < popup text
// This ensures effects are visible above the popup background,
// while popup text remains readable at the topmost layer.
export const LAYER_POPUP_BG = 800;          // popup background panel
export const LAYER_FULLSCREEN_EFFECT = 850;  // lightning/herb/wind sprites (screen-fixed)
export const LAYER_POPUP_TEXT = 900;         // popup text labels
export const LAYER_CAMERA_FX = 950;          // reserved for camera effects
export const LAYER_SHADER_OVERLAY = 960;    // shader overlay for dissolve effects
export const LAYER_LOST_WAY_CHARACTER = 970; // character temporarily raised during lost_way

/**
 * Compute world-sorted depth for a given layer base and Y position.
 * Objects at lower screen-Y (higher world-Y) render on top.
 */
export function worldDepth(layerBase: number, worldY: number): number {
  return layerBase + worldY;
}