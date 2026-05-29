/**
 * CakeCuttingMiniGame - Multiplayer turn-based cake cutting timing mini-game component
 *
 * Renders a rectangular cake segment, a vertical knife sliding left and right smoothly in real-time,
 * dynamic boundaries representing the remaining cake, and turn indicators.
 */

import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ColyseusService, colyseusService, type CakeCuttingRoomState } from '../../service/ColyseusService';
import { useGameStore } from '../../store/gameStore';
import type { MiniGameConn, Player } from '../../types/protocol';
import { getDisambiguatedDisplayName } from '../../utils/displayName';
import { cakeCuttingStyles as styles } from './CakeCuttingStyles';

// ========== Constants ==========

const EMPTY_PARTICIPANT_IDS: string[] = [];
const KNIFE_OSCILLATION_PERIOD_MS = 2500; // 2.5 seconds for a full oscillation cycle (0 -> 100 -> 0)

// ========== Props ==========

export interface CakeCuttingMiniGameProps {
  connection: MiniGameConn;
  isParticipant: boolean;
  onlineService?: ColyseusService;
  playerId?: string;
  participantIds?: string[];
  participantPlayers?: Player[];
}

type LocalPhase = 'connecting' | 'rules' | 'playing' | 'resolving_cut' | 'finished' | 'error';

