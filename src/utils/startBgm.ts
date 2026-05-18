import { assetUrl } from './assets';
import { createManagedBgm, pauseManagedBgm, playManagedBgm } from './bgmAudio';

const startBgm = createManagedBgm(assetUrl('music/start.mp3'));

export function playStartBgm(): void {
  playManagedBgm(startBgm, 0);
}

export function stopStartBgm(reset = true): void {
  pauseManagedBgm(startBgm, reset, 0);
}
