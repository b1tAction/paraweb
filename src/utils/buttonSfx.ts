import { assetUrl } from './assets';

const BUTTON_SELECTOR = 'button, [role="button"], [data-button-sfx]';
const BUTTON_SOUND_SRC = assetUrl('music/button.mp3');

let buttonSfxAudio: HTMLAudioElement | null = null;
let buttonSfxInstalled = false;

function getButtonSfxAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;

  if (!buttonSfxAudio) {
    buttonSfxAudio = new Audio(BUTTON_SOUND_SRC);
    buttonSfxAudio.preload = 'auto';
    buttonSfxAudio.volume = 0.7;
  }

  return buttonSfxAudio;
}

function isDisabledButton(target: Element): boolean {
  if (target instanceof HTMLButtonElement) {
    return target.disabled;
  }

  return target.getAttribute('aria-disabled') === 'true';
}

function playButtonSfx(): void {
  const baseAudio = getButtonSfxAudio();
  if (!baseAudio) return;

  const clickAudio = baseAudio.cloneNode() as HTMLAudioElement;
  clickAudio.volume = baseAudio.volume;
  clickAudio.currentTime = 0;
  void clickAudio.play().catch(() => {
    // Ignore autoplay failures; the next user interaction will retry naturally.
  });
}

export function installGlobalButtonSfx(): void {
  if (buttonSfxInstalled || typeof document === 'undefined') return;
  buttonSfxInstalled = true;

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const button = target.closest(BUTTON_SELECTOR);
      if (!button || isDisabledButton(button)) return;

      playButtonSfx();
    },
    true,
  );
}
