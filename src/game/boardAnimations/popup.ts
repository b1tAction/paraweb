import * as Phaser from 'phaser';
import { AnimationOrchestrator } from '../animationOrchestrator';
import { LAYER_POPUP_BG, LAYER_POPUP_TEXT } from '../renderLayers';
import { GAME_FONT_FAMILY } from '../boardConstants';

export type PopupContext = {
  scene: Phaser.Scene;
  orchestrator: AnimationOrchestrator;
  tweens: Phaser.Tweens.TweenManager;
};

// Track the active popup elements for cleanup
let activePopupPanel: Phaser.GameObjects.Rectangle | null = null;
let activePopupText: Phaser.GameObjects.Text | null = null;

/**
 * Show a center popup with the event name, splitting background and text
 * into separate depth layers so fullscreen effects can render between them.
 */
export function showCenterPopup(
  ctx: PopupContext,
  eventName: string,
  textColor: string,
  iconEmoji?: string,
  duration: number = 2500
): void {
  // Close existing popup if any
  closeCenterPopup(ctx);

  const cam = ctx.scene.cameras.main;
  const screenCenterX = cam.centerX;
  const screenCenterY = cam.centerY;

  const panelWidth = 400;
  const panelHeight = 150;

  // Background panel at LAYER_POPUP_BG
  const panel = ctx.orchestrator.createScreenFixedObject(
    screenCenterX, screenCenterY,
    LAYER_POPUP_BG,
    (sx, sy) => ctx.scene.add.rectangle(sx, sy, panelWidth, panelHeight, 0x0b1020, 0.85) as Phaser.GameObjects.Rectangle & { setScrollFactor: (f: number) => any; setDepth: (d: number) => any }
  );
  panel.setStrokeStyle(3, 0xffffff, 0.8);
  panel.setOrigin(0.5, 0.5);
  panel.setAlpha(0);
  panel.setScale(0.5);

  // Text at LAYER_POPUP_TEXT (always readable, above effects)
  const displayText = iconEmoji ? `${iconEmoji} ${eventName}` : eventName;
  const text = ctx.orchestrator.createScreenFixedObject(
    screenCenterX, screenCenterY,
    LAYER_POPUP_TEXT,
    (sx, sy) => ctx.scene.add.text(sx, sy, displayText, {
      fontFamily: GAME_FONT_FAMILY,
      fontSize: '28px',
      fontStyle: 'bold',
      color: textColor,
      align: 'center',
      wordWrap: { width: 320 },
    }) as Phaser.GameObjects.Text & { setScrollFactor: (f: number) => any; setDepth: (d: number) => any }
  );
  text.setOrigin(0.5, 0.5);
  text.setAlpha(0);
  text.setScale(0.5);

  activePopupPanel = panel;
  activePopupText = text;

  // Entrance animation for both elements
  ctx.tweens.add({
    targets: panel,
    alpha: { from: 0, to: 1 },
    scale: { from: 0.5, to: 1 },
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
    scale: { from: 1, to: 0.8 },
    delay: duration - 400,
    duration: 400,
    ease: 'Power2.easeIn',
    onComplete: () => {
      panel.destroy();
      if (activePopupPanel === panel) activePopupPanel = null;
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
      text.destroy();
      if (activePopupText === text) activePopupText = null;
    },
  });
}

/**
 * Close the current popup if one is active.
 */
export function closeCenterPopup(ctx: PopupContext): void {
  if (activePopupPanel) {
    ctx.tweens.killTweensOf(activePopupPanel);
    activePopupPanel.destroy();
    activePopupPanel = null;
  }
  if (activePopupText) {
    ctx.tweens.killTweensOf(activePopupText);
    activePopupText.destroy();
    activePopupText = null;
  }
}