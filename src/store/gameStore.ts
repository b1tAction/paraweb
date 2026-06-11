/**
 * 全局游戏状态机 - 使用 Zustand
 *
 * 管理 11 个场景状态和游戏数据
 */

import type { Match, Session, Socket } from '@heroiclabs/nakama-js';
import { create } from 'zustand';
import { normalizePlayerStats } from '../game/logEntryPlayback';
import type {
  Available,
  Decision,
  DefinitionsConfig,
  GameOver,
  LogEntry,
  MapConfig,
  MiniGameResult,
  MiniGameStart,
  Player,
  StartGameAck,
  StateSync,
  WaitingSync,
} from '../types/protocol';

// Merge new player data into existing order: preserve current order, update data, append new players at end
function mergePlayersPreservingOrder(currentPlayers: Player[], newPlayers: Player[]): Player[] {
  const currentPlayerIds = new Set(currentPlayers.map((p) => p.player_id));
  const newPlayerMap = new Map(newPlayers.map((p) => [p.player_id, p]));

  // Existing players in their current order, updated with new data
  const merged = currentPlayers.map((p) => newPlayerMap.get(p.player_id) ?? p);

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
  /** 选择阵营 */
  FactionSelect = 'FactionSelectScene',
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
  /** 小游戏四象限调试面板 (DEV only) */
  MiniGameBoard = 'MiniGameBoardScene',
}

// ========== 全局状态枚举 ==========

/** 全局状态 (Layer 1) */
export type GlobalState =
  | 'match_init'
  | 'WaitingForHost'
  | 'round_mini_game'
  | 'round_prep'
  | 'turn_loop'
  | 'round_end_wait'
  | 'RoundEndWait'
  | 'boss_battle'
  | 'game_over';

/** 回合状态 (Layer 2) - 支持 snake_case 和 PascalCase 两种格式 */
export type TurnState =
  | 'turn_upkeep'
  | 'TurnUpkeep'
  | 'main_action'
  | 'MainAction'
  | 'turn_moving'
  | 'TurnMoving'
  | 'turn_landed'
  | 'TurnLanded'
  | 'turn_event'
  | 'TurnEvent'
  | 'turn_boss_battle'
  | 'TurnBossBattle'
  | 'turn_end'
  | 'TurnEnd'
  | '';

