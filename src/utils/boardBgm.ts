import { assetUrl } from './assets';
import { createManagedBgm, pauseManagedBgm, playManagedBgm } from './bgmAudio';

const boardBgm = createManagedBgm(assetUrl('assets/music/adventure.mp3'));

export function playBoardBgm(fadeMs?: number): void {
  playManagedBgm(boardBgm, fadeMs);
}

export function stopBoardBgm(reset = true, fadeMs?: number): void {
  pauseManagedBgm(boardBgm, reset, fadeMs);
}
