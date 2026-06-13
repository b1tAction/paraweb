/**
 * DilemmaRaceMiniGame - Real-time online mini-game component
 *
 * Hybrid layout: Phaser canvas renders the map + characters + popup,
 * React renders timer, legend, and dice choice buttons.
 * All state comes from Colyseus room state sync.
 */

import * as Phaser from 'phaser';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveCharacterProfile } from '../../game/characterRenderConfig';
import { DilemmaRaceTrackScene } from '../../game/DilemmaRaceTrackScene';
import { type ColyseusService, colyseusService, type DilemmaRaceRoomState } from '../../service/ColyseusService';
import { useGameStore } from '../../store/gameStore';
import type { MiniGameConn, Player } from '../../types/protocol';
import { assetUrl } from '../../utils/assets';
import { getDisambiguatedDisplayName } from '../../utils/displayName';
import { extractAvatarUrlFromProfile } from '../../utils/spriteAvatarExtractor';
import { dilemmaRaceStyles as styles } from './DilemmaRaceStyles';

// ========== Golden Dice Images ==========

const GOLD_DICE_IMAGES: Record<number, string> = {
  1: assetUrl('assets/dice/gold_result_1.png'),
  3: assetUrl('assets/dice/gold_result_3.png'),
  5: assetUrl('assets/dice/gold_result_5.png'),
};

const EMPTY_PARTICIPANT_IDS: string[] = [];

// ========== Props ==========

export interface DilemmaRaceMiniGameProps {
  connection: MiniGameConn;
  isParticipant: boolean;
  onlineService?: ColyseusService;
  playerId?: string;
  participantIds?: string[];
  participantPlayers?: Player[];
}

// ========== Phase type ==========

type LocalPhase = 'connecting' | 'choosing' | 'resolving' | 'finished' | 'error';

// ========== Main Component ==========

