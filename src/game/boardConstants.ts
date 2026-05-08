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

export const DIVINE_BLESS_WINGS_TEXTURE_KEY = 'divine-bless-wings';
export const DIVINE_BLESS_WINGS_SCALE = 0.8;
export const DIVINE_BLESS_WINGS_OFFSET_Y = -4;
export const DIVINE_BLESS_WINGS_APPEAR_DURATION = 280;
export const DIVINE_BLESS_WINGS_HOLD_DURATION = 520;
export const DIVINE_BLESS_WINGS_DISAPPEAR_DURATION = 320;

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

// Lost way animation timing constants (ms)
export const LOST_WAY_DISSOLVE_START_DELAY = 300; // delay before dissolve begins
export const LOST_WAY_DISSOLVE_DURATION = 800; // dissolve shader progress 0→1
export const LOST_WAY_DIZZY_START_DELAY = 1100; // dizzy (hurt+tint+stars) starts when dissolve completes
export const LOST_WAY_DIZZY_DURATION = 1200; // dizzy duration (stiffness lasts until animation fully ends)
export const LOST_WAY_RECOVERY_START_DELAY = 1800; // recovery shader progress 1→0 starts
export const LOST_WAY_RECOVERY_DURATION = 500; // recovery duration
export const LOST_WAY_TOTAL_EFFECT_MS = 2300; // total effect duration after popup

// Hidden buff animation timing constants (ms)
export const HIDDEN_BUFF_DISSOLVE_START_DELAY = 200; // delay before dissolve begins
export const HIDDEN_BUFF_DISSOLVE_DURATION = 800; // dissolve/disintegrate duration
export const HIDDEN_BUFF_HIDDEN_DURATION = 400; // hidden (fully dissolved) duration
export const HIDDEN_BUFF_RECOVERY_START_DELAY = 1200; // recovery start (200+800+400)
export const HIDDEN_BUFF_RECOVERY_DURATION = 500; // recovery/reassemble duration
export const HIDDEN_BUFF_TOTAL_EFFECT_MS = 1700; // total effect duration after popup

// Dizzy animation timing constants (ms)
export const DIZZY_TOTAL_EFFECT_MS = 1500; // total dizzy effect duration
export const DIZZY_TINT_COLOR = 0x9c27b0; // purple tint for stunned look

// Boss battle dissolve animation timing constants (ms)
export const BOSS_BATTLE_DISSOLVE_DURATION = 600;     // dissolve phase shader progress 0→1
export const BOSS_BATTLE_HOLD_DURATION = 700;          // hold at full dissolve (boss charge-up pause)
export const BOSS_BATTLE_RECOVERY_DURATION = 500;      // recovery phase shader progress 1→0

// Relic animation texture and animation keys
export const RELIC_TEXTURE_KEY = 'relic-chest';
export const RELIC_BOMB_TEXTURE_KEY = 'relic-bomb';
export const RELIC_BOMB_ANIMATION_KEY = 'relic_bomb_anim';
export const RELIC_BOMB_FRAME_WIDTH = 96;
export const RELIC_BOMB_FRAME_HEIGHT = 96;
export const RELIC_BOMB_FRAME_COUNT = 9;
export const RELIC_BOMB_FRAME_RATE = 12;

// Relic animation timing constants (ms)
export const RELIC_CHEST_APPEAR_DELAY = 200; // delay before chest appears
export const RELIC_CHEST_APPEAR_DURATION = 600; // chest appear duration (scale 0→1.5, alpha 0→1)
export const RELIC_BOMB_START_DELAY = 800; // bomb explosion start (200+600)
export const RELIC_WEAPON_FLY_DELAY = 1200; // weapon fly-out start (200+600+400)
export const RELIC_WEAPON_FLY_DURATION = 700; // weapon parabolic fly duration (rise 300 + fall 400)
export const RELIC_WEAPON_LAND_STAY_DURATION = 300; // weapon stay on ground after landing
export const RELIC_WEAPON_DISAPPEAR_DELAY = 2200; // weapon disappear start (200+600+400+700+300)
export const RELIC_WEAPON_DISAPPEAR_DURATION = 600; // weapon sparkle + fade duration
export const RELIC_TOTAL_EFFECT_MS = 2800; // total effect duration after popup

// Relic animation layout constants (world-space px)
export const RELIC_CHEST_OFFSET_X = 40; // chest offset to right of player
export const RELIC_CHEST_START_OFFSET_Y = -100; // chest start offset above target (drops from above)
export const RELIC_CHEST_LAND_OFFSET_Y = -10; // chest landing Y offset above feetY (visual centering)
export const RELIC_BOMB_SCALE = 1.3; // bomb explosion sprite scale
export const RELIC_WEAPON_LANDING_OFFSETS = [-60, -25, 25, 60]; // horizontal landing offsets relative to chest
export const RELIC_WEAPON_LAND_Y_OFFSET = -10; // weapon landing Y offset above feetY (same as chest)
export const RELIC_WEAPON_PEAK_HEIGHT_MIN = 50; // minimum parabolic peak height (px above feet)
export const RELIC_WEAPON_PEAK_HEIGHT_MAX = 80; // maximum parabolic peak height

// Weapon icon categories and their file paths
export const WEAPON_CATEGORIES = ['sword', 'crossbow', 'swear', 'shield', 'fork'] as const;
export type WeaponCategory = (typeof WEAPON_CATEGORIES)[number];
export const WEAPON_ICON_KEYS: Record<WeaponCategory, string[]> = {
  sword: [
    'icon_05',
    'icon_06',
    'icon_07',
    'icon_08',
    'icon_09',
    'icon_10',
    'icon_11',
    'icon_17',
    'icon_18',
    'icon_19',
    'icon_20',
  ],
  crossbow: [
    'icon_25',
    'icon_26',
    'icon_27',
    'icon_28',
    'icon_29',
    'icon_30',
    'icon_36',
    'icon_37',
    'icon_38',
    'icon_39',
    'icon_40',
  ],
  swear: ['icon_46', 'icon_47', 'icon_48', 'icon_49', 'icon_50', 'icon_56', 'icon_57', 'icon_58', 'icon_59', 'icon_60'],
  shield: [
    'icon_66',
    'icon_67',
    'icon_68',
    'icon_69',
    'icon_70',
    'icon_75',
    'icon_76',
    'icon_77',
    'icon_78',
    'icon_79',
    'icon_80',
  ],
  fork: ['icon_96', 'icon_99'],
};

export const RELIC_WEAPON_COUNT = 4; // number of weapons to randomly select and fly out
