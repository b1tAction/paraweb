/**
 * 全局游戏状态机 - 使用 Zustand
 *
 * 管理 11 个场景状态和游戏数据
 */

import { create } from 'zustand';
import type { Session, Socket, Match } from '@heroiclabs/nakama-js';
import type {
  Player,
  Decision,
  Available,
  StateSync,
  WaitingSync,
  MiniGameStart,
  MiniGameResult,
  GameOver,
  LogEntry,
  StartGameAck,
  MapConfig,
  DefinitionsConfig,
} from '../types/protocol';
import { normalizePlayerStats } from '../game/logEntryPlayback';

// Merge new player data into existing order: preserve current order, update data, append new players at end
function mergePlayersPreservingOrder(currentPlayers: Player[], newPlayers: Player[]): Player[] {
  const currentPlayerIds = new Set(currentPlayers.map((p) => p.player_id));
  const newPlayerMap = new Map(newPlayers.map((p) => [p.player_id, p]));

  // Existing players in their current order, updated with new data
  const merged = currentPlayers
    .map((p) => newPlayerMap.get(p.player_id) ?? p);

  // Append players that joined after the initial order was established
  for (const p of newPlayers) {
    if (!currentPlayerIds.has(p.player_id)) {
      merged.push(p);
    }
  }

  return merged;
}

// ========== 场景枚举 ==========

export enum Scene {
  /** 启动页 (输入昵称) */
  Home = 'StartScene',
  /** 创建房间 */
  CreateRoom = 'CreateRoomScene',
  /** 加入房间 */
  JoinRoom = 'JoinRoomScene',
  /** 房间等待 ( Lobby ) */
  Lobby = 'LobbyScene',
  /** 小游戏提交排名 */
  MiniGameSubmitRank = 'MiniGameSubmitRankScene',
  /** 加载中 (match_init) */
  Loading = 'LoadingScene',
  /** 骰子分配展示 */
  DiceAssign = 'DiceAssignScene',
  /** 主棋盘阶段 */
  Board = 'BoardScene',
  /** Boss 战斗 */
  BossBattle = 'BossBattleScene',
  /** 游戏结束 */
  GameOver = 'GameOverScene',
}

// ========== 全局状态枚举 ==========

/** 全局状态 (Layer 1) */
export type GlobalState =
  | 'match_init'
  | 'round_mini_game'
  | 'round_prep'
  | 'turn_loop'
  | 'round_end_wait'
  | 'RoundEndWait'
  | 'boss_battle'
  | 'game_over';

/** 回合状态 (Layer 2) - 支持 snake_case 和 PascalCase 两种格式 */
export type TurnState =
  | 'turn_upkeep' | 'TurnUpkeep'
  | 'main_action' | 'MainAction'
  | 'turn_moving' | 'TurnMoving'
  | 'turn_landed' | 'TurnLanded'
  | 'turn_event' | 'TurnEvent'
  | 'turn_boss_battle' | 'TurnBossBattle'
  | 'turn_end' | 'TurnEnd'
  | '';

// ========== Zustand Store ==========

interface GameState {
  // ========== 连接实例 ==========

  /** Nakama Session */
  session: Session | null;
  /** Nakama Socket */
  socket: Socket | null;
  /** 当前 Match */
  match: Match | null;

  // ========== 状态机 ==========

  /** 当前场景 */
  currentScene: Scene;
  /** 全局状态 (Layer 1) */
  globalState: GlobalState;
  /** 回合状态 (Layer 2) */
  turnState: TurnState;

  // ========== 游戏数据 ==========

  /** 当前玩家 ID (自己的 ID) */
  myPlayerId: string;
  /** 显示名称 */
  displayName: string;
  /** 阵营选择 */
  faction: string;
  /** 所有玩家状态 */
  players: Player[];
  /** 当前回合玩家 ID */
  currentPlayerId: string;
  /** 当前轮次 */
  round: number;
  /** 当前回合索引 */
  turn: number;
  /** 决策请求 (如果有) */
  decisionRequest: Decision | null;
  /** 可用动作 (如果有) */
  availableActions: Available | null;
  /** 等待状态 (如果有) */
  waitingSync: WaitingSync | null;
  /** 小游戏结果 (如果有) */
  miniGameStart: MiniGameStart | null;
  /** 小游戏结果 (如果有) */
  miniGameResult: MiniGameResult | null;
  /** 本轮小游戏为每个玩家分配的骰子类型 */
  diceAssignments: Record<string, string>;
  /** 游戏结束信息 (如果有) */
  gameOver: GameOver | null;
  /** 开始游戏确认 (包含地图配置) */
  startGameAck: StartGameAck | null;
  /** 地图配置 (用于渲染地图) */
  mapConfig: MapConfig | null;
  /** 定义目录 (事件/增益/道具元数据，用于查表获取 name/desc) */
  definitions: DefinitionsConfig | null;
  /** 当前房间 ID */
  matchId: string;
  /** StateSync 等待队列：暂存接收到的状态，等待动画完成后再应用 */
  stateSyncQueue: StateSync[];
  /** 当前回合同步日志条目 (已播放完毕，显示在debug log中) */
  playedEntries: LogEntry[];
  /** 待播放的动画entries队列 */
  pendingEntries: LogEntry[];

