/**
 * TypingSpeedMiniGame - Multiplayer real-time typing speed timing mini-game component
 *
 * Renders Zhu Ziqing's "Spring" sentence, captures keyboard typing, turns completed characters grey
 * and untyped characters green, and displays all 4 players' progress tracks in real-time.
 */

import type React from 'react';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { type ColyseusService, colyseusService, type TypingSpeedRoomState } from '../../service/ColyseusService';
import { useGameStore } from '../../store/gameStore';
import type { MiniGameConn, Player } from '../../types/protocol';
import { getDisambiguatedDisplayName } from '../../utils/displayName';
import { typingSpeedStyles as styles } from './TypingSpeedStyles';

// ========== Constants ==========

const EMPTY_PARTICIPANT_IDS: string[] = [];

export interface TypingSpeedMiniGameProps {
  connection: MiniGameConn;
  isParticipant: boolean;
  onlineService?: ColyseusService;
  playerId?: string;
  participantIds?: string[];
  participantPlayers?: Player[];
}

type LocalPhase = 'connecting' | 'rules' | 'countdown' | 'playing' | 'finished' | 'error';

// Helper to determine if character is punctuation
const isPunctuationChar = (c: string) => {
  return "，。！；？：、”“（）,.!;?:() \"'".includes(c);
};

// Advanced lenient Chinese Punctuation matcher
const calculateMatchingPrefix = (input: string, target: string): number => {
  let matchLength = 0;
  let inputIdx = 0;

  while (matchLength < target.length) {
    const targetChar = target[matchLength];

    // Auto-advance punctuation: if target has punctuation, skip it!
    if (isPunctuationChar(targetChar)) {
      matchLength++;
      // If user typed it too, consume it from input
      if (inputIdx < input.length && isPunctuationChar(input[inputIdx])) {
        inputIdx++;
      }
      continue;
    }

    if (inputIdx >= input.length) {
      break;
    }

    const userChar = input[inputIdx];
    if (userChar === targetChar) {
      matchLength++;
      inputIdx++;
    } else {
      break; // Mismatch
    }
  }

  // Final sweep: if we're near the end and only punctuation remains, auto-complete
  while (matchLength < target.length && isPunctuationChar(target[matchLength])) {
    matchLength++;
  }

  return matchLength;
};

