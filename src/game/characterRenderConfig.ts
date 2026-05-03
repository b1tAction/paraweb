import * as Phaser from 'phaser';
import type { Player } from '../types/protocol';
import {
  BOSS_BEAST_ASSETS,
  BOSS_BEAST_EFFECT_OFFSET_Y,
  BOSS_BEAST_FALLBACK_TEXTURE_KEY,
  BOSS_BEAST_NAME_OFFSET_Y,
  BOSS_BEAST_PROFILE_ID,
  BOSS_BEAST_RENDER_DEFAULT_FLIP_X,
  BOSS_BEAST_RENDER_OFFSET_Y,
  BOSS_BEAST_RENDER_ORIGIN_X,
  BOSS_BEAST_RENDER_ORIGIN_Y,
  BOSS_BEAST_RENDER_SCALE,
  isBossPlayer,
} from './bossVisualConfig';

export type CharacterCoreAnimationState = 'idle' | 'move';
export type CharacterAnimationState =
  | CharacterCoreAnimationState
  | 'attack'
  | 'dead'
  | 'defeated'
  | 'hurt'
  | 'skill_cast';

export type CharacterSheetConfig = {
  textureKey?: string;
  textureUrl: string;
  frameWidth: number;
  frameHeight: number;
  frameSpacing?: number;
  frameCount: number;
  frameRate: number;
  repeat?: number;
};

export type CharacterRenderProfile = {
  id: string;
  scale?: number;
  offsetY?: number;
  originX?: number;
  originY?: number;
  defaultFlipX?: boolean;
  nameOffsetY?: number;
  effectOffsetY?: number;
  animations: Record<CharacterCoreAnimationState, CharacterSheetConfig>
    & Partial<Record<Exclude<CharacterAnimationState, CharacterCoreAnimationState>, CharacterSheetConfig>>;
  avatarState?: CharacterAnimationState;
  avatarFrame?: number;
};

export type CharacterSpriteContext = {
  scene: Phaser.Scene;
  player: Player;
  profile: CharacterRenderProfile;
  x: number;
  y: number;
};

export type CharacterPhaserRenderer = {
  preload(scene: Phaser.Scene, profile: CharacterRenderProfile): void;
  ensureAnimations(scene: Phaser.Scene, profile: CharacterRenderProfile): void;
  createSprite(context: CharacterSpriteContext): Phaser.GameObjects.Sprite;
  hasAnimation?(
    scene: Phaser.Scene,
    profile: CharacterRenderProfile,
    state: CharacterAnimationState
  ): boolean;
  play(
    scene: Phaser.Scene,
    sprite: Phaser.GameObjects.Sprite,
    profile: CharacterRenderProfile,
    state: CharacterAnimationState
  ): void;
  getAvatarDataUrl?(
    scene: Phaser.Scene,
    sprite: Phaser.GameObjects.Sprite,
    profile: CharacterRenderProfile
  ): string | null;
};

export type CharacterRenderOptions = {
  profiles?: Record<string, CharacterRenderProfile>;
  factionToProfileId?: Record<string, string>;
  fallbackProfileIds?: string[];
  renderer?: CharacterPhaserRenderer;
};

export type CharacterIdleSpriteMeta = {
  labelProfileId: string;
  textureUrl: string;
  frameWidth: number;
  frameHeight: number;
  frameSpacing?: number;
  frameCount: number;
  frameRate: number;
};

const DEFAULT_CHARACTER_SCALE = 0.65;
const DEFAULT_CHARACTER_OFFSET_Y = -16;

export const DEFAULT_FACTION_TO_PROFILE_ID: Record<string, string> = {
  zhu_que: 'red',
  qing_long: 'green',
  bai_hu: 'white',
  xuan_wu: 'black',
};