export type PendingRoomAction =
  | {
      type: 'join';
      matchId: string;
    }
  | {
      type: 'create';
      lobbyName: string;
      maxPlayers: number;
    };

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
  /** 游戏结束动画是否完成 */
  gameOverAnimationComplete: boolean;
  /** 开始游戏确认 (包含地图配置) */
  startGameAck: StartGameAck | null;
  /** 地图配置 (用于渲染地图) */
  mapConfig: MapConfig | null;
  /** 定义目录 (事件/增益/道具元数据，用于查表获取 name/desc) */
  definitions: DefinitionsConfig | null;
  /** 当前房间 ID */
  matchId: string;
  /** 加入房间页提示 */
  joinRoomNotice: string;
  /** 等待阵营选择确认后的房间动作 */
  pendingRoomAction: PendingRoomAction | null;
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
  /** 当前小游戏是否为在线模式 (connection != null) */
  miniGameOnline: boolean;
  /** 本局是否已经展示过小游戏新手引导 */
  miniGameGuideSeen: boolean;
  /** 本局是否已经展示过道具行动引导 */
  itemActionGuideSeen: boolean;
  /** 本局是否已经展示过阵营技能行动引导 */
  skillActionGuideSeen: boolean;
  /** 本局是否已经展示过经过检查点引导 */
  checkpointDrawGuideSeen: boolean;
  /** 本局是否已经展示过退回检查点引导 */
  checkpointRespawnGuideSeen: boolean;
  /** 本局是否已经展示过首次 Buff 引导 */
  buffGuideSeen: boolean;
  /** 本局是否已经展示过首次 HP 变化引导 */
  hpGuideSeen: boolean;
  /** 本局是否已经展示过首次 LP 变化引导 */
  lpGuideSeen: boolean;
  /** 本局已展示过首次获得说明的道具范围 key */
  seenItemDescriptionTypes: string[];
  /** 本局已展示过首次获得说明的 Buff 类型 */
  seenBuffDescriptionTypes: string[];
  /** Colyseus 连接错误信息 */
  colyseusError: string;

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
  /** 设置加入房间页提示 */
  setJoinRoomNotice: (notice: string) => void;
  /** 设置等待阵营选择确认后的房间动作 */
  setPendingRoomAction: (action: PendingRoomAction | null) => void;

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
  /** 设置游戏结束动画完成状态 */
  setGameOverAnimationComplete: (complete: boolean) => void;
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
  /** 设置小游戏是否为在线模式 */
  setMiniGameOnline: (online: boolean) => void;
  /** 设置小游戏新手引导是否已展示 */
  setMiniGameGuideSeen: (seen: boolean) => void;
  /** 设置道具行动引导是否已展示 */
  setItemActionGuideSeen: (seen: boolean) => void;
  /** 设置阵营技能行动引导是否已展示 */
  setSkillActionGuideSeen: (seen: boolean) => void;
  /** 设置经过检查点引导是否已展示 */
  setCheckpointDrawGuideSeen: (seen: boolean) => void;
  /** 设置退回检查点引导是否已展示 */
  setCheckpointRespawnGuideSeen: (seen: boolean) => void;
  /** 设置首次 Buff 引导是否已展示 */
  setBuffGuideSeen: (seen: boolean) => void;
  /** 设置首次 HP 变化引导是否已展示 */
  setHpGuideSeen: (seen: boolean) => void;
  /** 设置首次 LP 变化引导是否已展示 */
  setLpGuideSeen: (seen: boolean) => void;
  /** 标记某个道具说明范围已展示 */
  markItemDescriptionSeen: (seenKey: string) => void;
  /** 标记某个 Buff 说明已展示 */
  markBuffDescriptionSeen: (buffType: string) => void;
  /** 设置 Colyseus 连接错误 */
  setColyseusError: (error: string) => void;

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
  gameOverAnimationComplete: false,
  startGameAck: null,
  mapConfig: null,
  definitions: null,
  matchId: '',
  joinRoomNotice: '',
  pendingRoomAction: null,
  displayName: '',
  stateSyncQueue: [],
  faction: '',
  playedEntries: [],
  pendingEntries: [],
  miniGameResultPending: false,
  pendingScene: null,
  miniGameOnline: false,
  miniGameGuideSeen: false,
  itemActionGuideSeen: false,
  skillActionGuideSeen: false,
  checkpointDrawGuideSeen: false,
  checkpointRespawnGuideSeen: false,
  buffGuideSeen: false,
  hpGuideSeen: false,
  lpGuideSeen: false,
  seenItemDescriptionTypes: [],
  seenBuffDescriptionTypes: [],
  colyseusError: '',

  // ========== Actions ==========

  setConnection: (session, socket) => set({ session, socket }),

  setMatch: (match) => set({ match }),

  setMyPlayerId: (playerId) => set({ myPlayerId: playerId }),

  setDisplayName: (name) => set({ displayName: name }),
  setFaction: (faction) => set({ faction }),

  setMatchId: (id) => set({ matchId: id }),
  setJoinRoomNotice: (notice) => set({ joinRoomNotice: notice }),
  setPendingRoomAction: (action) => set({ pendingRoomAction: action }),

  setScene: (scene) => set({ currentScene: scene }),

  updateGameState: (global, turn) => set({ globalState: global, turnState: turn }),

  setDecisionRequest: (decision) => set({ decisionRequest: decision }),

  setAvailableActions: (available) => set({ availableActions: available }),

  setWaitingSync: (waiting) => {
    const currentPlayers = get().players;
    if (waiting && currentPlayers.length > 0) {
      // Sync faction from WaitingSync to players array so
      // faction changes in the lobby are reflected immediately.
      const updatedPlayers = currentPlayers.map((player) => {
        const waitingPlayer = waiting.players.find((wp) => wp.user_id === player.player_id);
        if (waitingPlayer?.faction && waitingPlayer.faction !== player.faction) {
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
  setGameOverAnimationComplete: (complete) => set({ gameOverAnimationComplete: complete }),

  addPendingEntries: (entries) => set((state) => ({ pendingEntries: [...state.pendingEntries, ...entries] })),
  playNextEntry: () =>
    set((state) => {
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
  setMiniGameOnline: (online) => set({ miniGameOnline: online }),
  setMiniGameGuideSeen: (seen) => set({ miniGameGuideSeen: seen }),
  setItemActionGuideSeen: (seen) => set({ itemActionGuideSeen: seen }),
  setSkillActionGuideSeen: (seen) => set({ skillActionGuideSeen: seen }),
  setCheckpointDrawGuideSeen: (seen) => set({ checkpointDrawGuideSeen: seen }),
  setCheckpointRespawnGuideSeen: (seen) => set({ checkpointRespawnGuideSeen: seen }),
  setBuffGuideSeen: (seen) => set({ buffGuideSeen: seen }),
  setHpGuideSeen: (seen) => set({ hpGuideSeen: seen }),
  setLpGuideSeen: (seen) => set({ lpGuideSeen: seen }),
  markItemDescriptionSeen: (seenKey) =>
    set((state) =>
      state.seenItemDescriptionTypes.includes(seenKey)
        ? state
        : { seenItemDescriptionTypes: [...state.seenItemDescriptionTypes, seenKey] },
    ),
  markBuffDescriptionSeen: (buffType) =>
    set((state) =>
      state.seenBuffDescriptionTypes.includes(buffType)
        ? state
        : { seenBuffDescriptionTypes: [...state.seenBuffDescriptionTypes, buffType] },
    ),
  setColyseusError: (error) => set({ colyseusError: error }),

  enqueueStateSync: (stateSync) => set((state) => ({ stateSyncQueue: [...state.stateSyncQueue, stateSync] })),

  applyNextStateSync: () =>
    set((state) => {
      if (state.stateSyncQueue.length === 0) return state;

      // 取出最早的一个 StateSync
      const [nextSync, ...restQueue] = state.stateSyncQueue;

      // 我们将其应用到当前状态，并将相关 entries 转入 pendingEntries 开始动画播放
      const newPendingEntries =
        nextSync.entries && nextSync.entries.length > 0
          ? [...state.pendingEntries, ...nextSync.entries]
          : state.pendingEntries;

      // Preserve existing player order when syncing, append new players at end
      const nextPlayersRaw = nextSync.players?.map(normalizePlayerStats);
      const mergedPlayers = nextPlayersRaw ? mergePlayersPreservingOrder(state.players, nextPlayersRaw) : state.players;

      return {
        stateSyncQueue: restQueue,
        globalState: nextSync.global_state as GlobalState,
        turnState: nextSync.turn_state as TurnState,
        players: mergedPlayers,
        currentPlayerId: nextSync.current_player_id,
        round: nextSync.round ?? state.round,
        turn: nextSync.turn ?? state.turn,
        pendingEntries: newPendingEntries,
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
      joinRoomNotice: '',
      pendingRoomAction: null,
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
      gameOverAnimationComplete: false,
      playedEntries: [],
      pendingEntries: [],
      startGameAck: null,
      mapConfig: null,
      definitions: null,
      miniGameResultPending: false,
      pendingScene: null,
      miniGameOnline: false,
      miniGameGuideSeen: false,
      itemActionGuideSeen: false,
      skillActionGuideSeen: false,
      checkpointDrawGuideSeen: false,
      checkpointRespawnGuideSeen: false,
      buffGuideSeen: false,
      hpGuideSeen: false,
      lpGuideSeen: false,
      seenItemDescriptionTypes: [],
      seenBuffDescriptionTypes: [],
      colyseusError: '',
    }),

  resetMatchState: () =>
    set((state) => ({
      match: null,
      currentScene: Scene.Home,
      globalState: 'match_init',
      turnState: '',
      matchId: '',
      joinRoomNotice: state.joinRoomNotice,
      pendingRoomAction: null,
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
      gameOverAnimationComplete: false,
      playedEntries: [],
      pendingEntries: [],
      startGameAck: null,
      mapConfig: null,
      definitions: null,
      miniGameResultPending: false,
      pendingScene: null,
      miniGameGuideSeen: false,
      itemActionGuideSeen: false,
      skillActionGuideSeen: false,
      checkpointDrawGuideSeen: false,
      checkpointRespawnGuideSeen: false,
      buffGuideSeen: false,
      hpGuideSeen: false,
      lpGuideSeen: false,
      seenItemDescriptionTypes: [],
      seenBuffDescriptionTypes: [],
      faction: state.faction,
    })),
}));

export default useGameStore;