  /** 小游戏结果展示等待标记 — true 时阻止场景切换 */
  miniGameResultPending: boolean;
  /** 等待切换的目标场景 (miniGameResultPending 为 true 时暂存) */
  pendingScene: Scene | null;

  // ========== 状态 Actions ==========

  /** 设置连接实例 */
  setConnection: (session: Session, socket: Socket) => void;
  /** 设置 Match */
  setMatch: (match: Match | null) => void;
  /** 设置当前玩家 ID */
  setMyPlayerId: (playerId: string) => void;
  /** 设置显示名称 */
  setDisplayName: (name: string) => void;
  /** 设置阵营 */
  setFaction: (faction: string) => void;
  /** 设置房间 ID */
  setMatchId: (id: string) => void;

  /** 设置场景 */
  setScene: (scene: Scene) => void;
  /** 更新游戏状态 (全局 + 回合) */
  updateGameState: (global: GlobalState, turn: TurnState) => void;

  /** 设置决策请求 */
  setDecisionRequest: (decision: Decision | null) => void;
  /** 设置可用动作 */
  setAvailableActions: (available: Available | null) => void;
  /** 设置等待状态 */
  setWaitingSync: (waiting: WaitingSync | null) => void;
  /** 设置小游戏结果 */
  setMiniGameStart: (start: MiniGameStart | null) => void;
  /** 设置小游戏结果 */
  setMiniGameResult: (result: MiniGameResult | null) => void;
  /** 设置本轮玩家骰子分配 */
  setDiceAssignments: (assignments: Record<string, string>) => void;
  /** 设置游戏结束 */
  setGameOver: (gameOver: GameOver | null) => void;
  /** 将增量entries追加到播放队列 */
  addPendingEntries: (entries: LogEntry[]) => void;
  /** 从队列取第一条移到已播放列表 */
  playNextEntry: () => void;
  /** 清空所有entries (新回合开始时) */
  clearAllEntries: () => void;
  /** 设置开始游戏确认 */
  setStartGameAck: (ack: StartGameAck | null) => void;
  /** 设置地图配置 */
  setMapConfig: (config: MapConfig | null) => void;
  /** 设置定义目录 */
  setDefinitions: (defs: DefinitionsConfig | null) => void;

  /** 设置小游戏结果展示等待标记 */
  setMiniGameResultPending: (pending: boolean) => void;
  /** 设置等待切换的目标场景 */
  setPendingScene: (scene: Scene | null) => void;

  /** 将 StateSync 压入等待队列 */
  enqueueStateSync: (stateSync: StateSync) => void;
  /** 将队列里的下一个 StateSync 应用于全局变量并清出队列 */
  applyNextStateSync: () => void;

  /** 更新玩家列表 */
  setPlayers: (players: Player[]) => void;
  /** 设置当前回合玩家 */
  setCurrentPlayerId: (playerId: string) => void;
  /** 设置轮次和回合 */
  setRoundTurn: (round: number, turn: number) => void;

  /** 重置状态 (用于退出游戏) */
  reset: () => void;
  /** 清空当前对局状态但保留登录态 */
  resetMatchState: () => void;
}

// ========== 创建 Store ==========