export const BOSS_BEAST_CHARACTER_PROFILE: CharacterRenderProfile = {
  id: BOSS_BEAST_PROFILE_ID,
  scale: BOSS_BEAST_RENDER_SCALE,
  offsetY: BOSS_BEAST_RENDER_OFFSET_Y,
  originX: BOSS_BEAST_RENDER_ORIGIN_X,
  originY: BOSS_BEAST_RENDER_ORIGIN_Y,
  defaultFlipX: BOSS_BEAST_RENDER_DEFAULT_FLIP_X,
  nameOffsetY: BOSS_BEAST_NAME_OFFSET_Y,
  effectOffsetY: BOSS_BEAST_EFFECT_OFFSET_Y,
  avatarState: 'idle',
  avatarFrame: 0,
  animations: {
    idle: {
      textureKey: BOSS_BEAST_ASSETS.idle.textureKey,
      textureUrl: BOSS_BEAST_ASSETS.idle.textureUrl,
      frameWidth: BOSS_BEAST_ASSETS.idle.frameWidth,
      frameHeight: BOSS_BEAST_ASSETS.idle.frameHeight,
      frameCount: BOSS_BEAST_ASSETS.idle.frameCount,
      frameRate: BOSS_BEAST_ASSETS.idle.frameRate,
      repeat: BOSS_BEAST_ASSETS.idle.repeat,
    },
    move: {
      textureKey: BOSS_BEAST_ASSETS.idle.textureKey,
      textureUrl: BOSS_BEAST_ASSETS.idle.textureUrl,
      frameWidth: BOSS_BEAST_ASSETS.idle.frameWidth,
      frameHeight: BOSS_BEAST_ASSETS.idle.frameHeight,
      frameCount: BOSS_BEAST_ASSETS.idle.frameCount,
      frameRate: BOSS_BEAST_ASSETS.idle.frameRate,
      repeat: BOSS_BEAST_ASSETS.idle.repeat,
    },
    attack: {
      textureKey: BOSS_BEAST_ASSETS.attack.textureKey,
      textureUrl: BOSS_BEAST_ASSETS.attack.textureUrl,
      frameWidth: BOSS_BEAST_ASSETS.attack.frameWidth,
      frameHeight: BOSS_BEAST_ASSETS.attack.frameHeight,
      frameCount: BOSS_BEAST_ASSETS.attack.frameCount,
      frameRate: BOSS_BEAST_ASSETS.attack.frameRate,
      repeat: BOSS_BEAST_ASSETS.attack.repeat,
    },
    skill_cast: {
      textureKey: BOSS_BEAST_ASSETS.skillCast.textureKey,
      textureUrl: BOSS_BEAST_ASSETS.skillCast.textureUrl,
      frameWidth: BOSS_BEAST_ASSETS.skillCast.frameWidth,
      frameHeight: BOSS_BEAST_ASSETS.skillCast.frameHeight,
      frameCount: BOSS_BEAST_ASSETS.skillCast.frameCount,
      frameRate: BOSS_BEAST_ASSETS.skillCast.frameRate,
      repeat: BOSS_BEAST_ASSETS.skillCast.repeat,
    },
    defeated: {
      textureKey: BOSS_BEAST_ASSETS.defeated.textureKey,
      textureUrl: BOSS_BEAST_ASSETS.defeated.textureUrl,
      frameWidth: BOSS_BEAST_ASSETS.defeated.frameWidth,
      frameHeight: BOSS_BEAST_ASSETS.defeated.frameHeight,
      frameCount: BOSS_BEAST_ASSETS.defeated.frameCount,
      frameRate: BOSS_BEAST_ASSETS.defeated.frameRate,
      repeat: BOSS_BEAST_ASSETS.defeated.repeat,
    },
  },
};

