import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { getDisambiguatedDisplayName } from '../../utils/displayName';
import { styles } from './MiniGameStyles';

// Robust seeded PRNG
function xmur3(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(a: number) {
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(array: T[], rand: () => number): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const COLOR_MAP: Record<string, { name: string; value: string }> = {
  red: { name: '红', value: '#ff4d4d' },
  orange: { name: '橙', value: '#ffa64d' },
  yellow: { name: '黄', value: '#ffff4d' },
  green: { name: '绿', value: '#4dff4d' },
  cyan: { name: '青', value: '#4dffff' },
  blue: { name: '蓝', value: '#4d4dff' },
  purple: { name: '紫', value: '#a64dff' },
  black: { name: '黑', value: '#333333' },
  pink: { name: '粉', value: '#ff4dff' },
};

const COLORS = Object.keys(COLOR_MAP);
const RAINBOW_GRID_CELLS = Array.from({ length: 9 }, (_, index) => ({ id: `rainbow-cell-${index}`, index }));

export interface RainbowMemoryMiniGameProps {
  isParticipant: boolean;
  submitted: boolean;
  isSubmitting: boolean;
  submitError: string;
  onSubmit: (gameData: Record<string, unknown>) => void;
}

type Phase = 'memorize' | 'hide' | 'challenge' | 'finished';

export const RainbowMemoryMiniGame: React.FC<RainbowMemoryMiniGameProps> = ({
  isParticipant,
  submitted,
  isSubmitting,
  submitError,
  onSubmit,
}) => {
  const { matchId, round } = useGameStore();
  const [phase, setPhase] = useState<Phase>('memorize');
  const [countdown, setCountdown] = useState(6); // Memorize phase countdown in seconds
  const [gridColors, setGridColors] = useState<string[]>([]);
  const [targetColor, setTargetColor] = useState<string>('');
  const [finalTimeMs, setFinalTimeMs] = useState<number>(0);
  const [accuracy, setAccuracy] = useState<number>(0);

  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    const seed = `${matchId || 'rainbow'}_${round}`;
    const seedGen = xmur3(seed);
    const rand = mulberry32(seedGen());

    const shuffled = seededShuffle(COLORS, rand);
    setGridColors(shuffled);

    const targetIdx = Math.floor(rand() * shuffled.length);
    setTargetColor(shuffled[targetIdx]);

    setPhase('memorize');
    setCountdown(6);
  }, [matchId, round]);

  useEffect(() => {
    if (!isParticipant) return;

    if (phase === 'memorize') {
      if (countdown > 0) {
        const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
        return () => clearTimeout(timer);
      } else {
        setPhase('hide');
        setCountdown(1);
      }
    } else if (phase === 'hide') {
      if (countdown > 0) {
        const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
        return () => clearTimeout(timer);
      } else {
        setPhase('challenge');
        startTimeRef.current = Date.now();
      }
    }
  }, [countdown, phase, isParticipant]);

  const handleSquareClick = (color: string) => {
    if (phase !== 'challenge' || !isParticipant || submitted || isSubmitting) return;

    const endTime = Date.now();
    const duration = endTime - startTimeRef.current;
    const isCorrect = color === targetColor;
    const acc = isCorrect ? 1 : 0;

    setAccuracy(acc);
    setFinalTimeMs(duration);
    setPhase('finished');

    onSubmit({ accuracy: acc, time_ms: duration });
  };

  if (phase === 'finished') {
    const { miniGameStart, miniGameResult, myPlayerId, players } = useGameStore.getState();
    const participants = miniGameStart?.players || [];
    const allPlayersData = players.map((p) => ({
      displayName: p.display_name || p.player_id,
      userId: p.player_id,
    }));

    return (
      <div style={styles.mathGameContainer}>
        <h3 style={styles.resultTitle}>记忆挑战完成!</h3>
        <div style={styles.miniRankingList}>
          {participants.map((pId) => {
            const isMe = pId === myPlayerId;
            const playerInfo = players.find((p) => p.player_id === pId);
            const name = getDisambiguatedDisplayName(playerInfo?.display_name || pId, pId, allPlayersData);
            const resultEntry = miniGameResult?.rankings.find((r) => r.player_id === pId);
            const isFinished = !!resultEntry;
            const resultAccuracy =
              typeof resultEntry?.game_data?.accuracy === 'number' ? resultEntry.game_data.accuracy : null;
            const resultTimeMs =
              typeof resultEntry?.game_data?.time_ms === 'number' ? resultEntry.game_data.time_ms : null;

            return (
              <div key={pId} style={styles.miniRankingItem}>
                <span style={{ fontWeight: isMe ? 'bold' : 'normal' }}>
                  {name} {isMe ? '(我)' : ''}
                </span>
                {isMe ? (
                  <span style={styles.statusFinished}>
                    {accuracy === 1 ? '正确' : '错误'} | {(finalTimeMs / 1000).toFixed(2)}s
                  </span>
                ) : isFinished ? (
                  <span style={styles.statusFinished}>
                    {resultAccuracy === 1 ? '正确' : '错误'} |{' '}
                    {resultTimeMs === null ? '?' : (resultTimeMs / 1000).toFixed(2)}s
                  </span>
                ) : (
                  <span style={styles.statusPlaying}>正在记忆/答题...</span>
                )}
              </div>
            );
          })}
        </div>
        <p style={{ ...styles.gameDataDetail, fontSize: '14px', textAlign: 'center' }}>
          {isSubmitting ? '同步中...' : miniGameResult ? '全员挑战结束，即将跳转...' : '等待全员结束...'}
        </p>
        {submitError && <p style={{ color: 'red', fontSize: '12px', textAlign: 'center' }}>{submitError}</p>}
      </div>
    );
  }

  return (
    <div style={styles.mathGameContainer}>
      {/* <div style={styles.questionHeader}>
        <span>Rainbow Memory 彩虹记忆</span>
      </div> */}

      <div style={styles.challengeText}>
        {phase === 'memorize' ? (
          <span style={{ color: '#0056b3' }}>请记住颜色位置: {countdown}s</span>
        ) : phase === 'hide' ? (
          <span style={{ color: '#666' }}>准备...</span>
        ) : phase === 'challenge' ? (
          <>
            请点击{' '}
            <span style={{ ...styles.targetColorHighlight, backgroundColor: COLOR_MAP[targetColor].value }}>
              {COLOR_MAP[targetColor].name}
            </span>{' '}
            色块
          </>
        ) : (
          '挑战结束'
        )}
      </div>

      <div style={styles.rainbowGrid}>
        {RAINBOW_GRID_CELLS.map((cell) => {
          const color = gridColors[cell.index];
          return (
            <button
              type="button"
              key={cell.id}
              aria-label={color ? `选择${COLOR_MAP[color].name}色块` : '空色块'}
              style={{
                ...styles.colorSquare,
                backgroundColor: color && phase === 'memorize' ? COLOR_MAP[color].value : '#ffffff',
              }}
              onClick={() => {
                if (color) handleSquareClick(color);
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
