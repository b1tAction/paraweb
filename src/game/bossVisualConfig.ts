import type { Player } from '../types/protocol';

export const BOSS_BEAST_PROFILE_ID = 'boss_beast';
export const BOSS_BEAST_ASSET_BASE = '/assets/boss/beast';

export const BOSS_BEAST_ASSETS = {
  portrait: {
    textureKey: 'boss_beast_portrait',
    textureUrl: `${BOSS_BEAST_ASSET_BASE}/portrait.png`,
  },
  idle: {
    textureKey: 'boss_beast_idle',
    textureUrl: `${BOSS_BEAST_ASSET_BASE}/idle.png`,
    frameWidth: 256,
    frameHeight: 256,
    frameCount: 8,
    frameRate: 7,
    repeat: -1,
  },
  attack: {
    textureKey: 'boss_beast_attack',
    textureUrl: `${BOSS_BEAST_ASSET_BASE}/attack.png`,
    frameWidth: 256,
    frameHeight: 256,
    frameCount: 8,
    frameRate: 12,
    repeat: 0,
  },
  hurt: {
    textureKey: 'boss_beast_hurt',
    textureUrl: `${BOSS_BEAST_ASSET_BASE}/hurt.png`,
    frameWidth: 256,
    frameHeight: 256,
    frameCount: 2,
    frameRate: 6,
    repeat: 0,
  },
  skillCast: {
    textureKey: 'boss_beast_skill_cast',
    textureUrl: `${BOSS_BEAST_ASSET_BASE}/skill_cast.png`,
    frameWidth: 256,
    frameHeight: 256,
    frameCount: 8,
    frameRate: 12,
    repeat: 0,
  },
  defeated: {
    textureKey: 'boss_beast_defeated',
    textureUrl: `${BOSS_BEAST_ASSET_BASE}/defeated.png`,
    frameWidth: 256,
    frameHeight: 256,
    frameCount: 8,
    frameRate: 9,
    repeat: 0,
  },
} as const;

export const BOSS_BEAST_PORTRAIT_SRC = BOSS_BEAST_ASSETS.portrait.textureUrl;
export const BOSS_BEAST_RENDER_SCALE = 0.8;
export const BOSS_BEAST_RENDER_OFFSET_X = 48;
export const BOSS_BEAST_RENDER_OFFSET_Y = 16;
export const BOSS_BEAST_RENDER_ORIGIN_X = 0.5;
export const BOSS_BEAST_RENDER_ORIGIN_Y = 1;
export const BOSS_BEAST_RENDER_DEFAULT_FLIP_X = true;
export const BOSS_BEAST_NAME_OFFSET_Y = -112;
export const BOSS_BEAST_EFFECT_OFFSET_Y = -68;

export function isBossPlayer(player: Player) {
  return Boolean(player.is_boss);
}
