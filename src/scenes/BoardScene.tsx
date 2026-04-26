/**
 * BoardScene - 主棋盘场景
 *
 * 显示游戏主界面，玩家可以进行回合操作
 */

import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { gameService } from '../service/NakamaService';
import { PhaserBoard } from '../components/PhaserBoard';
import type { Available, Player, LogEntry } from '../types/protocol';
import { DebugLogEntry } from '../components/DebugLogEntry';

const DICE_ROLL_MIN_MS = 600;
const DICE_RESULT_DISPLAY_MS = 1200;
const ANIMATION_DELAY_MS = 300; // per action entry

const FACTION_META: Record<string, { label: string; color: string; bgColor: string }> = {
  qing_long: { label: '青龙', color: '#6ab86e', bgColor: 'rgba(224, 240, 225, 0.96)' },
  zhu_que: { label: '朱雀', color: '#c62828', bgColor: 'rgba(255, 220, 220, 0.96)' },
  bai_hu: { label: '白虎', color: '#f9c74f', bgColor: 'rgba(255, 243, 198, 0.96)' },
  xuan_wu: { label: '玄武', color: '#82aee0', bgColor: 'rgba(218, 235, 255, 0.96)' },
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
  if (BLUE_BUFFS.has(type)) return '#1976d2';
  if (RED_BUFFS.has(type)) return '#d32f2f';
  if (type === 'hidden') return '#757575';
  return '#9e9e9e';
}

function formatBuffDuration(duration: number) {
  return duration < 0 ? '永久' : `${duration}`;
}

function isBossPlayer(player: Player) {
  return Boolean((player as Player & { is_boss?: boolean }).is_boss) || player.display_name === 'Boss';
}

