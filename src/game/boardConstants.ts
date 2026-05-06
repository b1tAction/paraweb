// Shared constants used across the board scene and its animation modules.

export const GAME_FONT_FAMILY = 'Zpix, sans-serif';
export const CHARACTER_HALF_HEIGHT = 31; // character sprite half-height ≈ 96 * 0.65 / 2

// Texture and animation keys
export const RESPAWN_TEXTURE_KEY = 'respawn-effect';
export const RESPAWN_ANIMATION_KEY = 'respawn_anim';
export const RESPAWN_FRAME_WIDTH = 32;
export const RESPAWN_FRAME_HEIGHT = 32;
export const RESPAWN_FRAME_COUNT = 12;
export const RESPAWN_FRAME_RATE = 18;

export const LP_ADD_TEXTURE_KEY = 'lp-add-effect';
export const LP_ADD_ANIMATION_KEY = 'lp_add_anim';
export const LP_ADD_FRAME_WIDTH = 64;
export const LP_ADD_FRAME_HEIGHT = 64;
export const LP_ADD_FRAME_COUNT = 12;
export const LP_ADD_FRAME_RATE = 18;

export const LP_MINUS_TEXTURE_KEY = 'lp-minus-effect';
export const LP_MINUS_ANIMATION_KEY = 'lp_minus_anim';
export const LP_MINUS_FRAME_WIDTH = 64;
export const LP_MINUS_FRAME_HEIGHT = 64;
export const LP_MINUS_FRAME_COUNT = 21;
export const LP_MINUS_FRAME_RATE = 18;

export const BLACKHOLE_TEXTURE_KEY = 'blackhole';
export const BLACKHOLE_ANIMATION_KEY = 'blackhole-rotate';
export const BLACKHOLE_ANI_TEXTURE_KEY = 'blackhole-ani';
export const BLACKHOLE_ANI_ANIMATION_KEY = 'blackhole-ani-effect';
export const BLACKHOLE_ANI_FRAME_COUNT = 3;
export const BLACKHOLE_FRAME_COUNT = 8;
export const BLACKHOLE_FRAME_RATE = 24;
export const BLACKHOLE_ANI_FRAME_RATE = 12;
export const BLACKHOLE_SIZE_SCALE = 2.0;

export const WARP_DOOR_TEXTURE_KEY = 'warp-door';
export const WARP_DOOR_ANIMATION_KEY = 'warp-door-swirl';
export const WARP_DOOR_CELL_OFFSET_Y = 1;
export const WARP_DOOR_DEPTH_OFFSET = 52;
export const WARP_DOOR_PLAYER_FRONT_DEPTH_OFFSET = 76;

export const WATER_TELEPORT_TEXTURE_KEY = 'water-teleport';
export const WATER_TELEPORT_ANIMATION_KEY = 'water-teleport-vortex';
export const WATER_TELEPORT_FRAME_COUNT = 48;
export const WATER_TELEPORT_FRAME_RATE = 24;

export const SHRINE_TEXTURE_KEY = 'map-shrine';
export const SHRINE_TILESET_NAME = 'shrine';

// Projectile texture/animation keys for boss damage crit animations
export const PROJECTILE_CHARGE_TEXTURE_KEY = 'witch-green-charge';
export const PROJECTILE_CHARGE_ANIMATION_KEY = 'witch_green_charge_anim';
export const PROJECTILE_CHARGE_FRAME_COUNT = 6;

export const PROJECTILE_SPEAR_TEXTURE_KEY = 'witch-red-spear';
export const PROJECTILE_SPEAR_ANIMATION_KEY = 'witch_red_spear_anim';
export const PROJECTILE_SPEAR_FRAME_COUNT = 10;

export const PROJECTILE_MAGIC_SPHERE_TEXTURE_KEY = 'wizard-black-magic-sphere';
export const PROJECTILE_MAGIC_SPHERE_ANIMATION_KEY = 'wizard_black_magic_sphere_anim';
export const PROJECTILE_MAGIC_SPHERE_FRAME_COUNT = 16;

export const PROJECTILE_FIREBALL_TEXTURE_KEY = 'wizard-blue-fireball';
export const PROJECTILE_FIREBALL_ANIMATION_KEY = 'wizard_blue_fireball_anim';
export const PROJECTILE_FIREBALL_FRAME_COUNT = 8;

export const PROJECTILE_FRAME_RATE = 10;
export const PROJECTILE_FLY_DURATION_MS = 400;

// UI and rendering constants
export const PLAYER_NAME_SCREEN_FONT_SIZE = 14;
export const CELL_LABEL_SCREEN_FONT_SIZE = 12;
export const PLAYER_NAME_TEXTURE_RESOLUTION = 2;
export const LOGIC_CELL_MARKER_SCALE = 1.5;