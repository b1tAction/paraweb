import { assetUrl } from './assets';
import { createManagedBgm, pauseManagedBgm, playManagedBgm } from './bgmAudio';

const endBgm = createManagedBgm(assetUrl('assets/music/end.mp3'));

export function playEndBgm(): void {
  playManagedBgm(endBgm, 0);
}

export function stopEndBgm(reset = true): void {
  pauseManagedBgm(endBgm, reset, 0);
}
