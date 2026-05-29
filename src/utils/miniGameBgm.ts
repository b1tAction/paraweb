import { assetUrl } from './assets';
import { createManagedBgm, pauseManagedBgm, playManagedBgm } from './bgmAudio';

const miniGameBgm = createManagedBgm(assetUrl('music/mini_game.mp3'));

export function playMiniGameBgm(fadeMs?: number): void {
  stopMiniGameBgm(true, 0);
  playManagedBgm(miniGameBgm, fadeMs);
}

export function stopMiniGameBgm(reset = true, fadeMs?: number): void {
  pauseManagedBgm(miniGameBgm, reset, fadeMs);
}