export const useGameStore = create<GameState>((set, get) => ({
  // ========== 初始状态 ==========

  session: null,
  socket: null,
  match: null,

  currentScene: Scene.Home,
  globalState: 'match_init',
  turnState: '',

  myPlayerId: '',
  players: [],
  currentPlayerId: '',
  round: 0,
  turn: 0,
  decisionRequest: null,
  availableActions: null,
  waitingSync: null,
  miniGameStart: null,
  miniGameResult: null,
  diceAssignments: {},
  gameOver: null,
  startGameAck: null,
  mapConfig: null,
  definitions: null,
  matchId: '',
  displayName: '',
  stateSyncQueue: [],
  faction: '',
  playedEntries: [],
  pendingEntries: [],
  miniGameResultPending: false,
  pendingScene: null,

  // ========== Actions ==========

  setConnection: (session, socket) => set({ session, socket }),

  setMatch: (match) => set({ match }),

  setMyPlayerId: (playerId) => set({ myPlayerId: playerId }),

  setDisplayName: (name) => set({ displayName: name }),
  setFaction: (faction) => set({ faction }),

  setMatchId: (id) => set({ matchId: id }),

  setScene: (scene) => set({ currentScene: scene }),

  updateGameState: (global, turn) =>
    set({ globalState: global, turnState: turn }),

  setDecisionRequest: (decision) => set({ decisionRequest: decision }),

  setAvailableActions: (available) => set({ availableActions: available }),

  setWaitingSync: (waiting) => {
    const currentPlayers = get().players;
    if (waiting && currentPlayers.length > 0) {
      // Sync faction from WaitingSync to players array so
      // faction changes in the lobby are reflected immediately.
      const updatedPlayers = currentPlayers.map((player) => {
        const waitingPlayer = waiting.players.find((wp) => wp.user_id === player.player_id);
        if (waitingPlayer && waitingPlayer.faction && waitingPlayer.faction !== player.faction) {
          return { ...player, faction: waitingPlayer.faction };
        }
        return player;
      });
      set({ waitingSync: waiting, players: updatedPlayers });
    } else {
      set({ waitingSync: waiting });
    }
  },

  setMiniGameStart: (start) => set({ miniGameStart: start }),

  setMiniGameResult: (result) => set({ miniGameResult: result }),
  setDiceAssignments: (assignments) => set({ diceAssignments: assignments }),

  setGameOver: (gameOver) => set({ gameOver }),

  addPendingEntries: (entries) => set((state) => ({ pendingEntries: [...state.pendingEntries, ...entries] })),
  playNextEntry: () => set((state) => {
    if (state.pendingEntries.length === 0) return state;
    const [first, ...rest] = state.pendingEntries;
    return { pendingEntries: rest, playedEntries: [...state.playedEntries, first] };
  }),
  clearAllEntries: () => set({ playedEntries: [], pendingEntries: [] }),
  setStartGameAck: (ack) => set({ startGameAck: ack }),

  setMapConfig: (config) => set({ mapConfig: config }),
  setDefinitions: (defs) => set({ definitions: defs }),

  setMiniGameResultPending: (pending) => set({ miniGameResultPending: pending }),
  setPendingScene: (scene) => set({ pendingScene: scene }),

  enqueueStateSync: (stateSync) => set((state) => ({ stateSyncQueue: [...state.stateSyncQueue, stateSync] })),
  
  applyNextStateSync: () => set((state) => {
    if (state.stateSyncQueue.length === 0) return state;
    
    // 取出最早的一个 StateSync
    const [nextSync, ...restQueue] = state.stateSyncQueue;
    
    // 我们将其应用到当前状态，并将相关 entries 转入 pendingEntries 开始动画播放
    const newPendingEntries = nextSync.entries && nextSync.entries.length > 0 
      ? [...state.pendingEntries, ...nextSync.entries] 
      : state.pendingEntries;

    // Preserve existing player order when syncing, append new players at end
    const nextPlayersRaw = nextSync.players?.map(normalizePlayerStats);
    const mergedPlayers = nextPlayersRaw
      ? mergePlayersPreservingOrder(state.players, nextPlayersRaw)
      : state.players;

    return {
      stateSyncQueue: restQueue,
      globalState: nextSync.global_state as GlobalState,
      turnState: nextSync.turn_state as TurnState,
      players: mergedPlayers,
      currentPlayerId: nextSync.current_player_id,
      round: nextSync.round ?? state.round,
      turn: nextSync.turn ?? state.turn,
      pendingEntries: newPendingEntries
    };
  }),

  setPlayers: (players) => set({ players: players.map(normalizePlayerStats) }),

  setCurrentPlayerId: (playerId) => set({ currentPlayerId: playerId }),
  setRoundTurn: (round, turn) => set({ round, turn }),

  reset: () =>
    set({
      session: null,
      socket: null,
      match: null,
      currentScene: Scene.Home,
      globalState: 'match_init',
      turnState: '',
      myPlayerId: '',
      displayName: '',
      faction: '',
      matchId: '',
      players: [],
      currentPlayerId: '',
      round: 0,
      turn: 0,
      decisionRequest: null,
      availableActions: null,
      waitingSync: null,
      stateSyncQueue: [],
      miniGameStart: null,
      miniGameResult: null,
      diceAssignments: {},
      gameOver: null,
      playedEntries: [],
      pendingEntries: [],
      startGameAck: null,
      mapConfig: null,
      definitions: null,
      miniGameResultPending: false,
      pendingScene: null,
    }),

  resetMatchState: () =>
    set((state) => ({
      match: null,
      currentScene: Scene.Home,
      globalState: 'match_init',
      turnState: '',
      matchId: '',
      players: [],
      currentPlayerId: '',
      round: 0,
      turn: 0,
      decisionRequest: null,
      availableActions: null,
      waitingSync: null,
      stateSyncQueue: [],
      miniGameStart: null,
      miniGameResult: null,
      diceAssignments: {},
      gameOver: null,
      playedEntries: [],
      pendingEntries: [],
      startGameAck: null,
      mapConfig: null,
      definitions: null,
      miniGameResultPending: false,
      pendingScene: null,
      faction: state.faction,
    })),
}));

export default useGameStore;
