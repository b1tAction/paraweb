import { assetUrl } from './assets';

/**
 * Event sound effect mapping
 * Maps event types to their corresponding sound file paths
 */
const EVENT_SOUND_MAP: Record<string, string> = {
  // High priority - dramatic events
  thunder: 'music/events/thunder.mp3',
  skull_gaze: 'music/events/skull_gaze.mp3',
  relic: 'music/events/relic.mp3',
  divine_bless: 'music/events/divine_bless.mp3',

  // Medium priority - clear positive/negative feedback
  herb: 'music/events/herb.mp3',
  ghost_hit: 'music/events/ghost_hit.mp3',
  mosquito: 'music/events/mosquito.mp3',
  lost_way: 'music/events/lost_way.mp3',

  // Low priority - atmosphere
  lucky_bubble: 'music/events/lucky_bubble.mp3',
  wind_gust: 'music/events/wind_gust.mp3',
  exchange: 'music/events/exchange.mp3',
  hidden_buff: 'music/events/hidden_buff.mp3',
  taste_test: 'music/events/taste_test.mp3',
  dog_poop: 'music/events/dog_poop.mp3',
  magic_flute: 'music/events/magic_flute.mp3',
  crimson_blade: 'music/events/crimson_blade.mp3',
};

/**
 * Default volume for each event type
 * Can be adjusted based on the intensity of the event
 */
const EVENT_VOLUME_MAP: Record<string, number> = {
  thunder: 0.8,
  skull_gaze: 0.7,
  relic: 0.7,
  divine_bless: 0.6,
  herb: 0.5,
  ghost_hit: 0.6,
  mosquito: 0.5,
  lost_way: 0.6,
  lucky_bubble: 0.4,
  wind_gust: 0.5,
  exchange: 0.5,
  hidden_buff: 0.5,
  taste_test: 0.4,
  dog_poop: 0.4,
  magic_flute: 0.6,
  crimson_blade: 0.7,
};

// Cache for preloaded audio elements
const audioCache = new Map<string, HTMLAudioElement>();

/**
 * Preload an event sound effect
 */
function preloadEventSound(eventType: string): HTMLAudioElement | undefined {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return undefined;

  const soundPath = EVENT_SOUND_MAP[eventType];
  if (!soundPath) return undefined;

  if (audioCache.has(eventType)) {
    return audioCache.get(eventType)!;
  }

  const audio = new Audio(assetUrl(soundPath));
  audio.preload = 'auto';
  audio.volume = EVENT_VOLUME_MAP[eventType] ?? 0.5;
  audioCache.set(eventType, audio);

  return audio;
}

/**
 * Play event sound effect
 * @param eventType - The event type (e.g., 'thunder', 'herb', 'skull_gaze')
 * @param volume - Optional volume override (0.0 to 1.0)
 */
export function playEventSfx(eventType: string, volume?: number): void {
  console.log('[EventSfx] ========== playEventSfx 被调用 ==========');
  console.log('[EventSfx] eventType:', eventType);

  const soundPath = EVENT_SOUND_MAP[eventType];
  if (!soundPath) {
    console.warn(`[EventSfx] 没有为事件类型 "${eventType}" 配置音效`);
    return;
  }

  // Try to get cached audio, or create new one
  let baseAudio = audioCache.get(eventType);
  if (!baseAudio) {
    baseAudio = preloadEventSound(eventType);
  }

  if (!baseAudio) {
    console.warn('[EventSfx] 无法创建音频对象');
    return;
  }

  // Create a new Audio instance for concurrent playback
  const eventAudio = new Audio(assetUrl(soundPath));
  eventAudio.volume = volume ?? baseAudio.volume;
  eventAudio.currentTime = 0;

  console.log('[EventSfx] 音频路径:', eventAudio.src);
  console.log('[EventSfx] 音量:', eventAudio.volume);

  eventAudio
    .play()
    .then(() => {
      console.log(`[EventSfx] ✅ 事件音效播放成功: ${eventType}`);
    })
    .catch((err) => {
      console.error(`[EventSfx] ❌ 播放事件音效失败: ${eventType}`, err);
    });
}

/**
 * Preload all event sounds for better performance
 * Call this during game initialization
 */
export function preloadAllEventSounds(): void {
  Object.keys(EVENT_SOUND_MAP).forEach((eventType) => {
    preloadEventSound(eventType);
  });
  console.log('[EventSfx] 已预加载所有事件音效');
}

/**
 * Get list of all supported event types
 */
export function getSupportedEventTypes(): string[] {
  return Object.keys(EVENT_SOUND_MAP);
}