function getMetadataNumber(metadata: Record<string, any> | undefined, key: string) {
  const value = metadata?.[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getMetadataString(metadata: Record<string, any> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : '';
}

type DiceRollView =
  | { status: 'idle' }
  | { status: 'rolling'; playerId: string; diceType: string; startedAt: number; pendingResult?: DiceRollResult }
  | { status: 'result'; playerId: string; diceType: string; steps: number };

type DiceRollResult = {
  key: string;
  playerId: string;
  diceType: string;
  steps: number;
};

function getLatestDiceRollResult(entries: LogEntry[]): DiceRollResult | null {
  if (!entries || entries.length === 0) return null;

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.action_type !== 'dice_roll') continue;

    const steps = getMetadataNumber(entry.metadata, 'dice_steps');
    if (!steps) continue;

    return {
      key: `${entry.timestamp}:${entry.target}:${steps}`,
      playerId: entry.target,
      diceType: getMetadataString(entry.metadata, 'dice_type') || 'wood',
      steps,
    };
  }

  return null;
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
    turn: storeTurn,
    mapConfig,
  } = useGameStore();
  const [diceRollView, setDiceRollView] = useState<DiceRollView>({ status: 'idle' });
  const [handledDiceResultKey, setHandledDiceResultKey] = useState(
    () => getLatestDiceRollResult(playedEntries)?.key || ''
  );
  const [renderedPlayers, setRenderedPlayers] = useState<Player[]>(players);
  const latestPlayersRef = useRef(players);
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

  const isMyTurn = myPlayerId === currentPlayerId;

  /**
   * 处理掷骰子
   */
  const handleRollDice = () => {
    console.log('[BoardScene] 掷骰子');
    setDiceRollView({
      status: 'rolling',
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
  const handleUseItem = (itemId: string) => {
    console.log('[BoardScene] 使用道具', itemId);
    gameService.sendUseItem(itemId);
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
  const currentPlayer = players.find((p) => p.player_id === currentPlayerId);
  const boardPlayers = players.filter((player) => !isBossPlayer(player));
  const bossPlayer = players.find(isBossPlayer);
  const isMainAction = turnState === 'main_action' || turnState === 'MainAction';
  const normalizedGlobalState = String(globalState);
  const isTurnLoop = normalizedGlobalState === 'turn_loop' || normalizedGlobalState === 'TurnLoop';
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
    diceRollView.status !== 'rolling';
  const shouldShowDiceOverlay = diceRollView.status === 'rolling' || diceRollView.status === 'result';

  useEffect(() => {
    latestPlayersRef.current = players;
  }, [players]);

  // Animation player - processes pending entries one at a time
  // Action-type entries get animation delay, others skip immediately
  useEffect(() => {
    if (pendingEntries.length === 0) return;

    const firstEntry = pendingEntries[0];
    const isAction = firstEntry.type === 'action';
    const delay = isAction ? ANIMATION_DELAY_MS : 0;

    const timeoutId = window.setTimeout(() => {
      useGameStore.getState().playNextEntry();
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [pendingEntries.length]);

  // Auto-scroll debug log when new entries appear
  useEffect(() => {
    if (debugLogContentRef.current) {
      debugLogContentRef.current.scrollTop = debugLogContentRef.current.scrollHeight;
    }
  }, [playedEntries.length]);

  useEffect(() => {
    if (diceRollView.status !== 'idle') return;
    if (isTurnLoop && !isMainAction) return;

    setRenderedPlayers(players);
  }, [diceRollView.status, isMainAction, isTurnLoop, players]);

  useEffect(() => {
    const result = getLatestDiceRollResult(playedEntries);
    if (!result || result.key === handledDiceResultKey) return;

    setHandledDiceResultKey(result.key);

    setDiceRollView((current) => {
      if (current.status === 'rolling' && current.playerId === result.playerId) {
        return { ...current, pendingResult: result };
      }

      return {
        status: 'rolling',
        playerId: result.playerId,
        diceType: result.diceType,
        startedAt: Date.now(),
        pendingResult: result,
      };
    });
  }, [handledDiceResultKey, playedEntries]);

  useEffect(() => {
    if (diceRollView.status !== 'rolling' || !diceRollView.pendingResult) return;

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
      setRenderedPlayers(latestPlayersRef.current);
      setDiceRollView({ status: 'idle' });
    }, DICE_RESULT_DISPLAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [diceRollView]);

  return (
    <div style={styles.sceneRoot}>
      <div style={styles.boardLayer}>
        {mapConfig ? (
          <PhaserBoard
            mapConfig={mapConfig}
            players={renderedPlayers}
            followPlayerId={myPlayerId || currentPlayerId}
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
                    <div
                      style={{
                        ...styles.avatar,
                        backgroundColor: faction.color,
                        boxShadow: isCurrentMainActionPlayer
                          ? `0 0 0 3px rgba(255, 255, 255, 0.95), 0 0 22px ${faction.color}`
                          : styles.avatar.boxShadow,
                      }}
                    />
                    {player.player_id === myPlayerId && <span style={styles.myAvatarBadge}>我</span>}
                  </div>
                  <div style={styles.playerCardBody}>
                    <div style={styles.playerCardHeader}>
                      <span title={player.player_id} style={styles.playerName}>
                        {player.player_id}
                      </span>
                    </div>
                    <div style={styles.playerStats}>
                      <span>HP {player.hp}</span>
                      <span>LP {player.lp}</span>
                    </div>
                    <div style={styles.buffDots} aria-label="Buffs">
                      {player.buffs.length > 0 ? (
                        player.buffs.map((buff, index) => (
                          <span
                            key={`${buff.type}-${index}`}
                            title={`${buff.name}\n${BUFF_EFFECTS[buff.type] || '暂无效果说明'}\n剩余回合: ${formatBuffDuration(buff.duration)}\n`}
                            style={{
                              ...styles.buffDot,
                              backgroundColor: getBuffColor(buff.type),
                            }}
                          />
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
                      {bossPlayer.player_id}
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
                onClick={() => handleUseItem(item.id)}
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

        {/* Debug Log Panel - bottom-left */}
        <div style={styles.debugLogPanel}>
          <div style={styles.debugLogHeader}>
            Action Log R{storeRound}
          </div>
          <div ref={debugLogContentRef} style={styles.debugLogContent}>
            {playedEntries
              .filter(entry => entry.type === 'action')
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
    alignItems: 'center',
    gap: '10px',
    padding: '9px 10px',
    border: '2px solid transparent',
    borderRadius: '8px',
    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.18)',
    backdropFilter: 'blur(8px)',
  },
  avatar: {
    flex: '0 0 38px',
    width: '38px',
    height: '38px',
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
  playerStats: {
    display: 'flex',
    gap: '10px',
    fontSize: '13px',
    fontWeight: 700,
    color: '#263238',
  },
  buffDots: {
    minHeight: '24px',
    minWidth: '104px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 6px',
    borderRadius: '5px',
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
  },
  buffDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    border: '1px solid rgba(255, 255, 255, 0.85)',
    cursor: 'help',
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
