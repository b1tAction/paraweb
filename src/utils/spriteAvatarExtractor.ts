/**
 * spriteAvatarExtractor — extract a single-frame avatar from a character sprite sheet
 *
 * Loads the idle animation sprite sheet PNG, crops the first frame
 * using an offscreen <canvas>, and returns a base64 data URL.
 * This avoids needing a full Phaser instance just for avatar extraction.
 */

import type { CharacterRenderProfile } from '../game/characterRenderConfig';

// Cache extracted avatars by profile ID to avoid redundant loads
const avatarCache = new Map<string, string>();

/**
 * Extract frame 0 from a CharacterRenderProfile's idle sprite sheet as a base64 PNG data URL.
 *
 * @param profile - The character render profile containing idle animation metadata
 * @returns A promise resolving to the base64 data URL string, or empty string on failure
 */
export async function extractAvatarUrlFromProfile(profile: CharacterRenderProfile): Promise<string> {
  // Return cached result if available
  const cached = avatarCache.get(profile.id);
  if (cached) return cached;

  const idleAnimation = profile.animations.idle;
  const { textureUrl, frameWidth, frameHeight, frameSpacing = 0 } = idleAnimation;

  try {
    const dataUrl = await cropSpriteFrame(textureUrl, 0, 0, frameWidth, frameHeight, frameSpacing);
    avatarCache.set(profile.id, dataUrl);
    return dataUrl;
  } catch (e) {
    console.warn(`[spriteAvatarExtractor] Failed to extract avatar for profile "${profile.id}".`, e);
    return '';
  }
}

/**
 * Crop a specific frame from a sprite sheet PNG and return as base64 data URL.
 *
 * @param imageUrl - URL of the sprite sheet PNG
 * @param frameIndex - Frame index within the sheet (0-based, left-to-right)
 * @param frameWidth - Width of each frame in pixels
 * @param frameHeight - Height of each frame in pixels
 * @param frameSpacing - Spacing between frames in pixels (default 0)
 * @returns Promise resolving to base64 PNG data URL
 */
function cropSpriteFrame(
  imageUrl: string,
  frameIndex: number,
  _rowIndex: number,
  frameWidth: number,
  frameHeight: number,
  frameSpacing: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = frameWidth;
        canvas.height = frameHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Cannot get 2d context'));
          return;
        }

        // Calculate source x for the requested frame
        const srcX = frameIndex * (frameWidth + frameSpacing);

        ctx.clearRect(0, 0, frameWidth, frameHeight);
        ctx.drawImage(img, srcX, 0, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);

        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      } catch (e) {
        reject(e);
      }
    };

    img.onerror = () => {
      reject(new Error(`Failed to load image: ${imageUrl}`));
    };

    img.src = imageUrl;
  });
}

/**
 * Clear the avatar cache (useful when assets change, e.g., during HMR)
 */
export function clearAvatarCache(): void {
  avatarCache.clear();
}