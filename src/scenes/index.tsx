/**
 * Scene component exports.
 *
 * HomeScene is eager because it is the first screen after the bootstrap
 * preload gate. Other scenes stay lazy-loaded for code splitting.
 */

import React from 'react';
import { HomeScene } from './HomeScene';

export { HomeScene };
export const CreateRoomScene = React.lazy(() =>
  import('./CreateRoomScene').then((m) => ({ default: m.CreateRoomScene })),
);
export const JoinRoomScene = React.lazy(() => import('./JoinRoomScene').then((m) => ({ default: m.JoinRoomScene })));
export const FactionSelectScene = React.lazy(() =>
  import('./FactionSelectScene').then((m) => ({ default: m.FactionSelectScene })),
);
export const LobbyScene = React.lazy(() => import('./LobbyScene').then((m) => ({ default: m.LobbyScene })));
export const BoardScene = React.lazy(() => import('./BoardScene').then((m) => ({ default: m.BoardScene })));
export const GameOverScene = React.lazy(() => import('./GameOverScene').then((m) => ({ default: m.GameOverScene })));
export const MiniGameSubmitRankScene = React.lazy(() =>
  import('./minigame').then((m) => ({ default: m.MiniGameSubmitRankScene })),
);
export const MiniGameBoardScene = React.lazy(() =>
  import('./minigame/MiniGameBoard').then((m) => ({ default: m.MiniGameBoardScene })),
);
