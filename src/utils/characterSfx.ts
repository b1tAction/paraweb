import { assetUrl } from './assets';

/**
 * Character sound effect mapping
 * Maps character actions to their corresponding sound file paths
 */
const CHARACTER_SOUND_MAP: Record<string, string> = {
  // Player character attacks (shared across all characters)
  player_attack_normal: 'music/characters/player_attack.mp3',
  player_attack_crit: 'music/characters/player_crit.mp3',
  player_hurt: 'music/characters/player_hurt.mp3',

  // Boss attacks
  boss_attack_normal: 'music/characters/boss_attack.mp3',
  boss_attack_crit: 'music/characters/boss_crit.mp3',
  boss_hurt: 'music/characters/boss_hurt.mp3',
  boss_skill_thunder: 'music/characters/boss_thunder.mp3',
  boss_skill_curse: 'music/characters/boss_curse.mp3',
  boss_skill_thorns: 'music/characters/boss_thorns.mp3',
};

/**
 * Default volume for each sound type
 */
const CHARACTER_VOLUME_MAP: Record<string, number> = {
  player_attack_normal: 0.6,
  player_attack_crit: 0.75,
  player_hurt: 0.65,
  boss_attack_normal: 0.7,
  boss_attack_crit: 0.85,
  boss_hurt: 0.7,
  boss_skill_thunder: 0.8,
  boss_skill_curse: 0.65,
  boss_skill_thorns: 0.65,
};

// Cache for preloaded audio elements
const audioCache = new Map<string, HTMLAudioElement>();

/**
 * Preload a character sound effect
 */
function preloadCharacterSound(soundType: string): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;

  const soundPath = CHARACTER_SOUND_MAP[soundType];
  if (!soundPath) return null;

  if (audioCache.has(soundType)) {
    return audioCache.get(soundType)!;
  }

  const audio = new Audio(assetUrl(soundPath));
  audio.preload = 'auto';
  audio.volume = CHARACTER_VOLUME_MAP[soundType] ?? 0.6;
  audioCache.set(soundType, audio);

  return audio;
}

/**
 * Play character sound effect
 * @param soundType - The sound type (e.g., 'player_attack_normal', 'boss_hurt')
 * @param volume - Optional volume override (0.0 to 1.0)
 */
export function playCharacterSfx(soundType: string, volume?: number): void {
  console.log('[CharacterSfx] ========== playCharacterSfx 被调用 ==========');
  console.log('[CharacterSfx] soundType:', soundType);

  const soundPath = CHARACTER_SOUND_MAP[soundType];
  if (!soundPath) {
    console.warn(`[CharacterSfx] 没有为音效类型 "${soundType}" 配置音效`);
    return;
  }

  // Try to get cached audio, or create new one
  let baseAudio = audioCache.get(soundType);
  if (!baseAudio) {
    baseAudio = preloadCharacterSound(soundType) ?? undefined;
  }

  if (!baseAudio) {
    console.warn('[CharacterSfx] 无法创建音频对象');
    return;
  }

  // Create a new Audio instance for concurrent playback
  const sfxAudio = new Audio(assetUrl(soundPath));
  sfxAudio.volume = volume ?? baseAudio.volume;
  sfxAudio.currentTime = 0;

  console.log('[CharacterSfx] 音频路径:', sfxAudio.src);
  console.log('[CharacterSfx] 音量:', sfxAudio.volume);

  sfxAudio
    .play()
    .then(() => {
      console.log(`[CharacterSfx] ✅ 角色音效播放成功: ${soundType}`);
    })
    .catch((err) => {
      console.error(`[CharacterSfx] ❌ 播放角色音效失败: ${soundType}`, err);
    });
}

/**
 * Convenience functions for specific actions
 */

export function playPlayerAttackSfx(isCrit = false): void {
  playCharacterSfx(isCrit ? 'player_attack_crit' : 'player_attack_normal');
}

export function playPlayerHurtSfx(): void {
  playCharacterSfx('player_hurt');
}

export function playBossAttackSfx(isCrit = false): void {
  playCharacterSfx(isCrit ? 'boss_attack_crit' : 'boss_attack_normal');
}

export function playBossHurtSfx(): void {
  playCharacterSfx('boss_hurt');
}

export function playBossSkillSfx(skillType: string): void {
  const soundType = `boss_skill_${skillType}`;
  if (CHARACTER_SOUND_MAP[soundType]) {
    playCharacterSfx(soundType);
  } else {
    // Fallback to generic attack sound for unmapped skills
    playCharacterSfx('boss_attack_normal');
  }
}

/**
 * Preload all character sounds for better performance
 * Call this during game initialization
 */
export function preloadAllCharacterSounds(): void {
  Object.keys(CHARACTER_SOUND_MAP).forEach((soundType) => {
    preloadCharacterSound(soundType);
  });
  console.log('[CharacterSfx] 已预加载所有角色音效');
}

/**
 * Get list of all supported sound types
 */
export function getSupportedSoundTypes(): string[] {
  return Object.keys(CHARACTER_SOUND_MAP);
}
