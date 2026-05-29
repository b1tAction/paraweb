export const MINI_GAME_BOARD_GAME_TYPES = [
  'dice_race',
  'count_seconds',
  'math_calc',
  'rainbow_memory',
  'vernier',
  'dilemma_race',
  'trust_dilemma',
  'cake_cutting',
  'typing_speed',
] as const;

export type MiniGameBoardGameType = (typeof MINI_GAME_BOARD_GAME_TYPES)[number];

export interface MiniGameBoardStatusEntry {
  id: number;
  message: string;
}

export interface MiniGameBoardDevSnapshot {
  isMounted: boolean;
  selectedGameType: MiniGameBoardGameType;
  matchId: string;
  connectionLabel: string;
  isConnecting: boolean;
  isCreatingRoom: boolean;
  isTriggering: boolean;
  canCreateRoom: boolean;
  canTriggerMiniGame: boolean;
  statusLog: MiniGameBoardStatusEntry[];
}

interface MiniGameBoardActions {
  connectAll: () => Promise<void>;
  createAndJoin: () => Promise<void>;
  triggerMiniGame: () => Promise<void>;
  setGameType: (gameType: MiniGameBoardGameType) => void;
}

const initialSnapshot: MiniGameBoardDevSnapshot = {
  isMounted: false,
  selectedGameType: 'dice_race',
  matchId: '',
  connectionLabel: 'not mounted',
  isConnecting: false,
  isCreatingRoom: false,
  isTriggering: false,
  canCreateRoom: false,
  canTriggerMiniGame: false,
  statusLog: [],
};

const listeners = new Set<() => void>();
let snapshot = initialSnapshot;
let actions: MiniGameBoardActions | null = null;

function emitChange() {
  listeners.forEach((listener) => {
    listener();
  });
}

function publish(nextSnapshot: MiniGameBoardDevSnapshot) {
  snapshot = nextSnapshot;
  emitChange();
}

export const miniGameBoardDevControls = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot() {
    return snapshot;
  },

  attach(nextActions: MiniGameBoardActions) {
    actions = nextActions;

    return () => {
      if (actions !== nextActions) return;

      actions = null;
      publish(initialSnapshot);
    };
  },

  publish(nextSnapshot: Omit<MiniGameBoardDevSnapshot, 'isMounted'>) {
    publish({ ...nextSnapshot, isMounted: true });
  },

  async connectAll() {
    await actions?.connectAll();
  },

  async createAndJoin() {
    await actions?.createAndJoin();
  },

  async triggerMiniGame() {
    await actions?.triggerMiniGame();
  },

  setGameType(gameType: MiniGameBoardGameType) {
    actions?.setGameType(gameType);
  },
};
