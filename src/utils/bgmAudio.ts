type ManagedBgm = {
  audio: HTMLAudioElement | null;
  fadeFrame: number | null;
  fadeToken: number;
  shouldResume: boolean;
};

const DEFAULT_FADE_MS = 420;
const DEFAULT_VOLUME = 1;
const managedBgms = new Set<ManagedBgm>();
let listenersInstalled = false;

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return DEFAULT_VOLUME;
  return Math.max(0, Math.min(1, volume));
}

export function createManagedBgm(src: string): ManagedBgm {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    return { audio: null, fadeFrame: null, fadeToken: 0, shouldResume: false };
  }

  const audio = new Audio(src);
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = clampVolume(DEFAULT_VOLUME);

  const managed = {
    audio,
    fadeFrame: null,
    fadeToken: 0,
    shouldResume: false,
  };
  managedBgms.add(managed);
  installResumeListeners();
  return managed;
}

function installResumeListeners(): void {
  if (listenersInstalled || typeof window === 'undefined' || typeof document === 'undefined') return;
  listenersInstalled = true;

  const resumeAll = () => {
    for (const managed of managedBgms) {
      attemptResumePlayback(managed);
    }
  };

  window.addEventListener('pointerdown', resumeAll, { passive: true });
  window.addEventListener('keydown', resumeAll);
  window.addEventListener('focus', resumeAll);
  window.addEventListener('pageshow', resumeAll);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      resumeAll();
    }
  });
}

function attemptResumePlayback(managed: ManagedBgm): void {
  const audio = managed.audio;
  if (!audio || !managed.shouldResume || !audio.paused) return;

  void audio.play().catch(() => {
    // Still blocked; we will try again on the next user interaction/focus event.
  });
}

function cancelFade(managed: ManagedBgm): void {
  if (managed.fadeFrame !== null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(managed.fadeFrame);
    managed.fadeFrame = null;
  }
}

function fadeVolume(managed: ManagedBgm, targetVolume: number, durationMs: number, onDone?: () => void): void {
  const audio = managed.audio;
  if (!audio || typeof window === 'undefined') {
    onDone?.();
    return;
  }

  cancelFade(managed);
  managed.fadeToken += 1;
  const token = managed.fadeToken;
  const clampedTargetVolume = clampVolume(targetVolume);
  const startVolume = audio.volume;
  const delta = clampedTargetVolume - startVolume;

  if (durationMs <= 0 || Math.abs(delta) < 0.001) {
    audio.volume = clampedTargetVolume;
    onDone?.();
    return;
  }

  const startTime = performance.now();

  const step = (now: number) => {
    if (managed.fadeToken !== token) return;

    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / durationMs);
    audio.volume = clampVolume(startVolume + delta * progress);

    if (progress >= 1) {
      managed.fadeFrame = null;
      onDone?.();
      return;
    }

    managed.fadeFrame = window.requestAnimationFrame(step);
  };

  managed.fadeFrame = window.requestAnimationFrame(step);
}

export function playManagedBgm(managed: ManagedBgm, fadeMs = DEFAULT_FADE_MS): void {
  const audio = managed.audio;
  if (!audio) return;

  managed.shouldResume = true;
  cancelFade(managed);
  managed.fadeToken += 1;
  audio.volume = fadeMs > 0 ? 0 : clampVolume(DEFAULT_VOLUME);
  void audio.play().catch(() => {
    // Autoplay may be blocked until the user interacts with the page.
    // Global resume listeners will retry once interaction/focus happens.
  });
  fadeVolume(managed, DEFAULT_VOLUME, fadeMs);
}

export function pauseManagedBgm(managed: ManagedBgm, reset = true, fadeMs = DEFAULT_FADE_MS): void {
  const audio = managed.audio;
  if (!audio) return;

  managed.shouldResume = false;
  fadeVolume(managed, 0, fadeMs, () => {
    audio.pause();
    if (reset) {
      audio.currentTime = 0;
    }
    audio.volume = clampVolume(DEFAULT_VOLUME);
  });
}
