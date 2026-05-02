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
    frameWidth: 128,
    frameHeight: 128,
    frameCount: 4,
    frameRate: 7,
    repeat: -1,
  },
  attack: {
    textureKey: 'boss_beast_attack',
    textureUrl: `${BOSS_BEAST_ASSET_BASE}/attack.png`,
    frameWidth: 128,
    frameHeight: 128,
    frameCount: 6,
    frameRate: 11,
    repeat: 0,
  },
  skillCast: {
    textureKey: 'boss_beast_skill_cast',
    textureUrl: `${BOSS_BEAST_ASSET_BASE}/skill_cast.png`,
    frameWidth: 128,
    frameHeight: 128,
    frameCount: 6,
    frameRate: 11,
    repeat: 0,
  },
  defeated: {
    textureKey: 'boss_beast_defeated',
    textureUrl: `${BOSS_BEAST_ASSET_BASE}/defeated.png`,
    frameWidth: 128,
    frameHeight: 128,
    frameCount: 5,
    frameRate: 9,
    repeat: 0,
  },
} as const;

export const BOSS_BEAST_PORTRAIT_SRC = BOSS_BEAST_ASSETS.portrait.textureUrl;
export const BOSS_BEAST_RENDER_SCALE = 0.84;
export const BOSS_BEAST_RENDER_OFFSET_Y = -24;
export const BOSS_BEAST_FALLBACK_TEXTURE_KEY = `${BOSS_BEAST_PROFILE_ID}_fallback`;

export function isBossPlayer(player: Player) {
  const normalizedId = player.player_id?.toLowerCase?.() || '';
  const normalizedName = player.display_name?.toLowerCase?.() || '';

  return Boolean(player.is_boss) || normalizedId === 'boss' || normalizedName === 'boss';
}