export const TypingSpeedMiniGame: React.FC<TypingSpeedMiniGameProps> = ({
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

  // Input states
  const [inputValue, setInputValue] = useState<string>('');
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Local render states bridged from Colyseus
  const [phase, setPhase] = useState<LocalPhase>('connecting');
  const [roomState, setRoomState] = useState<TypingSpeedRoomState | null>(null);
  const [error, setError] = useState<string>('');

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
      (state: TypingSpeedRoomState) => {
        setRoomState(state);

        // Derive state phase
        if (state.phase === 'rules') {
          setPhase('rules');
        } else if (state.phase === 'countdown') {
          setPhase('countdown');
        } else if (state.phase === 'playing') {
          setPhase('playing');
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
        console.log('[TypingSpeed] Room left with code', code);
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

  // Auto-focus input when game starts
  useEffect(() => {
    if (phase === 'playing') {
      inputRef.current?.focus();
    }
  }, [phase]);

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

  // ========== Typing input change handler ==========

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (phase !== 'playing' || !roomState) return;

    const val = e.target.value;
    setInputValue(val);

    const targetText = roomState.targetText;
    const matchCount = calculateMatchingPrefix(val, targetText);

    // Sync typing progress to server
    service.sendTypingProgress(matchCount);
  };

  // ========== UI Render logic ==========

  if (!isParticipant) {
    return (
      <div style={styles.gameArea}>
        <p style={styles.spectatorMessage}>您正在旁观本场对局。请等待参与者进行打字竞赛...</p>
      </div>
    );
  }

  if (phase === 'connecting') {
    return (
      <div style={styles.gameArea}>
        <p style={styles.spectatorMessage}>正在连接到打字竞速小游戏服务器...</p>
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

  // Derive typing statistics
  const targetText = state.targetText;
  const myPlayerState = state.players.find((p) => p.id === effectivePlayerId);
  const myTypedCount = myPlayerState?.typedCount || 0;
  const isFinished = myTypedCount === targetText.length;

  const currentMatchCount = calculateMatchingPrefix(inputValue, targetText);
  // A typo is detected if user typed more characters than the successfully matched prefix
  const hasTypo = inputValue.length > 0 && currentMatchCount < inputValue.length;

  // ========== Render Rules Phase (3s Auto-Start) ==========

  if (phase === 'rules') {
    return (
      <div style={styles.gameArea}>
        <div style={styles.rulesPanel}>
          <div style={styles.rulesHeader}>
            <span style={styles.rulesTitleText}>📜 极速打字赛 · 游戏规则说明</span>
          </div>

          <div style={styles.rulesContentLayout}>
            <div style={styles.rulesExplainCard}>
              <p style={styles.rulesDescText}>
                打字竞速是一场手速与眼力的极致狂飙！
              </p>

              <h4 style={{ ...styles.rulesSectionTitle, marginTop: '12px' }}>🎮 核心规则与操作：</h4>
              <ul style={styles.rulesBulletList}>
                <li style={styles.rulesBulletItem}>
                  在输入框内<strong>打出屏幕上的这句汉字</strong>。
                </li>
                <li style={styles.rulesBulletItem}>
                  已经输入的正确字词会变为<strong style={{ color: '#8da696' }}>灰色</strong>，剩余未打的字词保持<strong style={{ color: '#2ecc71' }}>鲜绿色</strong>。
                </li>
                <li style={styles.rulesBulletItem}>
                  <strong>智能符号过滤</strong>：中英文符号及标点将由系统自动判断并推进，您只需全力专注文字拼写！
                </li>
                <li style={styles.rulesBulletItem}>
                  打错字符输入框会亮起红光，需使用<strong>退格键 (Backspace)</strong> 进行修正后才能继续前进。
                </li>
                <li style={styles.rulesBulletItem}>
                  规则展示 3 秒后将<strong>自动开启 3 秒倒计时</strong>，请大家作好准备！
                </li>
              </ul>
            </div>

            <button type="button" disabled style={styles.rulesCountdownBtn}>
              <span>⏳ 游戏即将在 {state.timeLeft} 秒后自动开始...</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Sort players for track rendering (rank order or progress descending)
  const sortedTrackPlayers = [...state.players].sort((a, b) => {
    if (a.rank > 0 && b.rank > 0) return a.rank - b.rank;
    if (a.rank > 0) return -1;
    if (b.rank > 0) return 1;
    return b.progressPercent - a.progressPercent;
  });

  return (
    <div style={styles.gameArea}>
      {/* ===== 3-2-1 Preparation Countdown Overlay ===== */}
      {phase === 'countdown' && (
        <div style={styles.countdownOverlay}>
          <span style={styles.countdownText}>{state.timeLeft}</span>
          <span style={styles.countdownLabel}>准备，开始打字！</span>
        </div>
      )}

      {/* ===== Header Row: Status & Timer ===== */}
      <div style={styles.headerRow}>
        <span style={styles.roundLabel}>打字大作战</span>
        <span style={styles.timerDisplay}>
          {phase === 'playing' ? `⌛ 剩余时间: ${state.timeLeft}s` : `🏆 比赛结束`}
        </span>
      </div>

      <div style={styles.containerLayout}>
        {/* ===== Left: Typography Board ===== */}
        <div style={styles.leftPlayboard}>
          <div style={styles.typingCard}>
            <h3 style={styles.textTitle}>✍️ 请快速打出以下名句：</h3>

            {/* Target Chinese Text Display */}
            <div style={styles.sentenceContainer}>
              {targetText.split('').map((char, index) => {
                const isTyped = index < myTypedCount;
                const isPunc = isPunctuationChar(char);

                let charStyle = styles.charBase;
                if (isTyped) {
                  charStyle = { ...charStyle, ...styles.charTyped };
                } else {
                  charStyle = { ...charStyle, ...styles.charUntyped };
                }

                if (isPunc) {
                  charStyle = { ...charStyle, ...styles.charPunctuation };
                }

                return (
                  <span key={index} style={charStyle}>
                    {char}
                  </span>
                );
              })}
            </div>

            {/* Typing input */}
            <div style={styles.inputWrapper}>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                disabled={phase !== 'playing' || isFinished}
                onChange={handleInputChange}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={isFinished ? '🎉 拼写完成！等待他人...' : '在此处输入文本并按空格或标点推进...'}
                style={
                  hasTypo
                    ? {
                      ...styles.typingInput,
                      border: '2px solid #ff4444',
                      boxShadow: '0 0 15px rgba(255, 68, 68, 0.45)',
                      backgroundColor: 'rgba(255, 68, 68, 0.05)',
                    }
                    : isFocused
                      ? styles.typingInputFocus
                      : styles.typingInput
                }
              />
              {hasTypo && (
                <p style={{ ...styles.inputHelpText, color: '#ff4444' }}>
                  ⚠️ 输入有误！请按 Backspace 退格键删除错字后继续输入。
                </p>
              )}
              {isFinished && (
                <p style={{ ...styles.inputHelpText, color: '#2ecc71', fontWeight: 900 }}>
                  🌟 恭喜打字完成！
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ===== Right: Real-time Player Lanes ===== */}
        <div style={styles.rightRuleboard}>
          <h4 style={styles.raceHeader}>🏁 参赛者实时赛道</h4>

          <div style={styles.playerGrid}>
            {sortedTrackPlayers.map((p) => {
              const isMe = p.id === effectivePlayerId;
              const hasFinished = p.typedCount === targetText.length;

              return (
                <div
                  key={p.id}
                  style={hasFinished ? styles.playerCardFinished : styles.playerCard}
                >
                  {/* Name and badge metadata */}
                  <div style={styles.playerMeta}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={isMe ? styles.playerNameMe : styles.playerName}>
                        {getPlayerDisplayName(p.id)}
                      </span>
                      {isMe && <span style={styles.badgeMe}>我</span>}
                    </div>

                    {hasFinished ? (
                      <span style={styles.badgeRank}>🥇 第{p.rank}名</span>
                    ) : (
                      <span style={styles.badgeProgress}>{p.progressPercent}%</span>
                    )}
                  </div>

                  {/* Horizontal progress track */}
                  <div style={styles.trackWrapper}>
                    <div
                      style={{
                        ...styles.trackFill,
                        width: `${p.progressPercent}%`,
                        background: hasFinished
                          ? 'linear-gradient(90deg, #27ae60 0%, #2ecc71 100%)'
                          : 'linear-gradient(90deg, #f39c12 0%, #f1c40f 100%)',
                      }}
                    />
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
