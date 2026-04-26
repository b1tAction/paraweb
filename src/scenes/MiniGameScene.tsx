/**
 * MiniGameScene - 小游戏场景
 *
 * 根据 game_type 渲染不同小游戏:
 * - dice_race: 投骰比大小 (投两个骰子, 提交两骰之和 score)
 * - count_seconds: 算秒游戏 (默数 5 秒, 提交实际估算时间)
 * - 其他 game_type: 占位提示
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { gameService } from '../service/NakamaService';

// ========== Dice Face Component ==========

// Dot positions for each dice face value (1-6) in a 3x3 grid
const DICE_DOTS: Record<number, number[][]> = {
  1: [[1, 1]],
  2: [[0, 2], [2, 0]],
  3: [[0, 2], [1, 1], [2, 0]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2]],
};

interface DiceFaceProps {
  value: number;
  isRolling?: boolean;
  size?: number;
}

const DiceFace: React.FC<DiceFaceProps> = ({ value, isRolling = false, size = 80 }) => {
  const dots = DICE_DOTS[value] || [];
  const dotSize = size * 0.18;

  return (
    <div
      style={{
        width: size,
        height: size,
        backgroundColor: '#fff',
        borderRadius: size * 0.12,
        border: `2px solid #333`,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gridTemplateRows: '1fr 1fr 1fr',
        padding: size * 0.08,
        boxSizing: 'border-box',
        boxShadow: isRolling
          ? '0 4px 12px rgba(0,0,0,0.3)'
          : '0 2px 4px rgba(0,0,0,0.1)',
        transform: isRolling ? `rotate(${Math.random() * 30 - 15}deg)` : 'none',
        transition: isRolling ? 'none' : 'transform 0.3s ease-out',
      }}
    >
      {/* 3x3 grid cells */}
      {Array.from({ length: 9 }, (_, idx) => {
        const row = Math.floor(idx / 3);
        const col = idx % 3;
        const hasDot = dots.some(([r, c]) => r === row && c === col);

        return (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {hasDot && (
              <div
                style={{
                  width: dotSize,
                  height: dotSize,
                  borderRadius: '50%',
                  backgroundColor: '#333',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

// ========== Game Phase Types ==========

type CountSecondsPhase = 'idle' | 'running' | 'stopped';
type DiceRacePhase = 'idle' | 'rolling' | 'result';

// ========== Main Component ==========

export const MiniGameSubmitRankScene: React.FC = () => {
  const { miniGameStart, miniGameResult, myPlayerId, session } = useGameStore();

  // Shared state
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // count_seconds state
  const [csPhase, setCsPhase] = useState<CountSecondsPhase>('idle');
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // dice_race state
  const [drPhase, setDrPhase] = useState<DiceRacePhase>('idle');
  const [dice1, setDice1] = useState<number>(1);
  const [dice2, setDice2] = useState<number>(1);
  const [displayDice1, setDisplayDice1] = useState<number>(1);
  const [displayDice2, setDisplayDice2] = useState<number>(1);
  const rollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startKey = useMemo(
    () => `${miniGameStart?.game_type || ''}:${(miniGameStart?.players || []).join(',')}`,
    [miniGameStart?.game_type, miniGameStart?.players]
  );

  // Reset all state when a new mini-game round starts
  useEffect(() => {
    setCsPhase('idle');
    setStartTime(0);
    setElapsedSeconds(0);
    setDrPhase('idle');
    setDice1(1);
    setDice2(1);
    setDisplayDice1(1);
    setDisplayDice2(1);
    setSubmitted(false);
    setIsSubmitting(false);
    setSubmitError('');
    if (rollTimerRef.current) {
      clearInterval(rollTimerRef.current);
      rollTimerRef.current = null;
    }
  }, [startKey]);

  const participantIds = miniGameStart?.players || [];
  const hasMiniGameStart = participantIds.length > 0;
  const myUserId = myPlayerId || session?.user_id || '';
  const isParticipant = hasMiniGameStart && participantIds.includes(myUserId);
  const gameType = miniGameStart?.game_type || '';

  // ========== Submit handler (shared) ==========

  const submitGameData = useCallback(async (gameData: Record<string, any>) => {
    if (!isParticipant || submitted) return;

    try {
      setSubmitError('');
      setIsSubmitting(true);
      console.log('[MiniGameScene] 提交小游戏数据', { gameType, gameData });
      await gameService.sendMiniGameDataSubmit(gameType, gameData);
      setSubmitted(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '提交小游戏数据失败';
      setSubmitError(message);
      console.error('[MiniGameScene] 提交失败', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [isParticipant, submitted, gameType]);

  // ========== count_seconds handlers ==========

  const handleCsStart = () => {
    const now = Date.now();
    setStartTime(now);
    setCsPhase('running');
  };

  const handleCsStop = () => {
    const now = Date.now();
    const elapsed = (now - startTime) / 1000;
    setElapsedSeconds(elapsed);
    setCsPhase('stopped');
  };

  const handleCsSubmit = () => {
    submitGameData({ elapsed: elapsedSeconds });
  };

  // ========== dice_race handlers ==========

  const handleDiceRoll = () => {
    // Generate final dice values
    const finalDice1 = Math.floor(Math.random() * 6) + 1;
    const finalDice2 = Math.floor(Math.random() * 6) + 1;
    setDice1(finalDice1);
    setDice2(finalDice2);
    setDrPhase('rolling');

    // Animate: rapidly switch displayed face values, then settle on final
    const rollDuration = 1500; // 1.5 seconds
    const switchInterval = 150; // switch face every 150ms

    let elapsed = 0;
    rollTimerRef.current = setInterval(() => {
      elapsed += switchInterval;

      if (elapsed >= rollDuration) {
        // Settle on final values
        setDisplayDice1(finalDice1);
        setDisplayDice2(finalDice2);
        clearInterval(rollTimerRef.current!);
        rollTimerRef.current = null;
        setDrPhase('result');
        return;
      }

      // Show random face during animation
      setDisplayDice1(Math.floor(Math.random() * 6) + 1);
      setDisplayDice2(Math.floor(Math.random() * 6) + 1);
    }, switchInterval);
  };

  const handleDiceSubmit = () => {
    const score = dice1 + dice2;
    submitGameData({ dice1, dice2, score });
  };

  // ========== render: dice_race ==========

  const renderDiceRace = () => {
    const score = dice1 + dice2;

    return (
      <div style={styles.gameArea}>
        {drPhase === 'idle' && (
          <>
            <p style={styles.gameInstruction}>
              投掷两个骰子，两骰之和越大排名越高！
            </p>
            <button
              onClick={handleDiceRoll}
              style={styles.actionButton}
              disabled={!isParticipant}
            >
              投骰子
            </button>
          </>
        )}

        {drPhase === 'rolling' && (
          <>
            <div style={styles.dicePair}>
              <DiceFace value={displayDice1} isRolling={true} size={90} />
              <DiceFace value={displayDice2} isRolling={true} size={90} />
            </div>
            <p style={styles.gameHint}>骰子滚动中...</p>
          </>
        )}

        {drPhase === 'result' && !submitted && (
          <>
            <div style={styles.dicePair}>
              <DiceFace value={dice1} size={90} />
              <DiceFace value={dice2} size={90} />
            </div>
            <p style={styles.scoreDisplay}>
              总分: {score}
            </p>
            <button
              onClick={handleDiceSubmit}
              style={styles.submitButton}
              disabled={isSubmitting}
            >
              {isSubmitting ? '提交中...' : '提交结果'}
            </button>
          </>
        )}

        {drPhase === 'result' && submitted && (
          <>
            <div style={styles.dicePair}>
              <DiceFace value={dice1} size={90} />
              <DiceFace value={dice2} size={90} />
            </div>
            <p style={styles.submitted}>
              已提交! 骰子: {dice1} + {dice2} = {score}
            </p>
          </>
        )}
      </div>
    );
  };

  // ========== render: count_seconds ==========

  const renderCountSeconds = () => {
    const deviation = csPhase === 'stopped' ? Math.abs(elapsedSeconds - 5.0) : null;

    return (
      <div style={styles.gameArea}>
        {csPhase === 'idle' && (
          <>
            <p style={styles.gameInstruction}>
              点击"开始"后，默数 5 秒，然后点击"停止"。
            </p>
            <button
              onClick={handleCsStart}
              style={styles.actionButton}
              disabled={!isParticipant}
            >
              开始
            </button>
          </>
        )}

        {csPhase === 'running' && (
          <>
            <p style={styles.bigQuestion}>???</p>
            <p style={styles.gameHint}>
              请在心里默数 5 秒...
            </p>
            <button
              onClick={handleCsStop}
              style={styles.stopButton}
            >
              停止
            </button>
          </>
        )}

        {csPhase === 'stopped' && !submitted && (
          <>
            <p style={styles.elapsedDisplay}>
              你的估算时间: {elapsedSeconds.toFixed(2)} 秒
            </p>
            <p style={styles.deviationDisplay}>
              偏差: {deviation!.toFixed(2)} 秒 (目标: 5.0 秒)
            </p>
            <button
              onClick={handleCsSubmit}
              style={styles.submitButton}
              disabled={isSubmitting}
            >
              {isSubmitting ? '提交中...' : '提交结果'}
            </button>
          </>
        )}

        {csPhase === 'stopped' && submitted && (
          <p style={styles.submitted}>
            已提交! 估算时间: {elapsedSeconds.toFixed(2)} 秒，偏差: {deviation!.toFixed(2)} 秒
          </p>
        )}
      </div>
    );
  };

  // ========== render: placeholder ==========

  const renderPlaceholder = () => (
    <div style={styles.gameArea}>
      <p style={styles.placeholder}>
        {gameType} 小游戏暂未实现，等待服务端自动处理...
      </p>
    </div>
  );

  // ========== render: result ==========

  const renderResult = () => {
    if (!miniGameResult) return null;
    return (
      <div style={styles.resultSection}>
        <h3 style={styles.resultTitle}>小游戏结果</h3>
        <div style={styles.rankingList}>
          {miniGameResult.rankings.map((entry) => (
            <div key={entry.player_id} style={styles.rankingEntry}>
              <span style={styles.rankBadge}>{entry.rank}</span>
              <span style={styles.rankName}>{entry.display_name}</span>
            </div>
          ))}
        </div>
        <p style={styles.resultNotice}>等待进入下一阶段...</p>
      </div>
    );
  };

  // ========== Game title ==========

  const getGameTitle = () => {
    switch (gameType) {
      case 'dice_race': return '投骰比大小';
      case 'count_seconds': return '算秒挑战';
      default: return `小游戏: ${gameType}`;
    }
  };

  // ========== Game renderer ==========

  const renderGame = () => {
    switch (gameType) {
      case 'dice_race': return renderDiceRace();
      case 'count_seconds': return renderCountSeconds();
      default: return renderPlaceholder();
    }
  };

  // Not a participant
  if (hasMiniGameStart && !isParticipant) {
    return (
      <div style={styles.container}>
        <h2 style={styles.title}>小游戏</h2>
        <p style={styles.description}>
          你不是本轮小游戏参与者，等待其他玩家完成...
        </p>
        {renderResult()}
      </div>
    );
  }

  // Waiting for mini-game start
  if (!hasMiniGameStart) {
    return (
      <div style={styles.container}>
        <h2 style={styles.title}>小游戏</h2>
        <p style={styles.description}>
          等待服务端同步小游戏参与者...
        </p>
      </div>
    );
  }

  // Main game render
  return (
    <div style={styles.container}>
      <h2 style={styles.title}>{getGameTitle()}</h2>
      {renderGame()}
      {submitError && <p style={styles.error}>{submitError}</p>}
      {renderResult()}
    </div>
  );
};

// ========== Styles ==========

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px',
    maxWidth: '500px',
    margin: '0 auto',
  },
  title: {
    textAlign: 'center',
    fontSize: '20px',
    marginBottom: '16px',
  },
  description: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#666',
    marginBottom: '24px',
  },
  gameArea: {
    textAlign: 'center',
    margin: '20px 0',
  },
  gameInstruction: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '24px',
  },
  gameHint: {
    fontSize: '14px',
    color: '#888',
    marginTop: '12px',
  },
  // dice_race specific
  dicePair: {
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
    margin: '20px 0',
  },
  scoreDisplay: {
    fontSize: '28px',
    fontWeight: 'bold',
    margin: '12px 0 24px 0',
  },
  // count_seconds specific
  bigQuestion: {
    fontSize: '72px',
    fontWeight: 'bold',
    margin: '24px 0',
    letterSpacing: '8px',
  },
  elapsedDisplay: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '8px',
  },
  deviationDisplay: {
    fontSize: '16px',
    color: '#666',
    marginBottom: '24px',
  },
  // shared buttons
  actionButton: {
    padding: '16px 32px',
    fontSize: '18px',
    color: 'white',
    backgroundColor: '#2196F3',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  stopButton: {
    padding: '16px 32px',
    fontSize: '18px',
    color: 'white',
    backgroundColor: '#f44336',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginTop: '16px',
  },
  submitButton: {
    padding: '16px 32px',
    fontSize: '18px',
    color: 'white',
    backgroundColor: '#4CAF50',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  submitted: {
    textAlign: 'center',
    fontSize: '16px',
    color: '#4CAF50',
    marginBottom: '24px',
  },
  placeholder: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#888',
  },
  // result section
  resultSection: {
    marginTop: '24px',
  },
  resultTitle: {
    textAlign: 'center',
    fontSize: '16px',
    marginBottom: '12px',
  },
  rankingList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  rankingEntry: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 0',
  },
  rankBadge: {
    fontSize: '16px',
    fontWeight: 'bold',
    backgroundColor: '#e0e0e0',
    borderRadius: '4px',
    padding: '2px 8px',
    minWidth: '30px',
    textAlign: 'center',
  },
  rankName: {
    fontSize: '14px',
  },
  resultNotice: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#666',
    marginTop: '12px',
  },
  error: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#d32f2f',
    marginBottom: '20px',
  },
};

export default MiniGameSubmitRankScene;