export const DEFAULT_CHARACTER_PROFILES: Record<string, CharacterRenderProfile> = {
  red: {
    id: 'red',
    scale: DEFAULT_CHARACTER_SCALE,
    offsetY: DEFAULT_CHARACTER_OFFSET_Y,
    avatarState: 'idle',
    avatarFrame: 0,
    animations: {
      idle: {
        textureUrl: '/assets/figures/witch_red/Idle_2.png',
        frameWidth: 96,
        frameHeight: 96,
        frameSpacing: 32,
        frameCount: 8,
        frameRate: 6,
        repeat: -1,
      },
      move: {
        textureUrl: '/assets/figures/witch_red/Run.png',
        frameWidth: 96,
        frameHeight: 96,
        frameSpacing: 32,
        frameCount: 10,
        frameRate: 10,
        repeat: -1,
      },
      hurt: {
        textureUrl: '/assets/figures/witch_red/Hurt.png',
        frameWidth: 96,
        frameHeight: 96,
        frameSpacing: 32,
        frameCount: 5,
        frameRate: 10,
        repeat: 0,
      },
      dead: {
        textureUrl: '/assets/figures/witch_red/Dead.png',
        frameWidth: 96,
        frameHeight: 96,
        frameSpacing: 32,
        frameCount: 4,
        frameRate: 8,
        repeat: 0,
      },
    },
  },
  green: {
    id: 'green',
    scale: DEFAULT_CHARACTER_SCALE,
    offsetY: DEFAULT_CHARACTER_OFFSET_Y,
    avatarState: 'idle',
    avatarFrame: 0,
    animations: {
      idle: {
        textureUrl: '/assets/figures/witch_green/Idle_2.png',
        frameWidth: 96,
        frameHeight: 96,
        frameSpacing: 32,
        frameCount: 9,
        frameRate: 6,
        repeat: -1,
      },
      move: {
        textureUrl: '/assets/figures/witch_green/Run.png',
        frameWidth: 96,
        frameHeight: 96,
        frameSpacing: 32,
        frameCount: 10,
        frameRate: 10,
        repeat: -1,
      },
      hurt: {
        textureUrl: '/assets/figures/witch_green/Hurt.png',
        frameWidth: 96,
        frameHeight: 96,
        frameSpacing: 32,
        frameCount: 4,
        frameRate: 10,
        repeat: 0,
      },
      dead: {
        textureUrl: '/assets/figures/witch_green/Dead.png',
        frameWidth: 96,
        frameHeight: 96,
        frameSpacing: 32,
        frameCount: 4,
        frameRate: 8,
        repeat: 0,
      },
    },
  },
  white: {
    id: 'white',
    scale: DEFAULT_CHARACTER_SCALE,
    offsetY: DEFAULT_CHARACTER_OFFSET_Y,
    avatarState: 'idle',
    avatarFrame: 0,
    animations: {
      idle: {
        textureUrl: '/assets/figures/wizard_blue/Idle.png',
        frameWidth: 96,
        frameHeight: 96,
        frameSpacing: 32,
        frameCount: 7,
        frameRate: 6,
        repeat: -1,
      },
      move: {
        textureUrl: '/assets/figures/wizard_blue/Run.png',
        frameWidth: 96,
        frameHeight: 96,
        frameSpacing: 32,
        frameCount: 8,
        frameRate: 10,
        repeat: -1,
      },
      hurt: {
        textureUrl: '/assets/figures/wizard_blue/Hurt.png',
        frameWidth: 96,
        frameHeight: 96,
        frameSpacing: 32,
        frameCount: 3,
        frameRate: 10,
        repeat: 0,
      },
      dead: {
        textureUrl: '/assets/figures/wizard_blue/Dead.png',
        frameWidth: 96,
        frameHeight: 96,
        frameSpacing: 32,
        frameCount: 6,
        frameRate: 8,
        repeat: 0,
      },
    },
  },
  black: {
    id: 'black',
    scale: DEFAULT_CHARACTER_SCALE,
    offsetY: DEFAULT_CHARACTER_OFFSET_Y,
    avatarState: 'idle',
    avatarFrame: 0,
    animations: {
      idle: {
        textureUrl: '/assets/figures/wizard_black/Idle.png',
        frameWidth: 96,
        frameHeight: 96,
        frameSpacing: 32,
        frameCount: 8,
        frameRate: 6,
        repeat: -1,
      },
      move: {
        textureUrl: '/assets/figures/wizard_black/Run.png',
        frameWidth: 96,
        frameHeight: 96,
        frameSpacing: 32,
        frameCount: 8,
        frameRate: 10,
        repeat: -1,
      },
      hurt: {
        textureUrl: '/assets/figures/wizard_black/Hurt.png',
        frameWidth: 96,
        frameHeight: 96,
        frameSpacing: 32,
        frameCount: 4,
        frameRate: 10,
        repeat: 0,
      },
      dead: {
        textureUrl: '/assets/figures/wizard_black/Dead.png',
        frameWidth: 96,
        frameHeight: 96,
        frameSpacing: 32,
        frameCount: 4,
        frameRate: 8,
        repeat: 0,
      },
    },
  },
};

function getCharacterFallbackTextureKey(profile: CharacterRenderProfile) {
  return profile.id === BOSS_BEAST_PROFILE_ID ? BOSS_BEAST_FALLBACK_TEXTURE_KEY : `${profile.id}_fallback`;
}

