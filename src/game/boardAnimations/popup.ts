import type * as Phaser from 'phaser';
import type { AnimationOrchestrator } from '../animationOrchestrator';
import { GAME_FONT_FAMILY } from '../boardConstants';
import { LAYER_POPUP_BG, LAYER_POPUP_TEXT } from '../renderLayers';

const EVENT_POPUP_FRAME_KEY = 'event-popup-frame';
const PANEL_WIDTH = 600;
const PANEL_HEIGHT = 500;
const PANEL_HORIZONTAL_PADDING = 92;
const EVENT_POPUP_TEXT_COLOR = '#2b1d0e';
const EVENT_POPUP_STROKE_COLOR = '#f8e7b5';
const EVENT_POPUP_SHADOW_COLOR = '#8a6a35';
const EVENT_POPUP_FONT_FAMILY = 'Zpix, monospace';

export type PopupContext = {
  scene: Phaser.Scene;
  orchestrator: AnimationOrchestrator;
  tweens: Phaser.Tweens.TweenManager;
};

type ActivePopupState = {
  panel: Phaser.GameObjects.Image | null;
  text: Phaser.GameObjects.Text | null;
  resolver: (() => void) | null;
};

const activePopupsByScene = new WeakMap<Phaser.Scene, ActivePopupState>();

function getPopupState(scene: Phaser.Scene): ActivePopupState {
  let state = activePopupsByScene.get(scene);
  if (!state) {
    state = { panel: null, text: null, resolver: null };
    activePopupsByScene.set(scene, state);
  }
  return state;
}

function maybeDeletePopupState(scene: Phaser.Scene, state: ActivePopupState): void {
  if (!state.panel && !state.text && !state.resolver) {
    activePopupsByScene.delete(scene);
  }
}

/**
 * Show a center popup with the event name, splitting background and text
 * into separate depth layers so fullscreen effects can render between them.
 * Returns a Promise that resolves when the popup has fully dismissed.
 */
