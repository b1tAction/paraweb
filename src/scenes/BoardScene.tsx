/**
 * BoardScene - 主棋盘场景
 *
 * 显示游戏主界面，玩家可以进行回合操作
 */

import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DebugLogEntry } from '../components/DebugLogEntry';
import { PhaserBoard } from '../components/PhaserBoard';
import { BOSS_BEAST_PORTRAIT_SRC, isBossPlayer } from '../game/bossVisualConfig';
import {
  createLogEntryAnimationContext,
  getLogEntryAnimationDelay,
  isLogEntryAnimationCandidate,
  isReverseClockLostBuffEntry,
  shouldRenderBoardLogEntryAnimation,
} from '../game/logEntryAnimationPolicy';
import {
  applyLogEntryToPlayer,
  clonePlayer,
  DICE_RESULT_DISPLAY_MS,
  DICE_ROLL_MIN_MS,
  DICE_UPGRADE_FLASH_MS,
  DICE_UPGRADE_RESULT_MS,
  type DiceRollResult,
  getLatestDiceRollResult,
  getMetadataNumber,
  getMetadataString,
  PLAYER_STAT_MAX,
} from '../game/logEntryPlayback';
import { gameService } from '../service/NakamaService';
import { Scene, useGameStore } from '../store/gameStore';
import type { Available, Item, Player } from '../types/protocol';
import { assetCssUrl, assetImageCssUrl, assetUrl } from '../utils/assets';
import { getDisambiguatedDisplayName } from '../utils/displayName';

const FACTION_META: Record<string, { label: string; color: string; bgColor: string; textColor?: string }> = {
  qing_long: { label: '青龙', color: '#6ab86e', bgColor: 'rgb(220, 253, 222)' },
  zhu_que: { label: '朱雀', color: '#e62b62', bgColor: 'rgba(253, 228, 237, 0.9)' },
  bai_hu: { label: '白虎', color: '#e1c4ee', textColor: '#740596', bgColor: 'rgba(246, 230, 250, 0.96)' },
  xuan_wu: { label: '玄武', color: '#113151', bgColor: 'rgba(208, 232, 255, 0.96)' },
};

const BUFF_EFFECTS: Record<string, string> = {
  divine: '每回合 LP 加 1',
  rain: '每两回合 HP 加 1',
  exorcism: '免疫毒瘴事件',
  fire: '每回合 LP 加 1',
  curse: '每回合 LP 减 1',
  lost: '移动方向反转',
  corrupt: '每两回合 HP 减 1',
  poison: '触发坏事件',
  hidden: '免疫伤害和事件',
};

const PLAYER_CARD_SCALE = 3;
const PLAYER_CARD_SIZE = {
  width: 80 * PLAYER_CARD_SCALE,
  height: 32 * PLAYER_CARD_SCALE,
};
const PLAYER_CARD_IMAGES: Record<string, string> = {
  qing_long: assetUrl('assets/ui/player_card_qinglong.png'),
  zhu_que: assetUrl('assets/ui/player_card_zhuque.png'),
  bai_hu: assetUrl('assets/ui/player_card_baihu.png'),
  xuan_wu: assetUrl('assets/ui/player_card_xuanwu.png'),
};
const BOTTOM_BAR_ASSET_BASE = assetUrl('assets/bottom_bar');
const BOTTOM_BAR_ITEM_ICONS: Record<string, string> = {
  any_door: 'any_door.png',
  dice_upgrade: 'dice_upgrade.png',
  reverse_clock: 'reverse_clock.png',
};
function isBossBattleTurn(turnState: string) {
  return turnState === 'turn_boss_battle' || turnState === 'TurnBossBattle';
}

function getFactionMeta(faction: string) {
  return FACTION_META[faction] ?? { label: faction || '未知', color: '#607d8b', bgColor: 'rgba(230, 236, 240, 0.96)' };
}

function getBuffIconSrc(type: string) {
  return assetUrl(`assets/buff/${type}.png`);
}

function formatBuffDuration(duration: number) {
  return duration < 0 ? '永久' : `${duration}`;
}

function getFillPercent(value: number, maxValue: number) {
  return `${Math.max(0, Math.min(100, (value / maxValue) * 100))}%`;
}

function getPlayerCardImage(faction: string) {
  return PLAYER_CARD_IMAGES[faction] ?? PLAYER_CARD_IMAGES.qing_long;
}

function getBottomBarItemIcon(type: string) {
  return `${BOTTOM_BAR_ASSET_BASE}/${BOTTOM_BAR_ITEM_ICONS[type] ?? `${type}.png`}`;
}

function getLogEntryKey(entry: { timestamp: string; action_type: string; target: string; source: string }) {
  return `${entry.timestamp}:${entry.action_type}:${entry.target}:${entry.source}`;
}

function shouldApplyImmediatePlayerStatUpdate(actionType: string) {
  return (
    actionType === 'damage' ||
    actionType === 'death' ||
    actionType === 'heal' ||
    actionType === 'modify_lp' ||
    actionType === 'fell_down' ||
    actionType === 'boss_damage'
  );
}

function getDiceAssetType(diceType: string) {
  return diceType === 'gold' || diceType === 'silver' || diceType === 'copper' || diceType === 'wood'
    ? diceType
    : 'wood';
}

function getDiceRotateSrc(diceType: string) {
  return assetUrl(`assets/dice/${getDiceAssetType(diceType)}_rotate.png`);
}

function getDiceResultSrc(diceType: string, steps: number) {
  return assetUrl(`assets/dice/${getDiceAssetType(diceType)}_result_${steps}.png`);
}

function getDiceResultNumberStyle(diceType: string): React.CSSProperties {
  const colorByType: Record<string, { color: string; outline: string }> = {
    gold: { color: '#ffe9a1', outline: '#fc9801' },
    silver: { color: '#f3f7ff', outline: '#687894' },
    copper: { color: '#c884ff', outline: '#68308f' },
    wood: { color: '#7be36c', outline: '#2e7a27' },
  };
  const palette = colorByType[getDiceAssetType(diceType)];

  return {
    ...styles.diceResultNumber,
    color: palette.color,
    textShadow: `2px 0 0 ${palette.outline}, -2px 0 0 ${palette.outline}, 0 2px 0 ${palette.outline}, 0 -2px 0 ${palette.outline}, 0 6px 0 rgba(0, 0, 0, 0.42), 0 9px 14px rgba(0, 0, 0, 0.35)`,
  };
}

type DiceRollView =
  | { status: 'idle' }
  | { status: 'awaiting_result'; playerId: string; diceType: string; startedAt: number }
  | { status: 'rolling'; playerId: string; diceType: string; startedAt: number; pendingResult: DiceRollResult }
  | { status: 'result'; playerId: string; diceType: string; steps: number };

type DiceRollDisplayView = Exclude<DiceRollView, { status: 'idle' }>;
type IdleDicePreview = { key: string; playerId: string; diceType: string; face: number };

type DiceUpgradeView =
  | { status: 'idle' }
  | {
      status: 'charging' | 'upgraded';
      playerId: string;
      fromDice: string;
      toDice: string;
      face: number;
      startedAt: number;
      entryKey: string;
    };

type BoardGameOverTransitionInput = {
  currentScene: Scene;
  pendingScene: Scene | null;
  hasGameOver: boolean;
  hasPendingAnimations: boolean;
  stateSyncQueueLength: number;
  diceRollStatus: DiceRollView['status'];
};

export function shouldEnterGameOverAfterBoardAnimations(input: BoardGameOverTransitionInput) {
  return (
    input.hasGameOver &&
    input.currentScene === Scene.Board &&
    input.pendingScene === Scene.GameOver &&
    input.stateSyncQueueLength === 0 &&
    !input.hasPendingAnimations &&
    input.diceRollStatus === 'idle'
  );
}

type BoardMiniGameTransitionInput = {
  currentScene: Scene;
  globalState: string;
  hasPendingAnimations: boolean;
  stateSyncQueueLength: number;
  diceRollStatus: DiceRollView['status'];
};

export function shouldEnterMiniGameAfterBoardAnimations(input: BoardMiniGameTransitionInput) {
  return (
    (input.globalState === 'round_mini_game' || input.globalState === 'RoundMiniGame') &&
    input.currentScene === Scene.Board &&
    input.stateSyncQueueLength === 0 &&
    !input.hasPendingAnimations &&
    input.diceRollStatus === 'idle'
  );
}

