import * as Phaser from 'phaser';
import { worldDepth } from './renderLayers';

/**
 * AnimationOrchestrator manages screen-fixed object creation,
 * automatic cleanup, and world-depth computation for the board scene.
 */
export class AnimationOrchestrator {
  private scene: Phaser.Scene;
  private activeObjects = new Set<Phaser.GameObjects.GameObject>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Create a screen-fixed game object at the given depth.
   * Converts world coordinates to screen coordinates by subtracting camera scroll.
   * Sets scrollFactor(0) so the object stays fixed on screen.
   */
  createScreenFixedObject<T extends Phaser.GameObjects.GameObject & { setScrollFactor: (f: number) => T; setDepth: (d: number) => T }>(
    worldX: number,
    worldY: number,
    layer: number,
    factory: (screenX: number, screenY: number) => T
  ): T {
    const cam = this.scene.cameras.main;
    // Convert world coordinates to screen coordinates by subtracting camera scroll
    const screenX = worldX - cam.scrollX;
    const screenY = worldY - cam.scrollY;

    const obj = factory(screenX, screenY);
    obj.setScrollFactor(0);
    obj.setDepth(layer);

    this.activeObjects.add(obj);
    obj.once('destroy', () => this.activeObjects.delete(obj));

    return obj;
  }

  /**
   * Create a screen-positioned game object at a fixed screen pixel location.
   * Correctly accounts for camera zoom so the object appears at the exact
   * screen pixel coordinates regardless of zoom level.
   * Sets scrollFactor(0) so the object stays fixed on screen.
   */
  createScreenPositionedObject<T extends Phaser.GameObjects.GameObject & { setScrollFactor: (f: number) => T; setDepth: (d: number) => T }>(
    screenPixelX: number,
    screenPixelY: number,
    layer: number,
    factory: (worldX: number, worldY: number) => T
  ): T {
    const cam = this.scene.cameras.main;
    // Convert screen pixel position to world position accounting for zoom.
    // Include camera scroll so the resulting world coordinates map
    // to the requested screen pixel position even when the camera
    // has been panned. Formula: screenPixel = (world - scroll) * zoom
    // => world = scroll + screenPixel / zoom
    const worldX = cam.scrollX + screenPixelX / (cam.zoom || 1);
    const worldY = cam.scrollY + screenPixelY / (cam.zoom || 1);

    const obj = factory(worldX, worldY);
    obj.setScrollFactor(0);
    obj.setDepth(layer);

    this.activeObjects.add(obj);
    obj.once('destroy', () => this.activeObjects.delete(obj));

    return obj;
  }

  /**
   * Auto-destroy a sprite after its animation completes.
   */
  registerCleanupOnAnimationComplete(obj: Phaser.GameObjects.Sprite): void {
    this.activeObjects.add(obj);
    obj.once('animationcomplete', () => {
      obj.destroy();
      this.activeObjects.delete(obj);
    });
    obj.once('destroy', () => this.activeObjects.delete(obj));
  }

  /**
   * Auto-destroy a game object after a given delay (in milliseconds).
   */
  registerCleanupOnTimer(obj: Phaser.GameObjects.GameObject, delayMs: number): void {
    this.activeObjects.add(obj);
    this.scene.time.delayedCall(delayMs, () => {
      if (obj.active) {
        obj.destroy();
      }
      this.activeObjects.delete(obj);
    });
    obj.once('destroy', () => this.activeObjects.delete(obj));
  }

  /**
   * Compute world-sorted depth for a given layer base and Y position.
   */
  getWorldDepth(layerBase: number, worldY: number): number {
    return worldDepth(layerBase, worldY);
  }

  /**
   * Destroy all tracked active objects. Used for scene cleanup.
   */
  cancelAll(): void {
    for (const obj of this.activeObjects) {
      if (obj.active) {
        obj.destroy();
      }
    }
    this.activeObjects.clear();
  }
}