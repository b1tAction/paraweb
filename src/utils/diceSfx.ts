import { assetUrl } from './assets';

const DICE_SOUND_SRC = assetUrl('music/roll_dice.mp3');

let diceSfxAudio: HTMLAudioElement | null = null;

function getDiceSfxAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;

  if (!diceSfxAudio) {
    diceSfxAudio = new Audio(DICE_SOUND_SRC);
    diceSfxAudio.preload = 'auto';
    diceSfxAudio.volume = 1.0; // 改为最大音量测试
  }

  return diceSfxAudio;
}

/**
 * 播放骰子音效，在投骰子时调用
 * 骰子转动时间为 1200ms (DICE_ROLL_MIN_MS)
 */
export function playDiceSfx(): void {
  console.log('[DiceSfx] ========== playDiceSfx 被调用 ==========');
  console.log('[DiceSfx] DICE_SOUND_SRC:', DICE_SOUND_SRC);
  
  const baseAudio = getDiceSfxAudio();
  console.log('[DiceSfx] baseAudio:', baseAudio);
  
  if (!baseAudio) {
    console.warn('[DiceSfx] baseAudio 为空，无法播放');
    return;
  }

  // 直接使用 baseAudio 播放，不创建新实例
  baseAudio.currentTime = 0;
  baseAudio.volume = 1.0;
  
  console.log('[DiceSfx] baseAudio src:', baseAudio.src);
  console.log('[DiceSfx] baseAudio volume:', baseAudio.volume);
  console.log('[DiceSfx] baseAudio readyState:', baseAudio.readyState);
  
  baseAudio.play()
    .then(() => {
      console.log('[DiceSfx] ✅ 骰子音效播放成功！');
    })
    .catch((err) => {
      console.error('[DiceSfx] ❌ 播放骰子音效失败:', err);
      console.error('[DiceSfx] 错误详情:', err.name, err.message);
    });
}