type ReverseClockBuffFlight = {
  key: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

function getDiceAssetKey(view: DiceRollDisplayView) {
  if (view.status === 'result') {
    return `${view.playerId}:${view.diceType}:result:${view.steps}`;
  }
  return `${view.playerId}:${view.diceType}:rolling:${view.startedAt}`;
}

function getDiceUpgradeAssetKey(view: Exclude<DiceUpgradeView, { status: 'idle' }>) {
  return `${view.playerId}:${view.fromDice}:${view.toDice || 'pending'}:${view.face}:${view.status}:${view.entryKey}`;
}

function getDiceTypeForRank(rank: number) {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'copper';
  return 'wood';
}

function getUpgradedDiceType(diceType: string) {
  switch (getDiceAssetType(diceType)) {
    case 'wood':
      return 'copper';
    case 'copper':
      return 'silver';
    case 'silver':
      return 'gold';
    case 'gold':
      return 'gold';
    default:
      return 'copper';
  }
}

function rollPreviewDiceFace() {
  return Math.floor(Math.random() * 6) + 1;
}

// Item types that require selecting a target player before use
const TARGET_PLAYER_ITEM_TYPES = new Set(['reverse_clock', 'any_door']);

// Factions whose skill requires selecting a target player before activation
const SKILL_TARGET_FACTIONS = new Set(['bai_hu']);

export const BoardScene: React.FC = () => {
  const {
    currentScene,
    globalState,
    turnState,
    myPlayerId,
    currentPlayerId,
    players,
    availableActions,
    decisionRequest,
    playedEntries,
    pendingEntries,
    round: storeRound,
    turn: storeTurn,
    mapConfig,
    miniGameResult,
    diceAssignments,
    gameOver,
    pendingScene,
  } = useGameStore();
  const [diceRollView, setDiceRollView] = useState<DiceRollView>({ status: 'idle' });
  const [diceUpgradeView, setDiceUpgradeView] = useState<DiceUpgradeView>({ status: 'idle' });
  const [idleDicePreview, setIdleDicePreview] = useState<IdleDicePreview | null>(null);
  const [rolledDiceTurnKey, setRolledDiceTurnKey] = useState('');
  const [handledDiceResultKey, setHandledDiceResultKey] = useState(
    () => getLatestDiceRollResult(playedEntries)?.key || '',
  );
  const [handledDiceUpgradeKey, setHandledDiceUpgradeKey] = useState('');
  const [renderedPlayers, setRenderedPlayers] = useState<Player[]>(players);

  // Disambiguated display name map: playerId -> disambiguated name
  const disambiguatedNames = useMemo(() => {
    const allPlayersData = players.map((p) => ({
      displayName: p.display_name || p.player_id,
      userId: p.player_id,
    }));
    const map: Record<string, string> = {};
    for (const p of players) {
      map[p.player_id] = getDisambiguatedDisplayName(p.display_name || p.player_id, p.player_id, allPlayersData);
    }
    return map;
  }, [players]);

  const getPlayerName = (playerId: string): string => {
    return disambiguatedNames[playerId] || playerId;
  };
  const [settlementPlayerId, setSettlementPlayerId] = useState<string | null>(null);
  const [settlementPlayerSnapshot, setSettlementPlayerSnapshot] = useState<Player | null>(null);
  const lastAppliedSettlementEntryRef = useRef('');
  const lastAppliedImmediateStatEntryRef = useRef('');
  const lastAppliedImmediateRespawnRef = useRef('');
  const lastAppliedEntryRef = useRef('');
  const roundReadySentKeyRef = useRef('');
  const debugLogContentRef = useRef<HTMLDivElement>(null);
  const playerCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const handledReverseClockFlightKeyRef = useRef('');
  const [reverseClockBuffFlight, setReverseClockBuffFlight] = useState<ReverseClockBuffFlight | null>(null);

  // 1. 新增：存储所有玩家的头像 Base64 (以 playerId 为 key)
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [itemTargetSelection, setItemTargetSelection] = useState<Item | null>(null);
  const [skillTargetSelection, setSkillTargetSelection] = useState(false);
  // 2. 新增：监听 Phaser 发过来的头像事件
  useEffect(() => {
    const handleAvatarUpdate = (event: Event) => {
      const { playerId, avatarUrl } = (event as CustomEvent<{ playerId: string; avatarUrl: string }>).detail;
      setAvatars((prev) => ({ ...prev, [playerId]: avatarUrl }));
    };

    window.addEventListener('ui-player-avatar', handleAvatarUpdate);
    return () => {
      window.removeEventListener('ui-player-avatar', handleAvatarUpdate);
    };
  }, []);

  const isMyTurn = myPlayerId === currentPlayerId;
  const followPlayerId = useMemo(() => {
    if (!currentPlayerId) return myPlayerId || null;

    const currentTurnPlayer = renderedPlayers.find((player) => player.player_id === currentPlayerId);
    if (currentTurnPlayer && isBossPlayer(currentTurnPlayer)) {
      return isBossBattleTurn(turnState) ? currentPlayerId : myPlayerId || currentPlayerId;
    }

    return currentPlayerId;
  }, [currentPlayerId, myPlayerId, renderedPlayers, turnState]);

  /**
   * 处理掷骰子
   */
  const handleRollDice = () => {
    console.log('[BoardScene] 掷骰子');
    setItemTargetSelection(null);
    setSkillTargetSelection(false);
    setRolledDiceTurnKey(`${storeRound}:${storeTurn}:${currentPlayerId || myPlayerId}`);
    setDiceRollView({
      status: 'awaiting_result',
      playerId: currentPlayerId || myPlayerId,
      diceType: availableActions?.dice_type || idleDicePreview?.diceType || 'wood',
      startedAt: Date.now(),
    });
    gameService.sendRollDice().catch((err) => {
      console.error('[BoardScene] 掷骰子失败', err);
      setRolledDiceTurnKey('');
      setDiceRollView({ status: 'idle' });
    });
  };

  /**
   * 处理使用技能
   */
  const handleUseSkill = () => {
    console.log('[BoardScene] 使用技能');
    if (SKILL_TARGET_FACTIONS.has(myPlayer?.faction || '')) {
      setSkillTargetSelection(true);
      return;
    }
    gameService.sendUseSkill();
  };

  /**
   * 处理使用道具
   */
  const handleUseItem = (item: Item) => {
    if (TARGET_PLAYER_ITEM_TYPES.has(item.type) || item.targetable) {
      setItemTargetSelection(item);
      return;
    }
    if (item.type === 'dice_upgrade') {
      const previewDiceType = availableActions?.dice_type || idleDicePreview?.diceType || miniGameDiceType || 'wood';
      setDiceUpgradeView({
        status: 'charging',
        playerId: currentPlayerId || myPlayerId,
        fromDice: previewDiceType,
        toDice: '',
        face: idleDicePreview?.face ?? rollPreviewDiceFace(),
        startedAt: Date.now(),
        entryKey: `pending:${item.id}:${Date.now()}`,
      });
    }
    console.log('[BoardScene] 使用道具', item.id);
    gameService.sendUseItem(item.id).catch((err) => {
      console.error('[BoardScene] 使用道具失败', err);
      if (item.type === 'dice_upgrade') {
        setDiceUpgradeView({ status: 'idle' });
      }
    });
  };

  /**
   * 处理决策选择
   */
  const handleChoice = (choice: number) => {
    if (decisionRequest) {
      console.log('[BoardScene] 提交决策', choice);
      gameService.sendUserChoice(decisionRequest.id, choice);
    }
  };

  // 获取棋盘玩家和 Boss 玩家
  const boardPlayers = renderedPlayers.filter((player) => !isBossPlayer(player));
  const bossPlayer = renderedPlayers.find(isBossPlayer);
  const myPlayer = renderedPlayers.find((player) => player.player_id === myPlayerId);
  const itemTargetPlayers = renderedPlayers.filter(
    (player) => player.player_id !== myPlayerId && !isBossPlayer(player),
  );
  const myBuffs = myPlayer?.buffs ?? [];
  const isMainAction = turnState === 'main_action' || turnState === 'MainAction';
  const isTurnEndSettlement = turnState === 'turn_end' || turnState === 'TurnEnd';
  const isRoundEndWait = globalState === 'round_end_wait' || globalState === 'RoundEndWait';
  const miniGameDiceType = useMemo(() => {
    if (!currentPlayerId) return '';
    const assignedDiceType = diceAssignments[currentPlayerId];
    if (assignedDiceType) return assignedDiceType;

    const rank = miniGameResult?.rankings.find((entry) => entry.player_id === currentPlayerId)?.rank;
    return rank ? getDiceTypeForRank(rank) : '';
  }, [currentPlayerId, diceAssignments, miniGameResult]);

  // ====================== 默认渲染操作 ====================== //
  const canUseOwnFactionSkill = Boolean(
    myPlayer && (myPlayer.faction === 'qing_long' || myPlayer.faction === 'xuan_wu') && myPlayer.charge > 0,
  );
  const actionView: Available | null =
    isMainAction && myPlayer
      ? {
          dice_type: (isMyTurn ? availableActions?.dice_type : '') || miniGameDiceType || 'wood',
          items: isMyTurn && availableActions ? availableActions.items : myPlayer.items || [],
          can_use_skill: isMyTurn && availableActions ? availableActions.can_use_skill : canUseOwnFactionSkill,
        }
      : null;
  const canInteractWithActions = isMyTurn && Boolean(availableActions);
  const actionTurnKey = isMainAction && currentPlayerId ? `${storeRound}:${storeTurn}:${currentPlayerId}` : '';
  const currentDicePreviewType = isMyTurn ? availableActions?.dice_type || miniGameDiceType : miniGameDiceType;
  const shouldShowActionPanel =
    Boolean(actionView) &&
    isMainAction &&
    diceRollView.status !== 'awaiting_result' &&
    diceRollView.status !== 'rolling' &&
    diceUpgradeView.status === 'idle';
  const shouldShowIdleDicePreview =
    Boolean(idleDicePreview) &&
    Boolean(currentDicePreviewType) &&
    isMainAction &&
    diceRollView.status === 'idle' &&
    actionTurnKey !== rolledDiceTurnKey &&
    pendingEntries.length === 0;
  const shouldShowDiceOverlay =
    diceUpgradeView.status !== 'idle' ||
    shouldShowIdleDicePreview ||
    diceRollView.status === 'awaiting_result' ||
    diceRollView.status === 'rolling' ||
    diceRollView.status === 'result';
  const isBlockingDiceUpgradeAnimation =
    diceUpgradeView.status === 'upgraded' || (diceUpgradeView.status === 'charging' && Boolean(diceUpgradeView.toDice));
  const hasPendingAnimations =
    pendingEntries.length > 0 ||
    diceRollView.status === 'rolling' ||
    diceRollView.status === 'result' ||
    isBlockingDiceUpgradeAnimation;
  const selectedItemStillAvailable = Boolean(
    itemTargetSelection && actionView?.items.some((item) => item.id === itemTargetSelection.id),
  );
  const canKeepSkillTargetSelection = Boolean(
    skillTargetSelection &&
      isMainAction &&
      isMyTurn &&
      availableActions?.can_use_skill &&
      !decisionRequest &&
      !hasPendingAnimations,
  );
  const activeAnimationContext = useMemo(
    () => createLogEntryAnimationContext(playedEntries, pendingEntries),
    [playedEntries, pendingEntries],
  );
  const activeLogEntry =
    activeAnimationContext && isLogEntryAnimationCandidate(activeAnimationContext.entry)
      ? activeAnimationContext.entry
      : null;
  const boardAnimationContext = shouldRenderBoardLogEntryAnimation(activeAnimationContext)
    ? activeAnimationContext
    : null;
  const settlementPlayer = settlementPlayerId
    ? settlementPlayerSnapshot ||
      renderedPlayers.find((player) => player.player_id === settlementPlayerId) ||
      players.find((player) => player.player_id === settlementPlayerId) ||
      null
    : null;

  useEffect(() => {
    if (
      itemTargetSelection &&
      (currentScene !== Scene.Board ||
        !isMainAction ||
        !isMyTurn ||
        !availableActions ||
        Boolean(decisionRequest) ||
        hasPendingAnimations ||
        !selectedItemStillAvailable)
    ) {
      setItemTargetSelection(null);
    }

    if (skillTargetSelection && (currentScene !== Scene.Board || !canKeepSkillTargetSelection)) {
      setSkillTargetSelection(false);
    }
  }, [
    currentScene,
    availableActions,
    decisionRequest,
    hasPendingAnimations,
    isMainAction,
    isMyTurn,
    itemTargetSelection,
    selectedItemStillAvailable,
    skillTargetSelection,
    canKeepSkillTargetSelection,
  ]);

  useEffect(() => {
    const entry = activeAnimationContext?.entry;
    if (!isReverseClockLostBuffEntry(entry)) return;

    const key = getLogEntryKey(entry);
    if (handledReverseClockFlightKeyRef.current === key) return;
    handledReverseClockFlightKeyRef.current = key;

    const targetCard = playerCardRefs.current[entry.target];
    const targetRect = targetCard?.getBoundingClientRect();
    const startX = window.innerWidth / 2;
    const startY = window.innerHeight / 2;
    const endX = targetRect ? targetRect.left + targetRect.width * 0.66 : startX;
    const endY = targetRect ? targetRect.top + targetRect.height * 0.7 : startY - 160;

    setReverseClockBuffFlight({ key, startX, startY, endX, endY });

    const timeoutId = window.setTimeout(() => {
      setReverseClockBuffFlight((current) => (current?.key === key ? null : current));
    }, 1850);

    return () => window.clearTimeout(timeoutId);
  }, [activeAnimationContext]);

  useEffect(() => {
    if (!actionTurnKey || !currentDicePreviewType || !currentPlayerId) {
      setIdleDicePreview(null);
      return;
    }

    const key = `${actionTurnKey}:${currentDicePreviewType}`;
    setIdleDicePreview((current) =>
      current?.key === key
        ? current
        : {
            key,
            playerId: currentPlayerId,
            diceType: currentDicePreviewType,
            face: rollPreviewDiceFace(),
          },
    );
  }, [actionTurnKey, currentDicePreviewType, currentPlayerId]);

  // ====================== 队列处理逻辑 ====================== //
  const stateSyncQueue = useGameStore((state) => state.stateSyncQueue);

  useEffect(() => {
    // 当存在没有执行完的动画或是正在扔骰子时，不触发下一次 StateSync 出队
    if (hasPendingAnimations) {
      return;
    }

    // 如果当前处于小游戏弹窗状态，由后台的 BoardScene 暂停消费队列，避免路由冲突
    if (useGameStore.getState().currentScene === 'MiniGameSubmitRankScene') {
      return;
    }

    // 这里只有没有待播放动画且仍在队列里有待消费 StateSync
    if (stateSyncQueue.length > 0) {
      console.log(`[BoardScene] 拔出下一个 StateSync。剩余队列长度：${stateSyncQueue.length - 1}`);
      useGameStore.getState().applyNextStateSync();
      gameService.routeSceneByState(useGameStore.getState().globalState); // trigger route check
    }
  }, [stateSyncQueue.length, hasPendingAnimations]);

  useEffect(() => {
    if (
      !shouldEnterGameOverAfterBoardAnimations({
        currentScene,
        pendingScene,
        hasGameOver: Boolean(gameOver),
        hasPendingAnimations,
        stateSyncQueueLength: stateSyncQueue.length,
        diceRollStatus: diceRollView.status,
      })
    ) {
      return;
    }

    const store = useGameStore.getState();
    if (store.currentScene !== Scene.Board || store.pendingScene !== Scene.GameOver || !store.gameOver) return;

    console.log('[BoardScene] 终局动画播放完成，进入 GameOver');
    store.setPendingScene(null);
    store.setScene(Scene.GameOver);
  }, [currentScene, diceRollView.status, gameOver, hasPendingAnimations, pendingScene, stateSyncQueue.length]);

  useEffect(() => {
    if (
      !shouldEnterMiniGameAfterBoardAnimations({
        currentScene,
        globalState,
        hasPendingAnimations,
        stateSyncQueueLength: stateSyncQueue.length,
        diceRollStatus: diceRollView.status,
      })
    ) {
      return;
    }

    const store = useGameStore.getState();
    if (store.currentScene !== Scene.Board) return;

    console.log('[BoardScene] Board animations finished, entering MiniGame');
    store.setPendingScene(null);
    store.setScene(Scene.MiniGameSubmitRank);
  }, [currentScene, diceRollView.status, globalState, hasPendingAnimations, stateSyncQueue.length]);

  useEffect(() => {
    if (isTurnEndSettlement && currentPlayerId) {
      setSettlementPlayerId(currentPlayerId);
      setSettlementPlayerSnapshot((current) => {
        if (current?.player_id === currentPlayerId) return current;
        const base =
          renderedPlayers.find((player) => player.player_id === currentPlayerId) ||
          players.find((player) => player.player_id === currentPlayerId);
        return base ? clonePlayer(base) : null;
      });
      return;
    }

    if (!hasPendingAnimations) {
      setSettlementPlayerId(null);
      setSettlementPlayerSnapshot(null);
      lastAppliedSettlementEntryRef.current = '';
    }
  }, [currentPlayerId, hasPendingAnimations, isTurnEndSettlement, players, renderedPlayers]);

  useEffect(() => {
    if (!activeLogEntry || !settlementPlayerId || activeLogEntry.target !== settlementPlayerId) return;

    const key = `${activeLogEntry.timestamp}:${activeLogEntry.action_type}:${activeLogEntry.target}:${activeLogEntry.source}`;
    if (lastAppliedSettlementEntryRef.current === key) return;

    setSettlementPlayerSnapshot((current) => {
      if (!current) return current;
      return applyLogEntryToPlayer(current, activeLogEntry);
    });
    lastAppliedSettlementEntryRef.current = key;
  }, [activeLogEntry, settlementPlayerId]);

  useEffect(() => {
    if (!activeLogEntry || !shouldApplyImmediatePlayerStatUpdate(activeLogEntry.action_type)) return;

    const key = getLogEntryKey(activeLogEntry);
    if (lastAppliedImmediateStatEntryRef.current === key) return;

    setRenderedPlayers((current) => current.map((player) => applyLogEntryToPlayer(player, activeLogEntry)));
    lastAppliedImmediateStatEntryRef.current = key;
  }, [activeLogEntry]);

  useEffect(() => {
    if (!activeLogEntry || activeLogEntry.action_type !== 'respawn') return;

    const syncedPlayer = players.find((player) => player.player_id === activeLogEntry.target);
    const key = `${getLogEntryKey(activeLogEntry)}:${syncedPlayer?.hp ?? ''}:${syncedPlayer?.lp ?? ''}`;
    if (lastAppliedImmediateRespawnRef.current === key) return;

    const checkpointPos = getMetadataNumber(activeLogEntry.metadata, 'checkpoint_pos');
    if (checkpointPos === null && !syncedPlayer) return;

    setRenderedPlayers((current) =>
      current.map((player) =>
        player.player_id === activeLogEntry.target
          ? {
              ...player,
              position: checkpointPos ?? syncedPlayer?.position ?? player.position,
              hp: syncedPlayer?.hp ?? player.hp,
              lp: syncedPlayer?.lp ?? player.lp,
            }
          : player,
      ),
    );
    lastAppliedImmediateRespawnRef.current = key;
  }, [activeLogEntry, players]);

  useEffect(() => {
    // 关键：只有当前批次动画（含骰子）都渲染完，才刷新玩家快照
    // 避免 HP/LP/位置提前“跳变”。
    if (!hasPendingAnimations) {
      setRenderedPlayers(players);
    }
    // setRenderedPlayers(players);
  }, [players, hasPendingAnimations]);

  useEffect(() => {
    if (playedEntries.length === 0) return;

    const latestPlayedEntry = playedEntries[playedEntries.length - 1];
    const key = getLogEntryKey(latestPlayedEntry);
    if (lastAppliedEntryRef.current === key) return;
    if (lastAppliedImmediateStatEntryRef.current === key) {
      lastAppliedEntryRef.current = key;
      return;
    }

    setRenderedPlayers((current) => current.map((player) => applyLogEntryToPlayer(player, latestPlayedEntry)));
    lastAppliedEntryRef.current = key;
  }, [playedEntries]);

  useEffect(() => {
    if (!isRoundEndWait) {
      roundReadySentKeyRef.current = '';
      return;
    }

    if (hasPendingAnimations) return;

    const readyKey = `${storeRound}:${currentPlayerId || 'round_end'}`;
    if (roundReadySentKeyRef.current === readyKey) return;

    roundReadySentKeyRef.current = readyKey;
    console.log('[BoardScene] 动画播放完成，发送 RoundReady', {
      round: storeRound,
      pendingEntries: pendingEntries.length,
      diceStatus: diceRollView.status,
    });

    gameService.sendRoundReady().catch((err) => {
      roundReadySentKeyRef.current = '';
      console.error('[BoardScene] 发送 RoundReady 失败', err);
    });
  }, [currentPlayerId, diceRollView.status, hasPendingAnimations, isRoundEndWait, pendingEntries.length, storeRound]);

  // Animation player - processes pending entries one at a time
  // Action-type entries get animation delay, others skip immediately
  useEffect(() => {
    if (pendingEntries.length === 0) return;

    const delay = getLogEntryAnimationDelay(activeAnimationContext);

    const timeoutId = window.setTimeout(() => {
      useGameStore.getState().playNextEntry();
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [activeAnimationContext, pendingEntries.length]);

  // Auto-scroll debug log when new entries appear
  const playedEntryCount = playedEntries.length;
  useEffect(() => {
    if (debugLogContentRef.current && playedEntryCount >= 0) {
      debugLogContentRef.current.scrollTop = debugLogContentRef.current.scrollHeight;
    }
  }, [playedEntryCount]);

  useEffect(() => {
    if (!activeAnimationContext || activeAnimationContext.entry.action_type !== 'dice_roll') return;

    const activeLogEntry = activeAnimationContext.entry;

    const steps = getMetadataNumber(activeLogEntry.metadata, 'dice_steps');
    if (!steps) return;

    const result: DiceRollResult = {
      key: `${activeLogEntry.timestamp}:${activeLogEntry.target}:${steps}`,
      playerId: activeLogEntry.target,
      diceType: getMetadataString(activeLogEntry.metadata, 'dice_type') || 'wood',
      steps,
    };

    if (result.key === handledDiceResultKey) return;
    setHandledDiceResultKey(result.key);

    setDiceRollView((current) => {
      if (current.status === 'rolling' && current.playerId === result.playerId) {
        return { ...current, pendingResult: result };
      }

      if (current.status === 'awaiting_result' && current.playerId === result.playerId) {
        return {
          status: 'rolling',
          playerId: current.playerId,
          diceType: result.diceType,
          startedAt: current.startedAt,
          pendingResult: result,
        };
      }

      return {
        status: 'rolling',
        playerId: result.playerId,
        diceType: result.diceType,
        startedAt: Date.now(),
        pendingResult: result,
      };
    });
  }, [activeAnimationContext, handledDiceResultKey]);

  useEffect(() => {
    if (!activeAnimationContext || activeAnimationContext.entry.action_type !== 'dice_upgrade') return;

    const activeLogEntry = activeAnimationContext.entry;
    const fromDice = getMetadataString(activeLogEntry.metadata, 'from_dice') || 'wood';
    const toDice = getMetadataString(activeLogEntry.metadata, 'to_dice') || getUpgradedDiceType(fromDice);
    const resultKey = `${activeLogEntry.timestamp}:${activeLogEntry.target}:${fromDice}:${toDice}`;

    if (resultKey === handledDiceUpgradeKey) return;
    setHandledDiceUpgradeKey(resultKey);
    useGameStore.getState().setDiceAssignments({
      ...useGameStore.getState().diceAssignments,
      [activeLogEntry.target]: toDice,
    });

    setDiceUpgradeView((current) => {
      const shouldKeepCurrentFace = current.status !== 'idle' && current.playerId === activeLogEntry.target;
      const startedAt = shouldKeepCurrentFace ? current.startedAt : Date.now();

      return {
        status: 'charging',
        playerId: activeLogEntry.target,
        fromDice,
        toDice,
        face: shouldKeepCurrentFace ? current.face : rollPreviewDiceFace(),
        startedAt,
        entryKey: resultKey,
      };
    });
  }, [activeAnimationContext, handledDiceUpgradeKey]);

  useEffect(() => {
    if (diceRollView.status !== 'rolling') return;

    const elapsed = Date.now() - diceRollView.startedAt;
    const delay = Math.max(0, DICE_ROLL_MIN_MS - elapsed);
    const result = diceRollView.pendingResult;
    const timeoutId = window.setTimeout(() => {
      setDiceRollView({
        status: 'result',
        playerId: result.playerId,
        diceType: result.diceType,
        steps: result.steps,
      });
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [diceRollView]);

  useEffect(() => {
    if (diceUpgradeView.status !== 'charging' || !diceUpgradeView.toDice) return;

    const elapsed = Date.now() - diceUpgradeView.startedAt;
    const delay = Math.max(0, DICE_UPGRADE_FLASH_MS - elapsed);
    const timeoutId = window.setTimeout(() => {
      setDiceUpgradeView((current) =>
        current.status === 'charging' && current.entryKey === diceUpgradeView.entryKey
          ? { ...current, status: 'upgraded', startedAt: Date.now() }
          : current,
      );
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [diceUpgradeView]);

  useEffect(() => {
    if (diceUpgradeView.status !== 'upgraded') return;

    const timeoutId = window.setTimeout(() => {
      setDiceUpgradeView((current) =>
        current.status === 'upgraded' && current.entryKey === diceUpgradeView.entryKey ? { status: 'idle' } : current,
      );
    }, DICE_UPGRADE_RESULT_MS);

    return () => window.clearTimeout(timeoutId);
  }, [diceUpgradeView]);

  useEffect(() => {
    if (diceUpgradeView.status !== 'charging' || diceUpgradeView.toDice) return;

    const timeoutId = window.setTimeout(() => {
      setDiceUpgradeView((current) =>
        current.status === 'charging' && !current.toDice && current.entryKey === diceUpgradeView.entryKey
          ? { status: 'idle' }
          : current,
      );
    }, 8000);

    return () => window.clearTimeout(timeoutId);
  }, [diceUpgradeView]);

  useEffect(() => {
    if (diceRollView.status !== 'result') return;

    const timeoutId = window.setTimeout(() => {
      setDiceRollView({ status: 'idle' });
    }, DICE_RESULT_DISPLAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [diceRollView]);

  useEffect(() => {
    const resetDiceView = () => {
      setRolledDiceTurnKey('');
      setDiceRollView({ status: 'idle' });
    };

    window.addEventListener('board:dice-roll-rejected', resetDiceView);
    return () => window.removeEventListener('board:dice-roll-rejected', resetDiceView);
  }, []);

  useEffect(() => {
    if (diceRollView.status !== 'awaiting_result') return;

    const timeoutId = window.setTimeout(() => {
      setDiceRollView((current) => (current.status === 'awaiting_result' ? { status: 'idle' } : current));
    }, 8000);

    return () => window.clearTimeout(timeoutId);
  }, [diceRollView]);

  return (
    <div style={styles.sceneRoot}>
      <div style={styles.boardLayer}>
        {mapConfig ? (
          <PhaserBoard
            mapConfig={mapConfig}
            players={renderedPlayers}
            followPlayerId={followPlayerId}
            selfPlayerId={myPlayerId}
            activeAnimationContext={boardAnimationContext}
            settlementPlayer={settlementPlayer}
          />
        ) : (
          <div style={styles.mapMissing}>地图未加载 (mapConfig is null)</div>
        )}
      </div>

      <div style={styles.uiLayer}>
        <div style={styles.topHud}>
          <h2 style={styles.title}>主棋盘</h2>
          <div style={styles.playerBar}>
            {boardPlayers.map((player) => {
              const faction = getFactionMeta(player.faction);
              const isCurrentTurnPlayer = player.player_id === currentPlayerId;

              return (
                <div
                  key={player.player_id}
                  ref={(node) => {
                    playerCardRefs.current[player.player_id] = node;
                  }}
                  style={{
                    ...styles.pixelPlayerCard,
                    backgroundImage: `url(${getPlayerCardImage(player.faction)})`,
                    filter: isCurrentTurnPlayer
                      ? `drop-shadow(0 0 8px ${faction.color}) drop-shadow(0 0 2px #ffffff)`
                      : styles.pixelPlayerCard.filter,
                  }}
                  title={`${getPlayerName(player.player_id)}\nHP ${player.hp}/${player.max_hp}\nLP ${player.lp}/${PLAYER_STAT_MAX}`}
                >
                  {avatars[player.player_id] && (
                    <img
                      src={avatars[player.player_id]}
                      alt={getPlayerName(player.player_id)}
                      style={styles.pixelPlayerAvatar}
                    />
                  )}
                  {player.player_id === myPlayerId && <span style={styles.pixelMyBadge}>我</span>}
                  <span
                    style={{
                      ...styles.pixelPlayerName,
                      backgroundColor: faction.bgColor,
                      borderColor: faction.color,
                      color: faction.textColor ?? faction.color,
                    }}
                  >
                    {getPlayerName(player.player_id)}
                  </span>
                  <div style={styles.pixelHpTrack}>
                    <div
                      style={{
                        ...styles.pixelHpFill,
                        width: getFillPercent(player.hp, player.max_hp),
                      }}
                    />
                  </div>
                  <div style={styles.pixelLpTrack}>
                    <div
                      style={{
                        ...styles.pixelLpFill,
                        width: getFillPercent(player.lp, PLAYER_STAT_MAX),
                      }}
                    />
                  </div>
                  <div style={styles.pixelBuffRow}>
                    {player.buffs?.slice(0, 10).map((buff) => (
                      <img
                        key={buff.type}
                        title={`${buff.name || buff.type}\n${BUFF_EFFECTS[buff.type] || '暂无效果说明'}\n剩余回合: ${formatBuffDuration(buff.duration)}`}
                        src={getBuffIconSrc(buff.type)}
                        alt={buff.name || buff.type}
                        style={styles.pixelBuffDot}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={styles.statusSection}>
            <p style={styles.info}>全局状态：{globalState}</p>
            <p style={styles.info}>回合状态：{turnState}</p>
            <p style={styles.info}>当前玩家：{getPlayerName(currentPlayerId)}</p>
          </div>
        </div>

        <div style={styles.sidePanels}>
          {bossPlayer && (
            <div style={styles.rightPanel}>
              <div style={styles.bossSection}>
                <div style={styles.bossHeader}>
                  <div style={styles.bossAvatar}>
                    <img
                      src={BOSS_BEAST_PORTRAIT_SRC}
                      alt={`${getPlayerName(bossPlayer.player_id)} 头像`}
                      style={styles.bossAvatarImage}
                    />
                  </div>
                  <div style={styles.bossTitleGroup}>
                    <strong style={styles.bossTitle}>Boss</strong>
                    <span style={styles.bossId} title={bossPlayer.player_id}>
                      {getPlayerName(bossPlayer.player_id)}
                    </span>
                  </div>
                </div>
                <div style={styles.bossStats}>
                  <span>HP {bossPlayer.hp}</span>
                  <span>位置 {bossPlayer.position}</span>
                </div>
                <div style={styles.buffDots}>
                  {bossPlayer.buffs.length > 0
                    ? bossPlayer.buffs.map((buff) => (
                        <img
                          key={buff.type}
                          title={`${buff.name}\n${BUFF_EFFECTS[buff.type] || '暂无效果说明'}\n剩余回合: ${formatBuffDuration(buff.duration)}\n`}
                          src={getBuffIconSrc(buff.type)}
                          alt={buff.name || buff.type}
                          style={styles.buffDot}
                        />
                      ))
                    : null}
                </div>
              </div>
            </div>
          )}
        </div>

        {myBuffs.length > 0 && (
          <div style={styles.selfBuffPanel}>
            {myBuffs.map((buff) => (
              <div
                key={buff.type}
                style={styles.selfBuffFrame}
                title={`${buff.name}\n${BUFF_EFFECTS[buff.type] || '暂无效果说明'}\n剩余回合: ${formatBuffDuration(buff.duration)}`}
              >
                <span style={styles.selfBuffDuration}>{formatBuffDuration(buff.duration)}</span>
                <img src={getBuffIconSrc(buff.type)} alt={buff.name} style={styles.selfBuffIcon} />
              </div>
            ))}
          </div>
        )}

        {bossPlayer && bossPlayer.buffs.length > 0 && (
          <div style={styles.bossBuffPanel}>
            {bossPlayer.buffs.map((buff) => (
              <div
                key={buff.type}
                style={styles.selfBuffFrame}
                title={`${buff.name}\n${BUFF_EFFECTS[buff.type] || '鏆傛棤鏁堟灉璇存槑'}\n鍓╀綑鍥炲悎: ${formatBuffDuration(buff.duration)}`}
              >
                <span style={styles.selfBuffDuration}>{formatBuffDuration(buff.duration)}</span>
                <img src={getBuffIconSrc(buff.type)} alt={buff.name} style={styles.selfBuffIcon} />
              </div>
            ))}
          </div>
        )}

        {reverseClockBuffFlight && (
          <div
            key={reverseClockBuffFlight.key}
            className="paradice-reverse-clock-flight"
            style={
              {
                '--start-x': `${reverseClockBuffFlight.startX}px`,
                '--start-y': `${reverseClockBuffFlight.startY}px`,
                '--end-x': `${reverseClockBuffFlight.endX}px`,
                '--end-y': `${reverseClockBuffFlight.endY}px`,
              } as React.CSSProperties
            }
            aria-hidden="true"
          >
            <div
              className="paradice-reverse-clock-flight__icon"
              style={{ backgroundImage: assetCssUrl('assets/effects/reverseclock.png') }}
            />
          </div>
        )}

        {shouldShowActionPanel && actionView && (
          <div style={styles.mapActionPanel}>
            {!isMyTurn && <div style={styles.waitingActionText}>等待玩家 {getPlayerName(currentPlayerId)} 操作</div>}
            <button
              type="button"
              onClick={handleRollDice}
              style={{
                ...styles.bottomBarButton,
                ...(!canInteractWithActions ? styles.disabledActionTile : null),
              }}
              title={`投 ${actionView.dice_type} 骰子`}
              aria-label={`投骰子 ${actionView.dice_type}`}
              disabled={!canInteractWithActions}
            >
              <img
                src={`${BOTTOM_BAR_ASSET_BASE}/dice_roll.png`}
                alt=""
                draggable={false}
                style={styles.bottomBarLogo}
              />
            </button>

            {actionView.items.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => handleUseItem(item)}
                style={{
                  ...styles.bottomBarButton,
                  ...(!canInteractWithActions ? styles.disabledActionTile : null),
                }}
                title={item.name}
                aria-label={item.name}
                disabled={!canInteractWithActions}
              >
                <img src={getBottomBarItemIcon(item.type)} alt="" draggable={false} style={styles.bottomBarLogo} />
              </button>
            ))}

            {actionView.can_use_skill && (
              <button
                type="button"
                onClick={handleUseSkill}
                style={{
                  ...styles.actionTile,
                  ...styles.skillActionTile,
                  ...(!canInteractWithActions ? styles.disabledActionTile : null),
                }}
                title="使用阵营技能"
                disabled={!canInteractWithActions}
              >
                <span style={styles.actionIcon}>✦</span>
                <span style={styles.actionLabel}>阵营技能</span>
                <span style={styles.actionMeta}>技能</span>
              </button>
            )}
          </div>
        )}

        {shouldShowDiceOverlay && (
          <>
            {diceRollView.status === 'result' && (
              <div style={getDiceResultNumberStyle(diceRollView.diceType)}>{diceRollView.steps}</div>
            )}
            <div style={styles.diceOverlay} aria-live="polite">
              {diceUpgradeView.status !== 'idle' ? (
                <>
                  {diceUpgradeView.status === 'upgraded' && (
                    <div
                      key={`sparkle:${diceUpgradeView.entryKey}`}
                      className="paradice-sparkle-sprite"
                      style={styles.diceUpgradeSparkle}
                    />
                  )}
                  <img
                    key={getDiceUpgradeAssetKey(diceUpgradeView)}
                    src={getDiceResultSrc(
                      diceUpgradeView.status === 'upgraded' && diceUpgradeView.toDice
                        ? diceUpgradeView.toDice
                        : diceUpgradeView.fromDice,
                      diceUpgradeView.face,
                    )}
                    alt=""
                    className={
                      diceUpgradeView.status === 'upgraded'
                        ? 'paradice-dice-upgrade-result'
                        : 'paradice-dice-upgrade-charging'
                    }
                    style={styles.diceImage}
                  />
                </>
              ) : shouldShowIdleDicePreview && idleDicePreview ? (
                <img
                  key={idleDicePreview.key}
                  src={getDiceResultSrc(idleDicePreview.diceType, idleDicePreview.face)}
                  alt=""
                  style={styles.diceImage}
                />
              ) : diceRollView.status === 'result' ? (
                <img
                  key={getDiceAssetKey(diceRollView)}
                  src={getDiceResultSrc(diceRollView.diceType, diceRollView.steps)}
                  alt=""
                  style={styles.diceImage}
                />
              ) : diceRollView.status !== 'idle' ? (
                <div
                  key={getDiceAssetKey(diceRollView)}
                  className="paradice-dice-sprite-rolling"
                  style={{
                    ...styles.diceSprite,
                    backgroundImage: `url(${getDiceRotateSrc(diceRollView.diceType)})`,
                  }}
                />
              ) : null}
            </div>
          </>
        )}

        {decisionRequest && (
          <div style={styles.decisionBackdrop}>
            <div style={styles.decisionSection}>
              <h3>{decisionRequest.prompt}</h3>
              <p>{decisionRequest.context}</p>
              <div style={styles.decisionOptions}>
                {decisionRequest.options.map((option, index) => (
                  <button
                    type="button"
                    key={option.id}
                    onClick={() => handleChoice(index)}
                    style={styles.decisionButton}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {currentScene === Scene.Board && itemTargetSelection && (
          <div style={styles.decisionBackdrop}>
            <div style={styles.selectionPanel}>
              <div style={styles.selectionEyebrow}>道具使用</div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#333' }}>选择道具目标玩家</h3>
              <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#666' }}>
                请为道具 {itemTargetSelection.name} 选择一个作用目标
              </p>
              <div style={styles.decisionOptions}>
                {itemTargetPlayers.map((player) => (
                  <button
                    type="button"
                    key={player.player_id}
                    onClick={() => {
                      console.log('[BoardScene] 选择目标使用了道具', itemTargetSelection.id, player.player_id);
                      gameService.sendUseItem(itemTargetSelection.id, player.player_id).catch((err) => {
                        console.error('[BoardScene] 选择目标使用道具失败', err);
                      });
                      setItemTargetSelection(null);
                    }}
                    style={styles.selectionChoiceButton}
                  >
                    <span style={styles.targetPlayerName}>{getPlayerName(player.player_id)}</span>
                    <span style={styles.targetPlayerPosition}>位置 {player.position}</span>
                  </button>
                ))}
              </div>
              <div style={styles.selectionFooter}>
                <button type="button" onClick={() => setItemTargetSelection(null)} style={styles.selectionCancelButton}>
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {currentScene === Scene.Board && skillTargetSelection && (
          <div style={styles.decisionBackdrop}>
            <div style={styles.selectionPanel}>
              <div style={styles.selectionEyebrow}>技能释放</div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#333' }}>选择技能目标玩家</h3>
              <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#666' }}>请为劫运选择一个作用目标</p>
              <div style={styles.decisionOptions}>
                {itemTargetPlayers.map((player) => (
                  <button
                    type="button"
                    key={player.player_id}
                    onClick={() => {
                      console.log('[BoardScene] 选择目标使用了技能', player.player_id);
                      gameService.sendUseSkill(player.player_id).catch((err) => {
                        console.error('[BoardScene] 选择目标使用技能失败', err);
                      });
                      setSkillTargetSelection(false);
                    }}
                    style={styles.selectionChoiceButton}
                  >
                    <span style={styles.targetPlayerName}>{getPlayerName(player.player_id)}</span>
                    <span style={styles.targetPlayerPosition}>位置 {player.position}</span>
                  </button>
                ))}
              </div>
              <div style={styles.selectionFooter}>
                <button
                  type="button"
                  onClick={() => setSkillTargetSelection(false)}
                  style={styles.selectionCancelButton}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Debug Log Panel - bottom-left */}
        <div style={styles.debugLogPanel}>
          <div style={styles.debugLogHeader}>Action Log R{storeRound}</div>
          <div ref={debugLogContentRef} style={styles.debugLogContent}>
            {playedEntries
              .filter((entry) => entry.type === 'action' || entry.type === 'boss')
              .map((entry) => (
                <DebugLogEntry key={getLogEntryKey(entry)} entry={entry} players={players} />
              ))}
            {pendingEntries.length > 0 && <div style={styles.debugLogPending}>+{pendingEntries.length} pending...</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

// 简单样式
const styles: Record<string, React.CSSProperties> = {
  sceneRoot: {
    position: 'fixed',
    inset: 0,
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: '#0d1117',
  },
  boardLayer: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
  },
  uiLayer: {
    position: 'absolute',
    inset: 0,
    zIndex: 2,
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '12px',
    gap: '10px',
  },
  topHud: {
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
    width: '100%',
    minWidth: 0,
  },
  playerBar: {
    pointerEvents: 'auto',
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    overflowX: 'auto',
    paddingBottom: '8px',
  },
  pixelPlayerCard: {
    position: 'relative',
    flex: `0 0 ${PLAYER_CARD_SIZE.width}px`,
    width: `${PLAYER_CARD_SIZE.width}px`,
    height: `${PLAYER_CARD_SIZE.height}px`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${PLAYER_CARD_SIZE.width}px ${PLAYER_CARD_SIZE.height}px`,
    imageRendering: 'pixelated',
    filter: 'drop-shadow(0 5px 0 rgba(0, 0, 0, 0.38))',
  },
  pixelPlayerAvatar: {
    position: 'absolute',
    left: `${4 * PLAYER_CARD_SCALE}px`,
    top: `${4 * PLAYER_CARD_SCALE}px`,
    width: `${16 * PLAYER_CARD_SCALE}px`,
    height: `${18 * PLAYER_CARD_SCALE}px`,
    objectFit: 'cover',
    objectPosition: 'center 18%',
    imageRendering: 'pixelated',
  },
  pixelHpTrack: {
    position: 'absolute',
    left: `${31 * PLAYER_CARD_SCALE}px`,
    top: `${5.5 * PLAYER_CARD_SCALE}px`,
    width: `${46 * PLAYER_CARD_SCALE}px`,
    height: `${4 * PLAYER_CARD_SCALE}px`,
    overflow: 'hidden',
  },
  pixelLpTrack: {
    position: 'absolute',
    left: `${31 * PLAYER_CARD_SCALE}px`,
    top: `${11.5 * PLAYER_CARD_SCALE}px`, // 虽然有点怪, 但是 11.5px 刚刚好捏
    width: `${46 * PLAYER_CARD_SCALE}px`,
    height: `${4 * PLAYER_CARD_SCALE}px`,
    overflow: 'hidden',
  },
  pixelHpFill: {
    height: '100%',
    backgroundColor: '#d93a32',
    boxShadow: 'inset 0 -3px 0 rgba(0, 0, 0, 0.22)',
  },
  pixelLpFill: {
    height: '100%',
    backgroundColor: '#f2d94e',
    boxShadow: 'inset 0 -3px 0 rgba(0, 0, 0, 0.2)',
  },
  pixelBuffRow: {
    position: 'absolute',
    left: `${31 * PLAYER_CARD_SCALE}px`,
    right: `${5 * PLAYER_CARD_SCALE}px`,
    top: `${20 * PLAYER_CARD_SCALE}px`,
    height: `${4 * PLAYER_CARD_SCALE}px`,
    display: 'flex',
    alignItems: 'center',
    gap: `${2 * PLAYER_CARD_SCALE}px`,
    overflow: 'hidden',
  },
  pixelBuffDot: {
    width: `${4 * PLAYER_CARD_SCALE}px`,
    height: `${4 * PLAYER_CARD_SCALE}px`,
    flex: '0 0 auto',
    boxShadow: 'inset 0 -3px 0 rgba(0, 0, 0, 0.25)',
  },
  pixelMyBadge: {
    position: 'absolute',
    left: `${17 * PLAYER_CARD_SCALE}px`,
    top: `${2 * PLAYER_CARD_SCALE}px`,
    width: `${8 * PLAYER_CARD_SCALE}px`,
    height: `${8 * PLAYER_CARD_SCALE}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    color: '#fff4a8',
    border: '2px solid #fff4a8',
    borderRadius: '50%',
    boxShadow: '0 2px 0 rgba(0, 0, 0, 0.42), inset 0 -2px 0 rgba(0, 0, 0, 0.32)',
    fontSize: '10px',
    fontWeight: 900,
    lineHeight: 1,
  },
  pixelPlayerName: {
    position: 'absolute',
    left: `${3 * PLAYER_CARD_SCALE}px`,
    top: `${28 * PLAYER_CARD_SCALE}px`,
    width: `${24 * PLAYER_CARD_SCALE}px`,
    overflow: 'hidden',
    padding: '1px 3px',
    border: '1px solid',
    borderRadius: '4px',
    textAlign: 'center',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '10px',
    fontWeight: 900,
    lineHeight: 1,
    boxShadow: '0 2px 0 rgba(0, 0, 0, 0.24)',
  },
  sidePanels: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    gap: '12px',
    flex: 1,
    minHeight: 0,
  },
  rightPanel: {
    pointerEvents: 'auto',
    width: 'min(360px, 42vw)',
    marginLeft: 'auto',
    maxHeight: '100%',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  mapActionPanel: {
    pointerEvents: 'auto',
    position: 'absolute',
    left: '50%',
    bottom: '28px',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: '10px',
    width: 'min(760px, calc(100vw - 32px))',
    padding: 0,
    backgroundColor: 'transparent',
  },
  waitingActionText: {
    flex: '1 0 100%',
    textAlign: 'center',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 800,
    textShadow: '0 2px 6px rgba(0, 0, 0, 0.38)',
  },
  mapMissing: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ef9a9a',
    fontWeight: 700,
    background: 'rgba(0,0,0,0.5)',
  },
  title: {
    pointerEvents: 'auto',
    margin: 0,
    padding: '8px 12px',
    borderRadius: '10px',
    backgroundColor: 'rgba(19, 26, 36, 0.75)',
    color: '#f2f6fb',
    fontSize: '20px',
  },
  statusSection: {
    pointerEvents: 'auto',
    flex: '0 0 auto',
    padding: '12px',
    backgroundColor: 'rgba(245, 245, 245, 0.9)',
    borderRadius: '8px',
  },
  info: {
    fontSize: '14px',
    marginBottom: '4px',
  },
  playerName: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'block',
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#17202a',
  },
  // 修改原有的 playerStats
  playerStats: {
    display: 'flex',
    flexDirection: 'column', // 改为纵向排列
    gap: '4px',
    marginTop: '2px',
  },

  // ================= 新增以下样式 =================
  statRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  statLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#333',
    whiteSpace: 'nowrap',
  },
  statIcons: {
    fontSize: '12px',
    letterSpacing: '1px', // 让心心和四叶草之间留一点空隙
    wordBreak: 'break-word', // 如果心心太多会自动换行，不会撑破卡片
  },
  selfBuffPanel: {
    pointerEvents: 'auto',
    position: 'absolute',
    left: '14px',
    top: '130px',
    maxHeight: 'calc(100vh - 340px)',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    paddingRight: '4px',
  },
  bossBuffPanel: {
    pointerEvents: 'auto',
    position: 'absolute',
    right: '14px',
    top: '130px',
    maxHeight: 'calc(100vh - 340px)',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    paddingLeft: '4px',
    alignItems: 'flex-end',
  },
  selfBuffFrame: {
    width: '144px',
    height: '60px',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '9px 19px 9px 22px',
    backgroundImage: assetCssUrl('assets/buff/frame.png'),
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
    filter: 'drop-shadow(0 5px 10px rgba(0, 0, 0, 0.36))',
    boxSizing: 'border-box',
  },
  selfBuffDuration: {
    minWidth: '34px',
    color: '#e9e1c8',
    fontSize: '21px',
    fontWeight: 900,
    lineHeight: 1,
    textAlign: 'center',
    textShadow: '0 2px 2px rgba(0, 0, 0, 0.8)',
  },
  selfBuffIcon: {
    width: '39px',
    height: '39px',
    objectFit: 'contain',
    imageRendering: 'auto',
    filter: 'drop-shadow(0 2px 2px rgba(0, 0, 0, 0.55))',
  },
  bottomBarButton: {
    flex: '0 0 111px',
    width: '111px',
    height: '111px',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    backgroundColor: 'transparent',
    backgroundImage: `url("${BOTTOM_BAR_ASSET_BASE}/frame.png")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
    backgroundSize: '100% 100%',
    cursor: 'pointer',
    imageRendering: 'pixelated',
    filter: 'drop-shadow(0 5px 8px rgba(0, 0, 0, 0.32))',
    boxSizing: 'border-box',
  },
  bottomBarLogo: {
    width: '72px',
    height: '72px',
    objectFit: 'contain',
    imageRendering: 'pixelated',
    pointerEvents: 'none',
  },
  actionTile: {
    width: '112px',
    minHeight: '92px',
    padding: '10px 8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    border: '1px solid rgba(255, 255, 255, 0.58)',
    borderRadius: '8px',
    color: '#ffffff',
    cursor: 'pointer',
    boxShadow: '0 5px 14px rgba(0, 0, 0, 0.22)',
  },
  disabledActionTile: {
    opacity: 0.55,
    cursor: 'not-allowed',
    filter: 'grayscale(0.28)',
  },
  diceActionTile: {
    backgroundColor: 'rgba(38, 132, 255, 0.92)',
  },
  itemActionTile: {
    backgroundColor: 'rgba(95, 108, 125, 0.92)',
  },
  skillActionTile: {
    backgroundColor: 'rgba(126, 87, 194, 0.92)',
  },
  actionIcon: {
    width: '34px',
    height: '34px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    fontSize: '25px',
    lineHeight: 1,
  },
  actionLabel: {
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '14px',
    fontWeight: 800,
  },
  actionMeta: {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.82)',
  },
  diceOverlay: {
    pointerEvents: 'none',
    position: 'absolute',
    left: '50%',
    top: '52%',
    transform: 'translate(-50%, -50%)',
    overflow: 'visible',
    padding: '14px 18px',
    borderRadius: '8px',
    backgroundColor: 'rgba(12, 18, 26, 0.48)',
    backdropFilter: 'blur(4px)',
    boxShadow: '0 18px 42px rgba(0, 0, 0, 0.32)',
  },
  diceImage: {
    position: 'relative',
    zIndex: 1,
    width: '192px',
    height: '156px',
    display: 'block',
    objectFit: 'contain',
    imageRendering: 'pixelated',
    filter: 'drop-shadow(0 10px 0 rgba(0, 0, 0, 0.26)) drop-shadow(0 18px 22px rgba(0, 0, 0, 0.28))',
  },
  diceUpgradeSparkle: {
    position: 'absolute',
    zIndex: 0,
    left: '50%',
    top: '50%',
    width: '256px',
    height: '208px',
    transform: 'translate(-50%, -50%)',
    backgroundImage: assetCssUrl('assets/effects/sparkle.png'),
    backgroundRepeat: 'no-repeat',
    backgroundPosition: '0 0',
    backgroundSize: '1280px 208px',
    imageRendering: 'pixelated',
    opacity: 0.92,
    pointerEvents: 'none',
  },
  diceResultNumber: {
    pointerEvents: 'none',
    position: 'absolute',
    left: '50%',
    top: 'calc(52% - 145px)',
    transform: 'translateX(-50%) scaleX(1.22) scaleY(0.82)',
    transformOrigin: 'center center',
    fontFamily: 'Zpix, monospace',
    fontSize: '58px',
    fontWeight: 1000,
    lineHeight: 0.86,
  },
  diceSprite: {
    width: '192px',
    height: '156px',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: '0 0',
    backgroundSize: '1152px 156px',
    imageRendering: 'pixelated',
    filter: 'drop-shadow(0 10px 0 rgba(0, 0, 0, 0.26)) drop-shadow(0 18px 22px rgba(0, 0, 0, 0.28))',
  },
  diceOverlayText: {
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 800,
    textShadow: '0 2px 6px rgba(0, 0, 0, 0.35)',
  },
  waiting: {
    fontSize: '16px',
    color: '#666',
  },
  decisionSection: {
    padding: '16px',
    backgroundColor: '#fff9c4',
    borderRadius: '8px',
    width: 'min(700px, calc(100vw - 40px))',
    pointerEvents: 'auto',
  },
  selectionPanel: {
    width: 'min(560px, calc(100vw - 40px))',
    minHeight: '320px',
    padding: '42px 34px 28px',
    backgroundImage: assetImageCssUrl('assets/frame/frame_choose.png'),
    backgroundSize: '700px auto',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    pointerEvents: 'auto',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    color: '#4f2f13',
    textShadow: '0 1px 0 rgba(255, 248, 229, 0.55)',
    filter: 'drop-shadow(0 18px 26px rgba(24, 12, 4, 0.36))',
  },
  decisionBackdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'auto',
  },
  decisionOptions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    marginTop: '16px',
  },
  selectionEyebrow: {
    alignSelf: 'flex-start',
    marginBottom: '8px',
    padding: '4px 10px',
    borderRadius: '999px',
    backgroundColor: 'rgba(124, 76, 31, 0.14)',
    color: '#8a5523',
    fontSize: '12px',
    fontWeight: 800,
    letterSpacing: '0.04em',
  },
  selectionChoiceButton: {
    padding: '12px 16px',
    minWidth: '148px',
    border: '1px solid rgba(126, 77, 34, 0.24)',
    borderRadius: '8px',
    background: 'linear-gradient(180deg, rgba(255, 251, 238, 0.94) 0%, rgba(249, 232, 198, 0.96) 100%)',
    color: '#5b3614',
    boxShadow: '0 8px 16px rgba(76, 44, 17, 0.14)',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '6px',
  },
  selectionFooter: {
    marginTop: '20px',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  selectionCancelButton: {
    padding: '10px 18px',
    border: '1px solid rgba(122, 88, 51, 0.28)',
    borderRadius: '8px',
    background: 'linear-gradient(180deg, rgba(136, 110, 82, 0.96) 0%, rgba(108, 83, 57, 0.98) 100%)',
    color: '#fff7ea',
    cursor: 'pointer',
    fontWeight: 800,
    boxShadow: '0 8px 16px rgba(32, 18, 8, 0.2)',
  },
  decisionButton: {
    padding: '10px 16px',
    backgroundColor: '#ff9800',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '3px',
    minWidth: '116px',
  },
  targetPlayerName: {
    fontSize: '15px',
    fontWeight: 800,
    lineHeight: 1.2,
    color: '#5b3614',
  },
  targetPlayerPosition: {
    fontSize: '12px',
    lineHeight: 1.2,
    opacity: 0.72,
    color: '#7b5331',
  },
  debugLogPanel: {
    pointerEvents: 'auto',
    position: 'absolute',
    left: '12px',
    bottom: '12px',
    width: 'min(380px, 35vw)',
    maxHeight: '40vh',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '8px',
    backgroundColor: 'rgba(12, 18, 26, 0.80)',
    backdropFilter: 'blur(8px)',
    boxShadow: '0 10px 28px rgba(0, 0, 0, 0.28)',
    overflow: 'hidden',
  },
  debugLogHeader: {
    padding: '6px 10px',
    fontSize: '12px',
    fontWeight: 800,
    color: '#b0bec5',
    borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
  },
  debugLogContent: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 0',
  },
  debugLogPending: {
    padding: '4px 10px',
    fontSize: '11px',
    color: '#78909c',
    fontFamily: 'inherit',
  },
  bossSection: {
    padding: '12px',
    backgroundColor: 'rgba(33, 37, 43, 0.9)',
    border: '1px solid rgba(239, 83, 80, 0.75)',
    borderRadius: '8px',
    color: '#f5f7fa',
  },
  bossHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '10px',
  },
  bossAvatar: {
    flex: '0 0 38px',
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    backgroundColor: '#1b1118',
    border: '2px solid rgba(255, 255, 255, 0.85)',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.28)',
    overflow: 'hidden',
    position: 'relative',
  },
  bossAvatarImage: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  bossTitleGroup: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  bossTitle: {
    fontSize: '16px',
    lineHeight: 1.2,
  },
  bossId: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: '#cfd8dc',
    fontSize: '12px',
  },
  bossStats: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '8px',
    color: '#fff3e0',
    fontSize: '13px',
    fontWeight: 700,
  },
  buffDots: {
    display: 'none',
  },
  buffDot: {
    display: 'none',
  },
};

export default BoardScene;