function ensureCharacterFallbackTexture(scene: Phaser.Scene, profile: CharacterRenderProfile) {
  const textureKey = getCharacterFallbackTextureKey(profile);
  if (scene.textures.exists(textureKey)) return textureKey;

  const graphics = scene.add.graphics();
  graphics.setVisible(false);
  graphics.clear();

  if (profile.id === BOSS_BEAST_PROFILE_ID) {
    graphics.fillStyle(0x17111a, 1);
    graphics.fillCircle(64, 72, 36);
    graphics.fillStyle(0x2b1822, 1);
    graphics.fillTriangle(20, 52, 4, 28, 40, 44);
    graphics.fillTriangle(108, 52, 124, 28, 88, 44);
    graphics.fillStyle(0x4e2932, 1);
    graphics.fillTriangle(58, 26, 64, 10, 70, 26);
    graphics.lineStyle(5, 0xef5350, 0.9);
    graphics.strokeCircle(64, 72, 42);
    graphics.fillStyle(0xfff3f4, 1);
    graphics.fillCircle(50, 66, 4);
    graphics.fillCircle(78, 66, 4);
    graphics.fillStyle(0xef5350, 1);
    graphics.fillTriangle(58, 82, 64, 90, 70, 82);
  } else {
    graphics.fillStyle(0x37474f, 1);
    graphics.fillCircle(64, 64, 38);
    graphics.lineStyle(4, 0xcfd8dc, 0.9);
    graphics.strokeCircle(64, 64, 42);
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(64, 64, 8);
  }

  graphics.generateTexture(textureKey, 128, 128);
  graphics.destroy();

  return textureKey;
}

export const DEFAULT_CHARACTER_RENDERER: CharacterPhaserRenderer = {
  preload(scene, profile) {
    const loadedTextureKeys = new Set<string>();
    (Object.entries(profile.animations) as [CharacterAnimationState, CharacterSheetConfig][])
      .forEach(([state, animation]) => {
        const textureKey = getTextureKey(profile, state);
        if (loadedTextureKeys.has(textureKey) || scene.textures.exists(textureKey)) return;
        loadedTextureKeys.add(textureKey);
        scene.load.spritesheet(textureKey, animation.textureUrl, {
          frameWidth: animation.frameWidth,
          frameHeight: animation.frameHeight,
          spacing: animation.frameSpacing ?? 0,
        });
      });
  },

  ensureAnimations(scene, profile) {
    (Object.entries(profile.animations) as [CharacterAnimationState, CharacterSheetConfig][])
      .forEach(([state, animation]) => {
        const animationKey = getAnimationKey(profile, state);
        const textureKey = getTextureKey(profile, state);
        if (!scene.textures.exists(textureKey) || scene.anims.exists(animationKey)) return;

        scene.anims.create({
          key: animationKey,
          frames: scene.anims.generateFrameNumbers(textureKey, {
            start: 0,
            end: Math.max(0, animation.frameCount - 1),
          }),
          frameRate: animation.frameRate,
          repeat: animation.repeat ?? -1,
        });
      });
  },

  createSprite({ scene, profile, x, y }) {
    const idleTextureKey = getTextureKey(profile, 'idle');
    const textureKey = scene.textures.exists(idleTextureKey) ? idleTextureKey : ensureCharacterFallbackTexture(scene, profile);
    const sprite = scene.add.sprite(x, y, textureKey);
    sprite.setOrigin(profile.originX ?? 0.5, profile.originY ?? 0.5);
    sprite.setScale(profile.scale ?? DEFAULT_CHARACTER_SCALE);
    sprite.setFlipX(profile.defaultFlipX ?? false);
    sprite.setData('usesFallbackTexture', textureKey === getCharacterFallbackTextureKey(profile));
    return sprite;
  },

  hasAnimation(scene, profile, state) {
    const animationConfig = profile.animations[state];
    if (!animationConfig) return false;

    return scene.anims.exists(getAnimationKey(profile, state));
  },

  play(scene, sprite, profile, state) {
    if (sprite.getData('usesFallbackTexture')) return;

    const preferredState = profile.animations[state] ? state : 'idle';
    const preferredKey = getAnimationKey(profile, preferredState);

    if (scene.anims.exists(preferredKey)) {
      sprite.play(preferredKey, true);
      return;
    }

    const idleKey = getAnimationKey(profile, 'idle');
    if (preferredState !== 'idle' && scene.anims.exists(idleKey)) {
      sprite.play(idleKey, true);
      return;
    }

    console.warn(
      `[characterRenderConfig] Missing animation key "${preferredKey}" for profile "${profile.id}".`
    );
  },

  getAvatarDataUrl(scene, _sprite, profile) {
    const avatarState = profile.avatarState ?? 'idle';
    const avatarFrame = profile.avatarFrame ?? 0;
    const avatarTextureKey = getTextureKey(profile, avatarState);
    const textureKey = scene.textures.exists(avatarTextureKey)
      ? avatarTextureKey
      : ensureCharacterFallbackTexture(scene, profile);
    return scene.textures.getBase64(textureKey, avatarFrame);
  },
};