export const DilemmaRaceMiniGame: React.FC<DilemmaRaceMiniGameProps> = ({
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

  // Local render state
  const [phase, setPhase] = useState<LocalPhase>('connecting');
  const [roomState, setRoomState] = useState<DilemmaRaceRoomState | null>(null);
  const [error, setError] = useState<string>('');
  const [myChoice, setMyChoice] = useState<number | null>(null);
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

  // Avatar map for React legend display
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});

  // Phaser refs
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<DilemmaRaceTrackScene | null>(null);
  const latestSceneDataRef = useRef({
    roomState,
    players: renderPlayers,
    effectivePlayerId,
  });

  // Track previous round
  const prevRoundRef = useRef<number>(0);
  const lastResolutionPopupRoundRef = useRef<number>(0);

  latestSceneDataRef.current = {
    roomState,
    players: renderPlayers,
    effectivePlayerId,
  };

  // ========== Player display name mapping ==========

  const allPlayersData = useMemo(
    () =>
      renderPlayers.length > 0
        ? renderPlayers.map((p) => ({
            displayName: p.display_name || p.player_id,
            userId: p.player_id,
          }))
        : effectiveParticipantIds.map((id) => ({
            displayName: id === effectivePlayerId ? '我' : id.slice(0, 8),
            userId: id,
          })),
    [effectiveParticipantIds, effectivePlayerId, renderPlayers],
  );

  const getPlayerDisplayName = useCallback(
    (playerId: string) => {
      const playerInfo = renderPlayers.find((p) => p.player_id === playerId);
      const fallbackName = playerId === effectivePlayerId ? '我' : playerId.slice(0, 8);
      return getDisambiguatedDisplayName(playerInfo?.display_name || fallbackName, playerId, allPlayersData);
    },
    [renderPlayers, effectivePlayerId, allPlayersData],
  );

  // ========== Avatar extraction (for React legend) ==========

  useEffect(() => {
    if (effectiveParticipantIds.length === 0) return;

    let cancelled = false;

    Promise.all(
      effectiveParticipantIds.map(async (pid, order) => {
        const storePlayer = renderPlayers.find((p) => p.player_id === pid);
        if (!storePlayer) return { pid, url: '' };
        const profile = resolveCharacterProfile(storePlayer, order);
        const url = await extractAvatarUrlFromProfile(profile);
        return { pid, url };
      }),
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, string> = {};
      results.forEach(({ pid, url }) => {
        if (url) map[pid] = url;
      });
      setAvatarMap(map);
    });

    return () => {
      cancelled = true;
    };
  }, [effectiveParticipantIds, renderPlayers]);

  // ========== Phaser game lifecycle ==========

  const mountPhaserContainer = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (!node || gameRef.current) return;

    const latest = latestSceneDataRef.current;

    const initData = {
      storePlayers: latest.players,
      myPlayerId: latest.effectivePlayerId,
      trackLength: 15,
      onReady: (scene: DilemmaRaceTrackScene) => {
        sceneRef.current = scene;
        const latestSceneData = latestSceneDataRef.current;
        scene.updateFromReact(
          latestSceneData.roomState,
          latestSceneData.players,
          latestSceneData.effectivePlayerId,
          undefined,
        );
      },
    };

    const game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent: node,
      width: Math.max(1, node.clientWidth),
      height: Math.max(1, node.clientHeight),
      pixelArt: true,
      antialias: false,
      antialiasGL: false,
      roundPixels: true,
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      transparent: false,
      backgroundColor: '#7f9361',
    });

    game.scene.add('DilemmaRaceTrackScene', DilemmaRaceTrackScene, false, initData);
    game.scene.start('DilemmaRaceTrackScene', initData);
    gameRef.current = game;
  }, []);

  useEffect(() => {
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  // ========== Bridge React state → Phaser scene ==========

  useEffect(() => {
    const scene = gameRef.current?.scene.getScene('DilemmaRaceTrackScene') as DilemmaRaceTrackScene | undefined;
    if (!scene) return;
    sceneRef.current = scene;

    if (roomState) {
      scene.updateFromReact(roomState, renderPlayers, effectivePlayerId, undefined);
    }
  }, [roomState, renderPlayers, effectivePlayerId]);

  // ========== Trigger resolution popup when phase transitions ==========

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !roomState) return;

    if (phase === 'resolving' && roomState.currentRound !== lastResolutionPopupRoundRef.current) {
      lastResolutionPopupRoundRef.current = roomState.currentRound;

      // Tween characters to new positions
      scene.tweenPlayersToPositions(roomState.players);

      // Show resolution popup
      scene.showResolutionPopup(roomState.players, getPlayerDisplayName).catch((e) => {
        console.warn('[DilemmaRace] Popup error:', e);
      });
    }
  }, [getPlayerDisplayName, phase, roomState]);

  // ========== Colyseus connection lifecycle ==========

  useEffect(() => {
    if (!isParticipant) return;

    service.setCallbacks(
      (state: DilemmaRaceRoomState) => {
        setRoomState(state);
        if (state.phase === 'choosing') {
          setPhase('choosing');
          if (state.currentRound !== prevRoundRef.current) {
            prevRoundRef.current = state.currentRound;
            setMyChoice(null);
          }
        } else if (state.phase === 'resolving') {
          setPhase('resolving');
        } else if (state.phase === 'finished') {
          setPhase('finished');
        }
      },
      (err: Error) => {
        setPhase('error');
        setError(err.message);
        if (!onlineService) {
          useGameStore.getState().setColyseusError(err.message);
        }
      },
      (code: number) => {
        console.log('[DilemmaRace] Room left with code', code);
      },
    );

    service
      .joinRoom(connection, {
        playerId: effectivePlayerId,
        players: joinParticipantIds,
      })
      .catch((err) => {
        setPhase('error');
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        if (!onlineService) {
          useGameStore.getState().setColyseusError(message);
        }
      });

    return () => {
      void service.leaveRoom();
    };
  }, [connection, effectivePlayerId, isParticipant, joinParticipantIds, onlineService, service]);

  // ========== Choice handler ==========

  const handleChoice = useCallback(
    (step: number) => {
      if (phase === 'choosing') {
        service.sendChoice(step);
        setMyChoice(step);
      }
    },
    [phase, service],
  );

  // ========== Auto-submit default choice ==========

  useEffect(() => {
    if (phase === 'choosing' && roomState && roomState.timeLeft <= 2 && myChoice === null) {
      service.sendChoice(1);
      setMyChoice(1);
    }
  }, [myChoice, phase, roomState, service]);

  // ========== Render ==========

  if (!isParticipant) {
    return (
      <div style={styles.centerGameArea}>
        <p style={styles.waitingText}>旁观中, 等待比赛结束</p>
      </div>
    );
  }

  if (phase === 'connecting') {
    return (
      <div style={styles.centerGameArea}>
        <p style={styles.connectingText}>连接步步为营服务器</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div style={styles.centerGameArea}>
        <p style={styles.errorText}>连接失败: {error}</p>
        <p style={styles.waitingText}>等待服务器结算</p>
      </div>
    );
  }

  const state = roomState;
  if (!state) return null;

  const myPlayerState = state.players.find((p) => p.id === effectivePlayerId);

  return (
    <div style={styles.gameArea}>
      {/* ===== Header: Round & Timer ===== */}
      <div style={styles.headerRow}>
        <span style={styles.roundLabel}>Round {state.currentRound}</span>
        <div style={styles.playerLegendArea}>
          {state.players.map((p) => {
            const isMe = p.id === effectivePlayerId;
            const avatarSrc = avatarMap[p.id];
            return (
              <div key={p.id} style={isMe ? styles.playerLegendItemMe : styles.playerLegendItemOther}>
                {avatarSrc ? (
                  <div style={styles.playerAvatarContainer}>
                    <img
                      src={avatarSrc}
                      alt={getPlayerDisplayName(p.id)}
                      style={isMe ? styles.playerAvatarMe : styles.playerAvatarOther}
                    />
                    {p.isBlocked && <span style={styles.playerAvatarBadgeBlocked}>!</span>}
                    {p.isFinished && <span style={styles.playerAvatarBadgeFinished}>★</span>}
                  </div>
                ) : (
                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: '700',
                      color: isMe ? '#3498db' : '#e74c3c',
                      padding: '1px 4px',
                      borderRadius: '3px',
                      backgroundColor: isMe ? 'rgba(52, 152, 219, 0.2)' : 'rgba(231, 76, 60, 0.2)',
                    }}
                  >
                    {getPlayerDisplayName(p.id).charAt(0)}
                  </span>
                )}
                <span>{getPlayerDisplayName(p.id)}</span>
              </div>
            );
          })}
        </div>
        {phase === 'choosing' && <span style={styles.timerDisplay}>{state.timeLeft}s</span>}
        {phase === 'resolving' && <span style={styles.resolvingLabel}>结算中</span>}
        {phase === 'finished' && <span style={styles.resolvingLabel}>已结束</span>}
      </div>

      {/* ===== Phaser Canvas: Map + Characters + Popup ===== */}
      <div style={styles.phaserContainer}>
        <div
          ref={mountPhaserContainer}
          style={{ width: '100%', height: '100%', background: '#7f9361', overflow: 'hidden' }}
        />
      </div>

      {/* ===== Choice Buttons (choosing phase only) ===== */}
      {phase === 'choosing' && !myPlayerState?.isFinished && (
        <div style={styles.choiceArea}>
          <p style={styles.choicePrompt}>{myChoice !== null ? `已选 ${myChoice}步, 可更改` : '选择本轮步数'}</p>
          <div style={styles.choiceButtons}>
            {[1, 3, 5].map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => handleChoice(step)}
                style={myChoice === step ? styles.choiceButtonSelected : styles.choiceButton}
              >
                <img src={GOLD_DICE_IMAGES[step]} alt={`${step}步骰子`} style={styles.choiceDiceImage} />
                <span style={myChoice === step ? styles.choiceDiceLabelSelected : styles.choiceDiceLabel}>
                  {step}步
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ===== Finished ===== */}
      {phase === 'finished' && <p style={styles.finishedText}>比赛结束, 等待排名</p>}
      {phase !== 'finished' && myPlayerState?.isFinished && <p style={styles.finishedText}>已到达终点, 等待排名</p>}
    </div>
  );
};
