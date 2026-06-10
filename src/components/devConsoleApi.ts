/**
 * devConsoleApi - Register debug helpers on window for Console access
 *
 * Only loaded in DEV mode. Attaches gameStore and helper functions
 * to window.__* namespace so developers can inspect and manipulate
 * game state directly from the browser Console.
 *
 * Usage in Console:
 *   window.__gameStore.getState()      — read full game state
 *   window.__scenes                    — Scene enum reference
 *   window.__devJumpToScene('...')     — jump to any Scene by name
 *   window.__devInjectGameOver()       — inject GameOver mock + jump
 *   window.__devInjectBoard()          — inject Board mock + jump
 *   window.__devInjectMiniGame()       — inject MiniGame mock + jump
 *   window.__devReset()                — reset match state
 */

import { Scene, useGameStore } from '../store/gameStore';
import { addItemToPlayer, injectBoard, injectGameOver, injectMiniGame, useItemDev } from './devMockData';

// Type declarations for window augmentation
declare global {
  interface Window {
    __gameStore: typeof useGameStore;
    __scenes: typeof Scene;
    __devJumpToScene: (scene: string) => void;
    __devInjectGameOver: () => void;
    __devInjectBoard: () => void;
    __devInjectMiniGame: () => void;
    __devAddItemToPlayer: (itemType: string, targetPlayerId?: string) => void;
    __devUseItem: (itemId: string, targetId?: string) => void;
    __devReset: () => void;
  }
}

window.__gameStore = useGameStore;
window.__scenes = Scene;
window.__devJumpToScene = (scene: string) => {
  useGameStore.getState().setScene(scene as Scene);
};
window.__devInjectGameOver = injectGameOver;
window.__devInjectBoard = injectBoard;
window.__devInjectMiniGame = injectMiniGame;
window.__devAddItemToPlayer = addItemToPlayer;
window.__devUseItem = useItemDev;
window.__devReset = () => {
  useGameStore.getState().resetMatchState();
};

console.log(
  '[DevPanel] Console API registered. Available commands:\n' +
  '  window.__gameStore.getState()     — read game state\n' +
  '  window.__scenes                   — Scene enum\n' +
  '  window.__devJumpToScene(scene)    — jump to Scene\n' +
  '  window.__devInjectGameOver()      — inject GameOver mock\n' +
  '  window.__devInjectBoard()         — inject Board mock\n' +
  '  window.__devInjectMiniGame()      — inject MiniGame mock\n' +
  '  window.__devAddItemToPlayer(type, playerId?) — add item to player\n' +
  '  window.__devUseItem(itemId, targetId?)    — use item with animation\n' +
  '  window.__devReset()               — reset match state',
);