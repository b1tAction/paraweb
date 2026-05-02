import * as Phaser from 'phaser';
import type { Player } from '../types/protocol';

export type CharacterCoreAnimationState = 'idle' | 'move';
export type CharacterAnimationState = CharacterCoreAnimationState | 'hurt' | 'dead';

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

export const DEFAULT_CHARACTER_RENDERER: CharacterPhaserRenderer = {
  preload(scene, profile) {
    (Object.entries(profile.animations) as [CharacterAnimationState, CharacterSheetConfig][])
      .forEach(([state, animation]) => {
        scene.load.spritesheet(getTextureKey(profile, state), animation.textureUrl, {
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
        if (scene.anims.exists(animationKey)) return;

        scene.anims.create({
          key: animationKey,
          frames: scene.anims.generateFrameNumbers(getTextureKey(profile, state), {
            start: 0,
            end: Math.max(0, animation.frameCount - 1),
          }),
          frameRate: animation.frameRate,
          repeat: animation.repeat ?? -1,
        });
      });
  },

  createSprite({ scene, profile, x, y }) {
    const sprite = scene.add.sprite(x, y, getTextureKey(profile, 'idle'));
    sprite.setScale(profile.scale ?? DEFAULT_CHARACTER_SCALE);
    return sprite;
  },

  hasAnimation(scene, profile, state) {
    const animationConfig = profile.animations[state];
    if (!animationConfig) return false;

    return scene.anims.exists(getAnimationKey(profile, state));
  },

  play(scene, sprite, profile, state) {
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

  getAvatarDataUrl(_scene, _sprite, profile) {
    const avatarState = profile.avatarState ?? 'idle';
    const avatarFrame = profile.avatarFrame ?? 0;
    return _scene.textures.getBase64(getTextureKey(profile, avatarState), avatarFrame);
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