export function showCenterPopup(
  ctx: PopupContext,
  eventName: string,
  _textColor: string,
  iconEmoji?: string,
  duration: number = 2500,
): Promise<void> {
  // Close existing popup if any (also resolves any pending promise)
  closeCenterPopup(ctx);

  let resolveFunc!: () => void;
  const popupPromise = new Promise<void>((resolve) => {
    resolveFunc = resolve;
  });

  const cam = ctx.scene.cameras.main;
  // Use stable screen pixel coordinates for center positioning.
  // This avoids the zoom-offset and lerp-desync issues that occur when
  // using cam.centerX (world-space) with createScreenFixedObject.
  const screenCenterX = cam.width / 2;
  const screenCenterY = cam.height / 2;

  const textFontSize = 28 / (cam.zoom || 1);
  const displayText = iconEmoji ? `${iconEmoji} ${eventName}` : eventName;
  const panelWidth = PANEL_WIDTH;
  const panelHeight = PANEL_HEIGHT;
  const wordWrapWidthPx = panelWidth - PANEL_HORIZONTAL_PADDING * 2;
  const wordWrapWidth = wordWrapWidthPx / (cam.zoom || 1);

  // Convert pixel dimensions to world units so shapes/text render
  // at stable screen pixel sizes regardless of camera zoom.
  const worldPanelWidth = panelWidth / (cam.zoom || 1);
  const worldPanelHeight = panelHeight / (cam.zoom || 1);

  // Background panel at LAYER_POPUP_BG
  const panel = ctx.orchestrator.createScreenPositionedObject(screenCenterX, screenCenterY, LAYER_POPUP_BG, (wx, wy) =>
    ctx.scene.add.image(wx, wy, EVENT_POPUP_FRAME_KEY),
  );
  const targetScaleX = worldPanelWidth / panel.width;
  const targetScaleY = worldPanelHeight / panel.height;
  panel.setOrigin(0.5, 0.5);
  panel.setAlpha(0);
  panel.setScale(targetScaleX * 0.85, targetScaleY * 0.85);

  // Text at LAYER_POPUP_TEXT (always readable, above effects)
  const text = ctx.orchestrator.createScreenPositionedObject(screenCenterX, screenCenterY, LAYER_POPUP_TEXT, (wx, wy) =>
    ctx.scene.add.text(wx, wy, displayText, {
      fontFamily: EVENT_POPUP_FONT_FAMILY || GAME_FONT_FAMILY,
      fontSize: `${textFontSize}px`,
      fontStyle: 'normal',
      color: EVENT_POPUP_TEXT_COLOR,
      align: 'center',
      wordWrap: { width: wordWrapWidth },
      stroke: EVENT_POPUP_STROKE_COLOR,
      strokeThickness: 4 / (cam.zoom || 1),
      shadow: {
        offsetX: 2 / (cam.zoom || 1),
        offsetY: 2 / (cam.zoom || 1),
        color: EVENT_POPUP_SHADOW_COLOR,
        blur: 0,
        fill: true,
      },
    }),
  );
  text.setOrigin(0.5, 0.5);
  text.setWordWrapWidth(wordWrapWidth, true);
  text.setLineSpacing(8 / (cam.zoom || 1));
  text.setAlpha(0);
  text.setScale(0.5);

  const state = getPopupState(ctx.scene);
  state.panel = panel;
  state.text = text;
  state.resolver = resolveFunc;

  // Entrance animation for both elements
  ctx.tweens.add({
    targets: panel,
    alpha: { from: 0, to: 1 },
    scaleX: { from: targetScaleX * 0.85, to: targetScaleX },
    scaleY: { from: targetScaleY * 0.85, to: targetScaleY },
    duration: 400,
    ease: 'Back.easeOut',
  });

  ctx.tweens.add({
    targets: text,
    alpha: { from: 0, to: 1 },
    scale: { from: 0.5, to: 1 },
    duration: 400,
    ease: 'Back.easeOut',
  });

  // Exit animation for both elements
  ctx.tweens.add({
    targets: panel,
    alpha: { from: 1, to: 0 },
    scaleX: { from: targetScaleX, to: targetScaleX * 0.92 },
    scaleY: { from: targetScaleY, to: targetScaleY * 0.92 },
    delay: duration - 400,
    duration: 400,
    ease: 'Power2.easeIn',
    onComplete: () => {
      const currentState = activePopupsByScene.get(ctx.scene);
      panel.destroy();
      if (currentState?.panel === panel) {
        currentState.panel = null;
      }
      // Resolve the popup promise once the panel has fully dismissed
      if (currentState?.resolver === resolveFunc) {
        currentState.resolver();
        currentState.resolver = null;
      }
      if (currentState) {
        maybeDeletePopupState(ctx.scene, currentState);
      }
    },
  });

  ctx.tweens.add({
    targets: text,
    alpha: { from: 1, to: 0 },
    scale: { from: 1, to: 0.8 },
    delay: duration - 400,
    duration: 400,
    ease: 'Power2.easeIn',
    onComplete: () => {
      const currentState = activePopupsByScene.get(ctx.scene);
      text.destroy();
      if (currentState?.text === text) {
        currentState.text = null;
      }
      if (currentState) {
        maybeDeletePopupState(ctx.scene, currentState);
      }
    },
  });

  return popupPromise;
}

/**
 * Close the current popup if one is active.
 * Also resolves any pending popup promise so awaiters don't hang.
 */
export function closeCenterPopup(ctx: PopupContext): void {
  const state = activePopupsByScene.get(ctx.scene);
  if (!state) {
    return;
  }

  if (state.panel) {
    ctx.tweens.killTweensOf(state.panel);
    state.panel.destroy();
    state.panel = null;
  }
  if (state.text) {
    ctx.tweens.killTweensOf(state.text);
    state.text.destroy();
    state.text = null;
  }

  // Resolve the pending promise so awaiters don't hang
  if (state.resolver) {
    state.resolver();
    state.resolver = null;
  }

  activePopupsByScene.delete(ctx.scene);
}
