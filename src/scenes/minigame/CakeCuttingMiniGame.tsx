/**
 * CakeCuttingMiniGame - Multiplayer turn-based cake cutting timing mini-game component
 *
 * Renders a rectangular cake segment, a vertical knife sliding left and right smoothly in real-time,
 * dynamic boundaries representing the remaining cake, and turn indicators.
 */

import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type CakeCuttingRoomState, type ColyseusService, colyseusService } from '../../service/ColyseusService';
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

  const roomParticipantIds = useMemo(
    () => roomState?.players.map((player) => player.id) ?? EMPTY_PARTICIPANT_IDS,
    [roomState?.players],
  );
  const effectiveParticipantIds = participantIds ?? roomParticipantIds;
  const joinParticipantIds = participantIds;

  const renderPlayers = useMemo<Player[]>(() => {
    if (participantPlayers && participantPlayers.length > 0) return participantPlayers;
    if (effectiveParticipantIds.length === 0) return players;

    const playersById = new Map(players.map((player) => [player.player_id, player]));
    return effectiveParticipantIds.map((id) => {
      const player = playersById.get(id);
      if (player) return player;

      return {
        player_id: id,
        display_name: id === effectivePlayerId ? '我' : id.slice(0, 8),
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
      } as Player;
    });
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
    service
      .joinRoom(connection, {
        playerId: effectivePlayerId,
        players: joinParticipantIds,
      })
      .catch((err) => {
        setPhase('error');
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        useGameStore.getState().setColyseusError(message);
      });

    return () => {
      void service.leaveRoom();
    };
  }, [connection, isParticipant, effectivePlayerId, joinParticipantIds, service]);

  // ========== Real-time Local Knife Animation Loop ==========

  useEffect(() => {
    if (phase !== 'playing') return;

    let animFrameId: number;
    const startTimestamp = performance.now();

    const updateKnife = (now: number) => {
      const elapsed = now - startTimestamp;
      const progress = (elapsed % KNIFE_OSCILLATION_PERIOD_MS) / KNIFE_OSCILLATION_PERIOD_MS; // 0.0 to 1.0

      // Triangular oscillation wave: 0 -> 100 -> 0
      const pos =
        progress < 0.5
          ? progress * 2 * 100 // Left-to-Right: 0 to 100
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
        <p style={styles.spectatorMessage}>旁观中, 等待切蛋糕结束</p>
      </div>
    );
  }

  if (phase === 'connecting') {
    return (
      <div style={styles.gameArea}>
        <p style={styles.spectatorMessage}>连接切蛋糕服务器</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div style={styles.gameArea}>
        <p style={{ ...styles.spectatorMessage, color: '#b96d61' }}>连接失败: {error}</p>
        <p style={styles.spectatorMessage}>等待大厅同步</p>
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
            <span style={styles.rulesTitleText}>切蛋糕 / 规则</span>
          </div>

          <div style={styles.rulesContentLayout}>
            {/* Left: Detailed Rules explanation */}
            <div style={styles.rulesExplainCard}>
              <p style={styles.rulesDescText}>轮流下刀, 切空出局, 留到最后获胜</p>

              <ul style={styles.rulesBulletList}>
                <li style={styles.rulesBulletItem}>
                  每回合 <strong>15 秒</strong>
                </li>
                <li style={styles.rulesBulletItem}>
                  切开后只留 <strong>较小一侧</strong>
                </li>
                <li style={styles.rulesBulletItem}>
                  切空 <strong>立即出局</strong>
                </li>
              </ul>
            </div>

            {/* Right: Player Readiness Checklist */}
            <div style={styles.rulesSideCard}>
              <div>
                <h4 style={styles.rulesChecklistTitle}>准备</h4>
                <div style={styles.rulesChecklistGrid}>
                  {state.players.map((p) => {
                    const isMe = p.id === effectivePlayerId;
                    return (
                      <div key={p.id} style={isMe ? styles.rulesChecklistItemMe : styles.rulesChecklistItem}>
                        <span style={isMe ? styles.rulesPlayerNameMe : styles.rulesPlayerName}>
                          {getPlayerDisplayName(p.id)}
                          {isMe ? ' / 我' : ''}
                        </span>
                        <span style={p.isReady ? styles.badgeReady : styles.badgeThinking}>
                          {p.isReady ? '已确认' : '未确认'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                {isConfirmed ? (
                  <button type="button" disabled style={styles.rulesConfirmBtnDisabled}>
                    <span>已确认, 等待 {state.timeLeft}s</span>
                  </button>
                ) : (
                  <button type="button" style={styles.rulesConfirmBtn} onClick={() => service.sendConfirmRules()}>
                    <span>确认, {state.timeLeft}s 自动确认</span>
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
        <span style={styles.roundLabel}>切蛋糕</span>
        {phase === 'playing' && (
          <span style={styles.timerDisplay}>{isMyTurn ? `我的回合 ${state.timeLeft}s` : `等待行动`}</span>
        )}
        {phase === 'resolving_cut' && <span style={styles.statusText}>下刀结算中</span>}
        {phase === 'finished' && <span style={styles.statusText}>对局结束</span>}
      </div>

      <div style={styles.containerLayout}>
        {/* ===== Left Column: Cake Board & Interactive Knife Slider ===== */}
        <div style={styles.leftPlayboard}>
          <div style={styles.cakeBoard}>
            <h3 style={styles.cakeTitle}>切割区</h3>
            <p style={styles.cakeSubTitle}>
              范围 {Math.round(state.cakeStart)}% - {Math.round(state.cakeEnd)}% / 宽{' '}
              {Math.round(state.cakeEnd - state.cakeStart)}%
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
                  <span style={styles.knifeHandle}>切</span>
                </div>
              )}

              {/* Render Miss/Success Cut Marker (during resolving phase) */}
              {phase === 'resolving_cut' && state.cutPosition >= 0 && (
                <div style={{ ...styles.lastCutMarker, left: `${state.cutPosition}%` }} />
              )}
            </div>

            {/* Turn Message Overlay & Button Action */}
            <div style={styles.actionArea}>
              {phase === 'playing' &&
                (isMyTurn ? (
                  <>
                    <p style={{ ...styles.cakeSubTitle, color: '#d2ae6d', fontWeight: 900, fontSize: '15px' }}>
                      对准蛋糕下刀
                    </p>
                    <button type="button" style={styles.cutButtonActive} onClick={handleCut}>
                      切下
                    </button>
                  </>
                ) : (
                  <>
                    <p style={{ ...styles.cakeSubTitle, fontWeight: 800 }}>
                      {isMeAlive ? `等待 ${getPlayerDisplayName(state.activePlayerId)} 下刀` : `已出局, 观看下刀`}
                    </p>
                    <button type="button" disabled style={styles.cutButtonDisabled}>
                      等待
                    </button>
                  </>
                ))}

              {phase === 'resolving_cut' && (
                <p style={{ ...styles.cakeSubTitle, color: '#d2ae6d', fontWeight: 900, fontSize: '15px' }}>
                  切割完成, 展示结果
                </p>
              )}

              {phase === 'finished' && (
                <p style={{ ...styles.cakeSubTitle, color: '#7da86f', fontWeight: 900, fontSize: '15px' }}>
                  结束, 已计分
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ===== Right Column: Real-Time Survival Lobby List ===== */}
        <div style={styles.rightRuleboard}>
          <h4 style={styles.rulesChecklistTitle}>生存</h4>
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
                    <span style={isMe ? styles.playerNameMe : styles.playerName}>{getPlayerDisplayName(p.id)}</span>
                    {isMe && <span style={styles.badgeMe}>我</span>}
                  </div>

                  <div>
                    {!p.isAlive ? (
                      <span style={styles.statusBadgeOut}>第{p.rank}名出局</span>
                    ) : isActive ? (
                      <span style={styles.statusBadgeActive}>行动中</span>
                    ) : (
                      <span style={styles.statusBadgeWaiting}>存活</span>
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