export function getTextureKey(profile: CharacterRenderProfile, state: CharacterAnimationState) {
  const animation = profile.animations[state] ?? profile.animations.idle;
  return animation.textureKey ?? `${profile.id}_${state}`;
}

export function getAnimationKey(profile: CharacterRenderProfile, state: CharacterAnimationState) {
  return `${profile.id}_${state}_anim`;
}

export function getCharacterProfiles(options?: CharacterRenderOptions) {
  return options?.profiles ?? DEFAULT_CHARACTER_PROFILES;
}

export function getCharacterRenderer(options?: CharacterRenderOptions) {
  return options?.renderer ?? DEFAULT_CHARACTER_RENDERER;
}

export function getFallbackProfileIds(options?: CharacterRenderOptions) {
  const profiles = getCharacterProfiles(options);
  const fallbackIds = options?.fallbackProfileIds ?? Object.keys(profiles);
  return fallbackIds.filter((profileId) => Boolean(profiles[profileId]));
}

export function resolveCharacterProfile(
  player: Player,
  order: number,
  options?: CharacterRenderOptions
) {
  const profiles = getCharacterProfiles(options);
  const fallbackProfileIds = getFallbackProfileIds(options);
  const factionToProfileId = options?.factionToProfileId ?? DEFAULT_FACTION_TO_PROFILE_ID;

  if (isBossPlayer(player)) {
    return profiles[BOSS_BEAST_PROFILE_ID] ?? BOSS_BEAST_CHARACTER_PROFILE;
  }

  const profileIdFromFaction = player.faction ? factionToProfileId[player.faction] : undefined;
  const resolvedProfileId =
    (profileIdFromFaction && profiles[profileIdFromFaction] ? profileIdFromFaction : undefined) ??
    fallbackProfileIds[order % Math.max(1, fallbackProfileIds.length)];

  const profile = profiles[resolvedProfileId];
  if (!profile) {
    throw new Error('[characterRenderConfig] No character render profile is available.');
  }

  return profile;
}
export function getCharacterOffsetY(profile: CharacterRenderProfile) {
  return profile.offsetY ?? DEFAULT_CHARACTER_OFFSET_Y;
}

export function getCharacterNameOffsetY(profile: CharacterRenderProfile) {
  return profile.nameOffsetY ?? -30;
}

export function getCharacterEffectOffsetY(profile: CharacterRenderProfile) {
  return profile.effectOffsetY ?? 0;
}

export function getCharacterProfileByFaction(
  faction?: string | null,
  options?: CharacterRenderOptions
) {
  const profiles = getCharacterProfiles(options);
  const fallbackProfileIds = getFallbackProfileIds(options);
  const factionToProfileId = options?.factionToProfileId ?? DEFAULT_FACTION_TO_PROFILE_ID;

  const profileId =
    (faction ? factionToProfileId[faction] : undefined) ??
    fallbackProfileIds[0];

  if (profileId && profiles[profileId]) {
    return profiles[profileId];
  }

  const fallbackProfile = fallbackProfileIds
    .map((candidateId) => profiles[candidateId])
    .find(Boolean);

  if (!fallbackProfile) {
    throw new Error('[characterRenderConfig] No character render profile is available.');
  }

  return fallbackProfile;
}

export function getCharacterIdleSpriteMeta(
  faction?: string | null,
  options?: CharacterRenderOptions
): CharacterIdleSpriteMeta {
  const profile = getCharacterProfileByFaction(faction, options);
  const idle = profile.animations.idle;

  return {
    labelProfileId: profile.id,
    textureUrl: idle.textureUrl,
    frameWidth: idle.frameWidth,
    frameHeight: idle.frameHeight,
    frameSpacing: idle.frameSpacing,
    frameCount: idle.frameCount,
    frameRate: idle.frameRate,
  };
}
