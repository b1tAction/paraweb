/**
 * BoardScene - 主棋盘场景
 *
 * 显示游戏主界面，玩家可以进行回合操作
 */

import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { gameService } from '../service/NakamaService';
import { PhaserBoard } from '../components/PhaserBoard';
import type { Available, Player, Item } from '../types/protocol';
import { DebugLogEntry } from '../components/DebugLogEntry';
import {
  DICE_RESULT_DISPLAY_MS,
  DICE_ROLL_MIN_MS,
  applyLogEntryToPlayer,
  clonePlayer,
  getLatestDiceRollResult,
  getLogEntryAnimationDelay,
  getMetadataNumber,
  getMetadataString,
  type DiceRollResult,
} from '../game/logEntryPlayback';

const FACTION_META: Record<string, { label: string; color: string; bgColor: string }> = {
  qing_long: { label: '青龙', color: '#6ab86e', bgColor: 'rgb(220, 253, 222)' },
  zhu_que: { label: '朱雀', color: '#c62828', bgColor: 'rgba(246, 226, 226, 0.85)' },
  bai_hu: { label: '白虎', color: '#ffffff', bgColor: 'rgba(252, 251, 200, 0.96)' },
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

const BLUE_BUFFS = new Set(['divine', 'rain', 'exorcism', 'fire']);
const RED_BUFFS = new Set(['curse', 'lost', 'corrupt', 'poison']);
const PLAYER_CARD_SCALE = 3;
const PLAYER_CARD_SIZE = {
  width: 80 * PLAYER_CARD_SCALE,
  height: 32 * PLAYER_CARD_SCALE,
};
const PLAYER_CARD_IMAGES: Record<string, string> = {
  qing_long: '/assets/ui/player_card_qinglong.png',
  zhu_que: '/assets/ui/player_card_zhuque.png',
  bai_hu: '/assets/ui/player_card_baihu.png',
  xuan_wu: '/assets/ui/player_card_xuanwu.png',
};
const PLAYER_STAT_MAX = 8;
const BOTTOM_BAR_ASSET_BASE = '/assets/bottom_bar';
const BOTTOM_BAR_ITEM_ICONS: Record<string, string> = {
  any_door: 'any_door.png',
  dice_upgrade: 'dice_upgrade.png',
  reverse_clock: 'reverse_clock.png',
};

function getFactionMeta(faction: string) {
  return FACTION_META[faction] ?? { label: faction || '未知', color: '#607d8b', bgColor: 'rgba(230, 236, 240, 0.96)' };
}

function getBuffColor(type: string) {
  if (BLUE_BUFFS.has(type)) return '#1994d2';
  if (RED_BUFFS.has(type)) return '#d32f2f';
  if (type === 'hidden') return '#f5ad40';
  return '#9e9e9e';
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

function isBossPlayer(player: Player) {
  return Boolean((player as Player & { is_boss?: boolean }).is_boss) || player.display_name === 'Boss';
}

function getLogEntryKey(entry: { timestamp: string; action_type: string; target: string; source: string }) {
  return `${entry.timestamp}:${entry.action_type}:${entry.target}:${entry.source}`;
}

function getDiceAssetType(diceType: string) {
  return diceType === 'gold' || diceType === 'silver' || diceType === 'copper' || diceType === 'wood'
    ? diceType
    : 'wood';
}

function getDiceRotateSrc(diceType: string) {
  return `/assets/dice/${getDiceAssetType(diceType)}_rotate.png`;
}

function getDiceResultSrc(diceType: string, steps: number) {
  return `/assets/dice/${getDiceAssetType(diceType)}_result_${steps}.png`;
}

type DiceRollView =
  | { status: 'idle' }
  | { status: 'awaiting_result'; playerId: string; diceType: string; startedAt: number }
  | { status: 'rolling'; playerId: string; diceType: string; startedAt: number; pendingResult: DiceRollResult }
  | { status: 'result'; playerId: string; diceType: string; steps: number };

type DiceRollDisplayView = Exclude<DiceRollView, { status: 'idle' }>;

function getDiceAssetKey(view: DiceRollDisplayView) {
  if (view.status === 'result') {
    return `${view.playerId}:${view.diceType}:result:${view.steps}`;
  }
  return `${view.playerId}:${view.diceType}:rolling:${view.startedAt}`;
}

export const BoardScene: React.FC = () => {
  const {
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
    mapConfig,
  } = useGameStore();
  const [diceRollView, setDiceRollView] = useState<DiceRollView>({ status: 'idle' });
  const [handledDiceResultKey, setHandledDiceResultKey] = useState(
    () => getLatestDiceRollResult(playedEntries)?.key || ''
  );
  const [renderedPlayers, setRenderedPlayers] = useState<Player[]>(players);
  const [settlementPlayerId, setSettlementPlayerId] = useState<string | null>(null);
  const [settlementPlayerSnapshot, setSettlementPlayerSnapshot] = useState<Player | null>(null);
  const latestPlayersRef = useRef(players);
  const lastAppliedSettlementEntryRef = useRef('');
  const lastAppliedEntryRef = useRef('');
  const roundReadySentKeyRef = useRef('');
  const debugLogContentRef = useRef<HTMLDivElement>(null);

  // #region agent instrumentation - Hypothesis C
  useEffect(() => {
    fetch('http://127.0.0.1:7649/ingest/fd570d88-3ae3-47ed-8ee1-493b444c6f23', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '31c30f' },
      body: JSON.stringify({
        sessionId: '31c30f',
        location: 'BoardScene.tsx:mapConfig',
        message: 'mapConfig in BoardScene',
        data: { hasMapConfig: !!mapConfig, mapLength: mapConfig?.length, cells: mapConfig?.cells?.length },
        timestamp: Date.now(),
        runId: 'debug',
        hypothesisId: 'C'
      })
    }).catch(() => {});

  }, [mapConfig]);
  // #endregion

   // 1. 新增：存储所有玩家的头像 Base64 (以 playerId 为 key)
  const[avatars, setAvatars] = useState<Record<string, string>>({});
  const [itemTargetSelection, setItemTargetSelection] = useState<Item | null>(null);
  // 2. 新增：监听 Phaser 发过来的头像事件
  useEffect(() => {
    const handleAvatarUpdate = (e: any) => {
      const { playerId, avatarUrl } = e.detail;
      setAvatars(prev => ({ ...prev, [playerId]: avatarUrl }));
    };

    window.addEventListener('ui-player-avatar', handleAvatarUpdate);
    return () => {
      window.removeEventListener('ui-player-avatar', handleAvatarUpdate);
    };
  },[]);

  const isMyTurn = myPlayerId === currentPlayerId;

  /**
   * 处理掷骰子
   */
  const handleRollDice = () => {
    console.log('[BoardScene] 掷骰子');
    setDiceRollView({
      status: 'awaiting_result',
      playerId: currentPlayerId || myPlayerId,
      diceType: availableActions?.dice_type || 'wood',
      startedAt: Date.now(),
    });
    gameService.sendRollDice().catch((err) => {
      console.error('[BoardScene] 掷骰子失败', err);
      setDiceRollView({ status: 'idle' });
    });
  };

  /**
   * 处理使用技能
   */
  const handleUseSkill = () => {
    console.log('[BoardScene] 使用技能');
    gameService.sendUseSkill();
  };

  /**
   * 处理使用道具
   */
  const handleUseItem = (item: Item) => {
    if (item.type === 'reverse_clock') {
      setItemTargetSelection(item);
      return;
    }
    console.log('[BoardScene] 使用道具', item.id);
    gameService.sendUseItem(item.id);
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

  // 获取当前玩家对象
  const currentPlayer = renderedPlayers.find((p) => p.player_id === currentPlayerId);
  const boardPlayers = renderedPlayers.filter((player) => !isBossPlayer(player));
  const bossPlayer = renderedPlayers.find(isBossPlayer);
  const myPlayer = renderedPlayers.find((player) => player.player_id === myPlayerId);
  const myBuffs = myPlayer?.buffs ?? [];
  const isMainAction = turnState === 'main_action' || turnState === 'MainAction';
  const isTurnEndSettlement = turnState === 'turn_end' || turnState === 'TurnEnd';
  const isRoundEndWait = globalState === 'round_end_wait' || globalState === 'RoundEndWait';
  
  // ====================== 默认渲染操作 ====================== //
  const fallbackActions: Available | null =
    isMainAction && currentPlayer
      ? {
          dice_type: 'dice',
          items: currentPlayer.items || [],
          can_use_skill:
            (currentPlayer.faction === 'qing_long' || currentPlayer.faction === 'xuan_wu') &&
            currentPlayer.charge > 0,
        }
      : null;
  const actionView = availableActions || fallbackActions;
  const canInteractWithActions = isMyTurn && Boolean(availableActions);
  const shouldShowActionPanel =
    Boolean(actionView) &&
    isMainAction &&
    diceRollView.status !== 'awaiting_result' &&
    diceRollView.status !== 'rolling';
  const shouldShowDiceOverlay =
    diceRollView.status === 'awaiting_result' ||
    diceRollView.status === 'rolling' ||
    diceRollView.status === 'result';
  const hasPendingAnimations =
    pendingEntries.length > 0 ||
    diceRollView.status === 'rolling' ||
    diceRollView.status === 'result';
  const activeLogEntry =
    pendingEntries[0] && (pendingEntries[0].type === 'action' || pendingEntries[0].type === 'boss')
      ? pendingEntries[0]
      : null;
  const settlementPlayer = settlementPlayerId
    ? settlementPlayerSnapshot ||
      renderedPlayers.find((player) => player.player_id === settlementPlayerId) ||
      players.find((player) => player.player_id === settlementPlayerId) ||
      null
    : null;

  // ====================== 队列处理逻辑 ====================== //
  const stateSyncQueue = useGameStore((state) => state.stateSyncQueue);
  
  useEffect(() => {
    // 当存在没有执行完的动画或是正在扔骰子时，不触发下一次 StateSync 出队
    if (hasPendingAnimations) {
      return;
    }

    // 这里只有没有待播放动画且仍在队列里有待消费 StateSync
    if (stateSyncQueue.length > 0) {
       console.log(`[BoardScene] 拔出下一个 StateSync。剩余队列长度：${stateSyncQueue.length - 1}`);
       useGameStore.getState().applyNextStateSync();
       gameService['routeSceneByState']?.(useGameStore.getState().globalState); // trigger route check
    }

  }, [stateSyncQueue.length, hasPendingAnimations]);

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
    latestPlayersRef.current = players;
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

    setRenderedPlayers((current) =>
      current.map((player) => applyLogEntryToPlayer(player, latestPlayedEntry))
    );
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

    const firstEntry = pendingEntries[0];
    const delay = getLogEntryAnimationDelay(firstEntry);

    const timeoutId = window.setTimeout(() => {
      useGameStore.getState().playNextEntry();
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [pendingEntries]);

  // Auto-scroll debug log when new entries appear
  useEffect(() => {
    if (debugLogContentRef.current) {
      debugLogContentRef.current.scrollTop = debugLogContentRef.current.scrollHeight;
    }
  }, [playedEntries.length]);

  useEffect(() => {
    if (!activeLogEntry || activeLogEntry.action_type !== 'dice_roll') return;

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
  }, [activeLogEntry, handledDiceResultKey]);

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
    if (diceRollView.status !== 'result') return;

    const timeoutId = window.setTimeout(() => {
      setDiceRollView({ status: 'idle' });
    }, DICE_RESULT_DISPLAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [diceRollView]);

  useEffect(() => {
    const resetDiceView = () => setDiceRollView({ status: 'idle' });

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
            // followPlayerId={currentPlayerId || myPlayerId}
            followPlayerId={currentPlayerId}
            selfPlayerId={myPlayerId}
            activeLogEntry={activeLogEntry}
            settlementPlayer={settlementPlayer}
          />
        ) : (
          <div style={styles.mapMissing}>地图未加载 (mapConfig is null)</div>
        )}
      </div>

      <div style={styles.uiLayer}>
        <div style={styles.topHud}>
          <h2 style={styles.title}>主棋盘</h2>
          <div style={styles.playerBar} aria-label="玩家状态">
            {boardPlayers.map((player) => {
              const faction = getFactionMeta(player.faction);
              const isCurrentMainActionPlayer =
                player.player_id === currentPlayerId &&
                (turnState === 'main_action' || turnState === 'MainAction');

              return (
                <div
                  key={player.player_id}
                  style={{
                    ...styles.pixelPlayerCard,
                    backgroundImage: `url(${getPlayerCardImage(player.faction)})`,
                    filter: isCurrentMainActionPlayer
                      ? `drop-shadow(0 0 8px ${faction.color}) drop-shadow(0 0 2px #ffffff)`
                      : styles.pixelPlayerCard.filter,
                  }}
                  title={`${player.display_name || player.player_id}\nHP ${player.hp}/${PLAYER_STAT_MAX}\nLP ${player.lp}/${PLAYER_STAT_MAX}`}
                >
                  {avatars[player.player_id] && (
                    <img
                      src={avatars[player.player_id]}
                      alt={player.display_name || player.player_id}
                      style={styles.pixelPlayerAvatar}
                    />
                  )}
                  {player.player_id === myPlayerId && <span style={styles.pixelMyBadge}>我</span>}
                  <span
                    style={{
                      ...styles.pixelPlayerName,
                      backgroundColor: faction.bgColor,
                      borderColor: faction.color,
                      color: faction.color,
                    }}
                  >
                    {player.display_name || player.player_id}
                  </span>
                  <div style={styles.pixelHpTrack}>
                    <div
                      style={{
                        ...styles.pixelHpFill,
                        width: getFillPercent(player.hp, PLAYER_STAT_MAX),
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
                  <div style={styles.pixelBuffRow} aria-label="Buffs">
                    {player.buffs?.slice(0, 10).map((buff, index) => (
                      <span
                        key={`${buff.type}-${index}`}
                        title={`${buff.name || buff.type}\n${BUFF_EFFECTS[buff.type] || '暂无效果说明'}\n剩余回合: ${formatBuffDuration(buff.duration)}`}
                        style={{
                          ...styles.pixelBuffDot,
                          backgroundColor: getBuffColor(buff.type),
                        }}
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
            <p style={styles.info}>当前玩家：{currentPlayer?.display_name || currentPlayerId}</p>
          </div>
        </div>

        <div style={styles.sidePanels}>
          {bossPlayer && (
            <div style={styles.rightPanel}>
              <div style={styles.bossSection}>
                <div style={styles.bossHeader}>
                  <div style={styles.bossAvatar} />
                  <div style={styles.bossTitleGroup}>
                    <strong style={styles.bossTitle}>Boss</strong>
                    <span style={styles.bossId} title={bossPlayer.player_id}>
                      {bossPlayer.display_name || 'Boss'}
                    </span>
                  </div>
                </div>
                <div style={styles.bossStats}>
                  <span>HP {bossPlayer.hp}</span>
                  <span>LP {bossPlayer.lp}</span>
                  <span>位置 {bossPlayer.position}</span>
                </div>
                <div style={styles.buffDots} aria-label="Boss Buffs">
                  {bossPlayer.buffs.length > 0
                    ? bossPlayer.buffs.map((buff, index) => (
                        <span
                          key={`${buff.type}-${index}`}
                          title={`${buff.name}\n${BUFF_EFFECTS[buff.type] || '暂无效果说明'}\n剩余回合: ${formatBuffDuration(buff.duration)}\n`}
                          style={{
                            ...styles.buffDot,
                            backgroundColor: getBuffColor(buff.type),
                          }}
                        />
                      ))
                    : null}
                </div>
              </div>
            </div>
          )}
        </div>

        {myBuffs.length > 0 && (
          <div style={styles.selfBuffPanel} aria-label="我的 Buff">
            {myBuffs.map((buff, index) => (
              <div
                key={`${buff.type}-${index}`}
                style={styles.selfBuffFrame}
                title={`${buff.name}\n${BUFF_EFFECTS[buff.type] || '暂无效果说明'}\n剩余回合: ${formatBuffDuration(buff.duration)}`}
              >
                <span style={styles.selfBuffDuration}>{formatBuffDuration(buff.duration)}</span>
                <img
                  src={`/assets/buff/${buff.type}.png`}
                  alt={buff.name}
                  style={styles.selfBuffIcon}
                />
              </div>
            ))}
          </div>
        )}

        {shouldShowActionPanel && actionView && (
          <div style={styles.mapActionPanel}>
            {!isMyTurn && (
              <div style={styles.waitingActionText}>
                等待玩家 {currentPlayer?.display_name || currentPlayerId} 操作
              </div>
            )}
            <button
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
                <img
                  src={getBottomBarItemIcon(item.type)}
                  alt=""
                  draggable={false}
                  style={styles.bottomBarLogo}
                />
              </button>
            ))}

            {actionView.can_use_skill && (
              <button
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

        {diceRollView.status !== 'idle' && shouldShowDiceOverlay && (
          <div style={styles.diceOverlay} aria-live="polite">
            {diceRollView.status === 'result' ? (
              <img
                key={getDiceAssetKey(diceRollView)}
                src={getDiceResultSrc(diceRollView.diceType, diceRollView.steps)}
                alt=""
                style={styles.diceImage}
              />
            ) : (
              <div
                key={getDiceAssetKey(diceRollView)}
                className="paradice-dice-sprite-rolling"
                style={{
                  ...styles.diceSprite,
                  backgroundImage: `url(${getDiceRotateSrc(diceRollView.diceType)})`,
                }}
              />
            )}
          </div>
        )}

        {decisionRequest && (
          <div style={styles.decisionBackdrop}>
            <div style={styles.decisionSection}>
              <h3>{decisionRequest.prompt}</h3>
              <p>{decisionRequest.context}</p>
              <div style={styles.decisionOptions}>
                {decisionRequest.options.map((option, index) => (
                  <button
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

        {itemTargetSelection && (
          <div style={styles.decisionBackdrop}>
            <div style={styles.decisionSection}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#333' }}>选择道具目标玩家</h3>
              <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#666' }}>
                请为道具 {itemTargetSelection.name} 选择一个作用目标
              </p>
              <div style={styles.decisionOptions}>
                {renderedPlayers.map((player) => (
                  <button
                    key={player.player_id}
                    onClick={() => {
                      console.log('[BoardScene] 选择目标使用了道具', itemTargetSelection.id, player.player_id);
                      gameService.sendUseItem(itemTargetSelection.id, player.player_id);
                      setItemTargetSelection(null);
                    }}
                    style={styles.decisionButton}
                  >
                    {player.display_name || player.player_id} {player.player_id === myPlayerId ? '(自己)' : ''}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: '16px', textAlign: 'right' }}>
                <button
                  onClick={() => setItemTargetSelection(null)}
                  style={{ ...styles.decisionButton, backgroundColor: '#9e9e9e', padding: '6px 12px' }}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Debug Log Panel - bottom-left */}
        <div style={styles.debugLogPanel}>
          <div style={styles.debugLogHeader}>
            Action Log R{storeRound}
          </div>
          <div ref={debugLogContentRef} style={styles.debugLogContent}>
            {playedEntries
              .filter(entry => entry.type === 'action' || entry.type === 'boss')
              .map((entry, index) => (
                <DebugLogEntry key={index} entry={entry} players={players} />
              ))}
            {pendingEntries.length > 0 && (
              <div style={styles.debugLogPending}>
                +{pendingEntries.length} pending...
              </div>
            )}
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
    top: `${11.5 * PLAYER_CARD_SCALE}px`,   // 虽然有点怪, 但是 11.5px 刚刚好捏
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
    padding: '1px 3px',
    backgroundColor: '#111827',
    color: '#fff4a8',
    border: '1px solid #fff4a8',
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
  selfBuffFrame: {
    width: '144px',
    height: '60px',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '9px 19px 9px 22px',
    backgroundImage: 'url("/assets/buff/frame.png")',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
    backgroundSize: '100% 100%',
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
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 18px',
    borderRadius: '8px',
    backgroundColor: 'rgba(12, 18, 26, 0.48)',
    backdropFilter: 'blur(4px)',
    boxShadow: '0 18px 42px rgba(0, 0, 0, 0.32)',
  },
  diceImage: {
    width: '192px',
    height: '156px',
    objectFit: 'contain',
    imageRendering: 'pixelated',
    filter: 'drop-shadow(0 10px 0 rgba(0, 0, 0, 0.26)) drop-shadow(0 18px 22px rgba(0, 0, 0, 0.28))',
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
    gap: '8px',
    marginTop: '12px',
  },
  decisionButton: {
    padding: '10px 16px',
    backgroundColor: '#ff9800',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
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
    backgroundColor: '#ef5350',
    border: '2px solid rgba(255, 255, 255, 0.85)',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.28)',
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
};

export default BoardScene;
