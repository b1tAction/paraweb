/**
 * Scene component exports - lazy loaded for code splitting.
 *
 * Each scene is loaded via React.lazy() so that its code (and CSS
 * background-image references) are only fetched when the scene is
 * actually rendered. This reduces the initial bundle size and
 * prevents large images like cover.png from being referenced at
 * startup.
 */

import React from 'react';

export const HomeScene = React.lazy(() => import('./HomeScene').then((m) => ({ default: m.HomeScene })));
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
