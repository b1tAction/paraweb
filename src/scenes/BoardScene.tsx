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

function isBossPlayer(player: Player) {
  return Boolean((player as Player & { is_boss?: boolean }).is_boss) || player.display_name === 'Boss';
}

type DiceRollView =
  | { status: 'idle' }
  | { status: 'awaiting_result'; playerId: string; diceType: string; startedAt: number }
  | { status: 'rolling'; playerId: string; diceType: string; startedAt: number; pendingResult: DiceRollResult }
  | { status: 'result'; playerId: string; diceType: string; steps: number };

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
  const shouldShowDiceOverlay = diceRollView.status === 'rolling' || diceRollView.status === 'result';
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
  }, [players, hasPendingAnimations]);

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
                    ...styles.playerCard,
                    borderColor: faction.color,
                    backgroundColor: faction.bgColor,
                  }}
                >
                  <div style={styles.avatarWrap}>
                    {avatars[player.player_id] ? (
                      <img
                        src={avatars[player.player_id]}
                        alt={player.display_name}
                        style={{
                          ...styles.avatar, // 复用你原有的圆形边框样式
                          backgroundColor: faction.color, // 垫底背景色
                          objectFit: 'cover',         // 填满圆形
                          objectPosition: 'center 15%', // 核心：向上偏移裁切，只保留头部和上半身！
                          boxShadow: isCurrentMainActionPlayer
                            ? `0 0 0 3px rgba(255, 255, 255, 0.95), 0 0 22px ${faction.color}`
                            : styles.avatar.boxShadow,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          ...styles.avatar,
                          backgroundColor: faction.color,
                          boxShadow: isCurrentMainActionPlayer
                            ? `0 0 0 3px rgba(255, 255, 255, 0.95), 0 0 22px ${faction.color}`
                            : styles.avatar.boxShadow,
                        }}
                      />
                    )}
                    {player.player_id === myPlayerId && <span style={styles.myAvatarBadge}>我</span>}
                  </div>
                  <div style={styles.playerCardBody}>
                    <div style={styles.playerCardHeader}>
                      <span title={player.player_id} style={styles.playerName}>
                        {player.display_name || player.player_id}
                      </span>
                    </div>
                    
                    {/* 1. 生命值与幸运值：转换为文字和图标 */}
                    <div style={styles.playerStats}>
                      <div style={styles.statRow} title={`生命值: ${player.hp}`}>
                        <span style={styles.statLabel}>生命值</span>
                        <span style={styles.statIcons}>
                          {'❤️'.repeat(Math.max(0, player.hp || 0))}
                        </span>
                      </div>
                      <div style={styles.statRow} title={`幸运值: ${player.lp}`}>
                        <span style={styles.statLabel}>幸运值</span>
                        <span style={styles.statIcons}>
                          {'🍀'.repeat(Math.max(0, player.lp || 0))}
                        </span>
                      </div>
                    </div>

                    {/* 2. Buff：一行一行列出详细效果 */}
                    <div style={styles.buffList} aria-label="Buffs">
                      {player.buffs && player.buffs.length > 0 ? (
                        player.buffs.map((buff, index) => (
                          <div key={`${buff.type}-${index}`} style={styles.buffRow}>
                            {/* 左侧颜色小圆点 */}
                            <span
                              style={{
                                ...styles.buffIndicator,
                                backgroundColor: getBuffColor(buff.type),
                              }}
                            />
                            {/* Buff 名称 */}
                            <span style={styles.buffName}>{buff.name}</span>
                            {/* Buff 效果描述 */}
                            <span style={styles.buffEffect}>
                              {BUFF_EFFECTS[buff.type] || '暂无效果说明'}
                            </span>
                            {/* 剩余回合 */}
                            <span style={styles.buffDuration}>
                              {formatBuffDuration(buff.duration)}
                            </span>
                          </div>
                        ))
                      ) : null}
                    </div>
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
                ...styles.actionTile,
                ...styles.diceActionTile,
                ...(!canInteractWithActions ? styles.disabledActionTile : null),
              }}
              title={`投 ${actionView.dice_type} 骰子`}
              disabled={!canInteractWithActions}
            >
              <span style={styles.actionIcon}>◇</span>
              <span style={styles.actionLabel}>投骰子</span>
              <span style={styles.actionMeta}>{actionView.dice_type}</span>
            </button>

            {actionView.items.map((item) => (
              <button
                key={item.id}
                onClick={() => handleUseItem(item)}
                style={{
                  ...styles.actionTile,
                  ...styles.itemActionTile,
                  ...(!canInteractWithActions ? styles.disabledActionTile : null),
                }}
                title={item.name}
                disabled={!canInteractWithActions}
              >
                <span style={styles.actionIcon}>□</span>
                <span style={styles.actionLabel}>{item.name}</span>
                <span style={styles.actionMeta}>道具</span>
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

        {shouldShowDiceOverlay && (
          <div style={styles.diceOverlay} aria-live="polite">
            <div
              className={diceRollView.status === 'rolling' ? 'paradice-dice-spinning' : undefined}
              style={{
                ...styles.diceCube,
                ...(diceRollView.status === 'result' ? styles.diceCubeResult : null),
              }}
            >
              {diceRollView.status === 'result' ? diceRollView.steps : '?'}
            </div>
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
    gap: '10px',
    overflowX: 'auto',
    paddingBottom: '4px',
  },
  playerCard: {
    flex: '0 0 clamp(220px, 22vw, 300px)',
    minWidth: 0,
    display: 'flex',
    // 将原本的 'center' 改为 'flex-start'，让头像和文字都从顶部开始对齐
    alignItems: 'flex-start', 
    gap: '10px',
    padding: '9px 10px',
    border: '2px solid transparent',
    borderRadius: '8px',
    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.18)',
    backdropFilter: 'blur(8px)',
  },
  avatar: {
    flex: '0 0 50px',
    width: '50px',
    height: '50px',
    borderRadius: '50%',
    border: '2px solid rgba(255, 255, 255, 0.85)',
  },
  avatarWrap: {
    position: 'relative',
    flex: '0 0 48px',
    width: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // 如果改成 flex-start 后觉得头像太靠上了，可以稍微加一点上边距把它往下压一点
    marginTop: '2px', 
  },
  myAvatarBadge: {
    position: 'absolute',
    right: '-2px',
    bottom: '-4px',
    padding: '1px 5px',
    borderRadius: '999px',
    backgroundColor: '#17202a',
    color: '#ffffff',
    border: '1px solid rgba(255, 255, 255, 0.9)',
    fontSize: '11px',
    fontWeight: 800,
    lineHeight: 1.35,
  },
  playerCardBody: {
    minWidth: 0,
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  playerCardHeader: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
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
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: 'rgba(18, 24, 32, 0.72)',
    backdropFilter: 'blur(8px)',
    boxShadow: '0 10px 28px rgba(0, 0, 0, 0.28)',
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
   buffList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginTop: '4px',
    // 设置最大高度，超出部分自动滚动
    maxHeight: '66px', // 差不多刚好显示 2 行半的高度
    overflowY: 'auto', // 超出自动出现滚动条
    paddingRight: '4px', // 给滚动条留一点点呼吸空间
  },
  buffRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 6px',
    backgroundColor: 'rgba(255, 255, 255, 0.45)', // 给每行 Buff 加一点半透明底色区分
    borderRadius: '4px',
    fontSize: '11px',
  },
  buffIndicator: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  buffName: {
    fontWeight: 'bold',
    color: '#1f2937',
    whiteSpace: 'nowrap',
  },
  buffEffect: {
    color: '#4b5563',
    flex: 1, // 让效果说明占据中间剩余空间
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis', // 如果效果文字太长，末尾显示省略号
  },
  buffDuration: {
    color: '#6b7280',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    flexShrink: 0,
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
    padding: '18px 22px',
    borderRadius: '8px',
    backgroundColor: 'rgba(12, 18, 26, 0.74)',
    backdropFilter: 'blur(6px)',
    boxShadow: '0 18px 42px rgba(0, 0, 0, 0.36)',
  },
  diceCube: {
    width: '86px',
    height: '86px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '14px',
    border: '3px solid rgba(255, 255, 255, 0.92)',
    backgroundColor: '#f8fafc',
    color: '#17202a',
    fontSize: '42px',
    fontWeight: 900,
    boxShadow: 'inset 0 -8px 0 rgba(0, 0, 0, 0.08), 0 10px 24px rgba(0, 0, 0, 0.32)',
  },
  diceCubeResult: {
    backgroundColor: '#fff3c4',
    color: '#1f2933',
    borderColor: '#f9c74f',
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
    fontFamily: 'monospace',
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