export const CakeCuttingMiniGame: React.FC<CakeCuttingMiniGameProps> = ({
  connection,
  isParticipant,
  onlineService,
  playerId,
  participantIds,
  participantPlayers,
}) => {
  const { players, myPlayerId } = useGameStore();
  const service = onlineService ?? colyseusService;
  const effectivePlayerId = playerId ?? myPlayerId ?? '';

  // Local render states bridged from Colyseus service callbacks
  const [phase, setPhase] = useState<LocalPhase>('connecting');
  const [roomState, setRoomState] = useState<CakeCuttingRoomState | null>(null);
  const [error, setError] = useState<string>('');
  const [localKnifePos, setLocalKnifePos] = useState<number>(50); // 0 to 100

  const effectiveParticipantIds = participantIds ?? roomState?.players.map((p) => p.id) ?? EMPTY_PARTICIPANT_IDS;

  const renderPlayers = useMemo<Player[]>(() => {
    if (participantPlayers && participantPlayers.length > 0) return participantPlayers;
    if (players.length > 0) return players;

    return effectiveParticipantIds.map(
      (id) =>
        ({
          player_id: id,
          display_name: id === effectivePlayerId ? 'You' : id.slice(0, 8),
          faction: '',
          position: 0,
          hp: 0,
          max_hp: 8,
          lp: 0,
          buffs: [],
          items: [],
          charge: 0,
          fire_counter: 0,
          is_dead: false,
          skip_turn: false,
        }) as Player,
    );
  }, [effectiveParticipantIds, effectivePlayerId, participantPlayers, players]);

  // ========== Colyseus connection lifecycle ==========

  useEffect(() => {
    if (!isParticipant) return;

    service.setCallbacks(
      (state: CakeCuttingRoomState) => {
        setRoomState(state);

        // Derive state phase
        if (state.phase === 'rules') {
          setPhase('rules');
        } else if (state.phase === 'playing') {
          setPhase('playing');
        } else if (state.phase === 'resolving_cut') {
          setPhase('resolving_cut');
        } else if (state.phase === 'finished') {
          setPhase('finished');
        }
      },
      (err: Error) => {
        setPhase('error');
        setError(err.message);
        useGameStore.getState().setColyseusError(err.message);
      },
      (code: number) => {
        console.log('[CakeCutting] Room left with code', code);
      },
    );

    // Join/create Colyseus room
    service.joinRoom(connection, {
      playerId: effectivePlayerId,
      players: effectiveParticipantIds,
    }).catch((err) => {
      setPhase('error');
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      useGameStore.getState().setColyseusError(message);
    });

    return () => {
      void service.leaveRoom();
    };
  }, [connection, isParticipant, effectivePlayerId, service]);

  // ========== Real-time Local Knife Animation Loop ==========

  useEffect(() => {
    if (phase !== 'playing') return;

    let animFrameId: number;
    const startTimestamp = performance.now();

    const updateKnife = (now: number) => {
      const elapsed = now - startTimestamp;
      const progress = (elapsed % KNIFE_OSCILLATION_PERIOD_MS) / KNIFE_OSCILLATION_PERIOD_MS; // 0.0 to 1.0

      // Triangular oscillation wave: 0 -> 100 -> 0
      const pos = progress < 0.5
        ? (progress * 2) * 100           // Left-to-Right: 0 to 100
        : (1 - (progress - 0.5) * 2) * 100; // Right-to-Left: 100 to 0

      setLocalKnifePos(pos);
      animFrameId = requestAnimationFrame(updateKnife);
    };

    animFrameId = requestAnimationFrame(updateKnife);
    return () => {
      cancelAnimationFrame(animFrameId);
    };
  }, [phase]);

  // ========== Cut action handler ==========

  const handleCut = useCallback(() => {
    if (phase !== 'playing' || !roomState) return;

    const isMyTurn = roomState.activePlayerId === effectivePlayerId;
    if (!isMyTurn) return;

    // Send the locked local coordinates to Colyseus server
    service.sendCutCake(localKnifePos);
  }, [phase, roomState, effectivePlayerId, localKnifePos, service]);

  // ========== Player display name mapping ==========

  const allPlayersData = useMemo(
    () =>
      renderPlayers.map((p) => ({
        displayName: p.display_name || p.player_id,
        userId: p.player_id,
      })),
    [renderPlayers],
  );

  const getPlayerDisplayName = useCallback(
    (idStr: string) => {
      const playerInfo = renderPlayers.find((p) => p.player_id === idStr);
      return getDisambiguatedDisplayName(playerInfo?.display_name || idStr, idStr, allPlayersData);
    },
    [renderPlayers, allPlayersData],
  );

  // ========== UI Render logic ==========

  if (!isParticipant) {
    return (
      <div style={styles.gameArea}>
        <p style={styles.spectatorMessage}>您正在旁观本场对局。请等待参与者进行切蛋糕游戏...</p>
      </div>
    );
  }

  if (phase === 'connecting') {
    return (
      <div style={styles.gameArea}>
        <p style={styles.spectatorMessage}>正在连接到切蛋糕小游戏服务器...</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div style={styles.gameArea}>
        <p style={{ ...styles.spectatorMessage, color: '#ff5e62' }}>连接失败: {error}</p>
        <p style={styles.spectatorMessage}>正在等待大厅同步对局结果...</p>
      </div>
    );
  }

  const state = roomState;
  if (!state) return null;

  // Active turn properties
  const myPlayerState = state.players.find((p) => p.id === effectivePlayerId);
  const isMeAlive = myPlayerState?.isAlive ?? true;
  const isMyTurn = state.activePlayerId === effectivePlayerId && isMeAlive;

  // ========== Render Rules Phase (15s Countdown) ==========

  if (phase === 'rules') {
    const isConfirmed = myPlayerState?.isReady || false;

    return (
      <div style={styles.gameArea}>
        <div style={styles.rulesPanel}>
          {/* Header Row: Title */}
          <div style={styles.rulesHeader}>
            <span style={styles.rulesTitleText}>📜 极速切蛋糕 · 游戏规则说明</span>
          </div>

          <div style={styles.rulesContentLayout}>
            {/* Left: Detailed Rules explanation */}
            <div style={styles.rulesExplainCard}>
              <h4 style={styles.rulesSectionTitle}>🔍 游戏玩法背景</h4>
              <p style={styles.rulesDescText}>
                这是一场考验手眼协调与取舍魄力的反应小游戏。多名玩家将轮流切割同一条美味的蛋糕，切口失误将导致出局。
              </p>
              
              <h4 style={styles.rulesSectionTitle}>🎮 核心玩法机制</h4>
              <ul style={styles.rulesBulletList}>
                <li style={styles.rulesBulletItem}>玩家按顺序 <strong>轮流切蛋糕</strong>。每人每回合限时 15 秒。</li>
                <li style={styles.rulesBulletItem}>屏幕中的 <strong>发光切刀</strong> 在轨道上以极速往复滑动。</li>
                <li style={styles.rulesBulletItem}><strong>保留较小一部分</strong>：蛋糕被切开后，系统会自动舍弃较大部分，仅<strong>保留较小的一侧蛋糕</strong>！蛋糕将在不断切割下急剧变小！</li>
                <li style={styles.rulesBulletItem}><strong>切割边界判定</strong>：如果下刀位置不在当前的蛋糕段上（切空），则该玩家<strong>立即出局并开启旁观</strong>。</li>
                <li style={styles.rulesBulletItem}>当所有人都确认规则或 15 秒倒计时结束，游戏将立刻正式开始。</li>
              </ul>
            </div>

            {/* Right: Player Readiness Checklist */}
            <div style={styles.rulesSideCard}>
              <div>
                <h4 style={styles.rulesChecklistTitle}>👥 玩家就绪状态</h4>
                <div style={styles.rulesChecklistGrid}>
                  {state.players.map((p) => {
                    const isMe = p.id === effectivePlayerId;
                    return (
                      <div
                        key={p.id}
                        style={isMe ? styles.rulesChecklistItemMe : styles.rulesChecklistItem}
                      >
                        <span style={isMe ? styles.rulesPlayerNameMe : styles.rulesPlayerName}>
                          {getPlayerDisplayName(p.id)} {isMe && '(我)'}
                        </span>
                        <span style={p.isReady ? styles.badgeReady : styles.badgeThinking}>
                          {p.isReady ? '✅ 已确认' : '⏳ 准备中'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                {isConfirmed ? (
                  <button type="button" disabled style={styles.rulesConfirmBtnDisabled}>
                    <span>✅ 已确认，等待中 ({state.timeLeft}s)...</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    style={styles.rulesConfirmBtn}
                    onClick={() => service.sendConfirmRules()}
                  >
                    <span>🤝 确认规则并进入游戏 ({state.timeLeft}s 后自动确认)</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========== Render Playing & Resolving & Finished Phases ==========

  // Sort players for visual lobby listing (alive first, then rank/eliminated order)
  const sortedLobbyPlayers = [...state.players].sort((a, b) => {
    if (a.isAlive && !b.isAlive) return -1;
    if (!a.isAlive && b.isAlive) return 1;
    return b.eliminatedRound - a.eliminatedRound;
  });

  return (
    <div style={styles.gameArea}>
      {/* ===== Header Row: Round & Timer ===== */}
      <div style={styles.headerRow}>
        <span style={styles.roundLabel}>切蛋糕挑战赛</span>
        {phase === 'playing' && (
          <span style={styles.timerDisplay}>
            {isMyTurn ? `⌛ 回合倒计时: ${state.timeLeft}s` : `⏳ 正在等待他人行动...`}
          </span>
        )}
        {phase === 'resolving_cut' && <span style={styles.statusText}>🎬 下刀结果揭晓中...</span>}
        {phase === 'finished' && <span style={styles.statusText}>🏆 对局结算结束</span>}
      </div>

      <div style={styles.containerLayout}>
        {/* ===== Left Column: Cake Board & Interactive Knife Slider ===== */}
        <div style={styles.leftPlayboard}>
          <div style={styles.cakeBoard}>
            <h3 style={styles.cakeTitle}>🎂 砧板上的草莓小蛋糕</h3>
            <p style={styles.cakeSubTitle}>
              当前蛋糕范围：[{Math.round(state.cakeStart)}% 至 {Math.round(state.cakeEnd)}%]
              （宽度：{Math.round(state.cakeEnd - state.cakeStart)}%）
            </p>

            {/* The Cake Track */}
            <div style={styles.cakeTrack}>
              {/* Render Cake Piece */}
              <div
                style={
                  phase === 'resolving_cut'
                    ? {
                        ...styles.cakeActiveZoneResolving,
                        left: `${state.cakeStart}%`,
                        width: `${state.cakeEnd - state.cakeStart}%`,
                      }
                    : {
                        ...styles.cakeActiveZone,
                        left: `${state.cakeStart}%`,
                        width: `${state.cakeEnd - state.cakeStart}%`,
                      }
                }
              />

              {/* Render Oscillating Knife Slider (only if playing) */}
              {phase === 'playing' && (
                <div style={{ ...styles.knifeLine, left: `${localKnifePos}%` }}>
                  <span style={styles.knifeHandle}>🔪</span>
                </div>
              )}

              {/* Render Miss/Success Cut Marker (during resolving phase) */}
              {phase === 'resolving_cut' && state.cutPosition >= 0 && (
                <div style={{ ...styles.lastCutMarker, left: `${state.cutPosition}%` }} />
              )}
            </div>

            {/* Turn Message Overlay & Button Action */}
            <div style={styles.actionArea}>
              {phase === 'playing' && (
                <>
                  {isMyTurn ? (
                    <>
                      <p style={{ ...styles.cakeSubTitle, color: '#ff4e88', fontWeight: 900, fontSize: '15px' }}>
                        👉 看准飞刀摆入蛋糕块的时机，切下它！
                      </p>
                      <button
                        type="button"
                        style={styles.cutButtonActive}
                        onClick={handleCut}
                      >
                        ⚡ 切蛋糕！(CUT)
                      </button>
                    </>
                  ) : (
                    <>
                      <p style={{ ...styles.cakeSubTitle, fontWeight: 800 }}>
                        {isMeAlive
                          ? `等待玩家 ${getPlayerDisplayName(state.activePlayerId)} 进行切割...`
                          : `💀 您已出局。正在观看其他玩家切割蛋糕...`}
                      </p>
                      <button type="button" disabled style={styles.cutButtonDisabled}>
                        ⏳ 等待他人行动...
                      </button>
                    </>
                  )}
                </>
              )}

              {phase === 'resolving_cut' && (
                <p style={{ ...styles.cakeSubTitle, color: '#ffd166', fontWeight: 900, fontSize: '15px' }}>
                  📢 切割完成！正在展示蛋糕割裂结果...
                </p>
              )}

              {phase === 'finished' && (
                <p style={{ ...styles.cakeSubTitle, color: '#2ecc71', fontWeight: 900, fontSize: '15px' }}>
                  🏆 比赛结束！分数已成功累积入大富翁总榜单。
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ===== Right Column: Real-Time Survival Lobby List ===== */}
        <div style={styles.rightRuleboard}>
          <h4 style={styles.rulesChecklistTitle}>📋 参赛者生存榜单</h4>
          <div style={styles.playerGrid}>
            {sortedLobbyPlayers.map((p) => {
              const isMe = p.id === effectivePlayerId;
              const isActive = state.activePlayerId === p.id && phase === 'playing';

              let cardStyle = styles.playerCard;
              if (isActive) cardStyle = styles.playerCardActive;
              if (!p.isAlive) cardStyle = styles.playerCardDead;

              return (
                <div key={p.id} style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={isMe ? styles.playerNameMe : styles.playerName}>
                      {getPlayerDisplayName(p.id)}
                    </span>
                    {isMe && <span style={styles.badgeMe}>我</span>}
                  </div>

                  <div>
                    {!p.isAlive ? (
                      <span style={styles.statusBadgeOut}>💀 出局 (第{p.rank}名)</span>
                    ) : isActive ? (
                      <span style={styles.statusBadgeActive}>👉 行动中</span>
                    ) : (
                      <span style={styles.statusBadgeWaiting}>⏳ 存活</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
