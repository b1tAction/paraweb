/**
 * DiceRaceMiniGame - dice_race mini-game component
 *
 * Player rolls two dice, submits dice1 + dice2 as score.
 * Score descending ranking (higher score = better rank).
 */

import React, { useCallback, useRef, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { getDisambiguatedDisplayName } from '../../utils/displayName';
import { DICE_DOTS, styles } from './MiniGameStyles';

// ========== DiceFace Component ==========

interface DiceFaceProps {
  value: number;
  isRolling?: boolean;
  size?: number;
}
const DICE_FACE_CELLS = Array.from({ length: 9 }, (_, index) => ({ id: `dice-cell-${index}`, index }));

const DiceFace: React.FC<DiceFaceProps> = ({ value, isRolling = false, size = 80 }) => {
  const dotPositions = DICE_DOTS[value] || [];
  const dotSize = size * 0.18;
  const padding = size * 0.08;

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
        padding: padding,
        boxSizing: 'border-box',
        boxShadow: isRolling ? '0 4px 12px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.1)',
        transform: isRolling ? `rotate(${Math.random() * 30 - 15}deg)` : 'none',
        transition: isRolling ? 'none' : 'transform 0.3s ease-out',
      }}
    >
      {DICE_FACE_CELLS.map((cell) => {
        const hasDot = dotPositions.includes(cell.index);
        return (
          <div
            key={cell.id}
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

// ========== DiceRaceMiniGame Component ==========

type DiceRacePhase = 'idle' | 'rolling' | 'result';

export interface DiceRaceMiniGameProps {
  isParticipant: boolean;
  isSubmitting: boolean;
  submitError: string;
  onSubmit: (gameData: Record<string, unknown>) => void;
}

export const DiceRaceMiniGame: React.FC<DiceRaceMiniGameProps> = ({
  isParticipant,
  isSubmitting,
  submitError,
  onSubmit,
}) => {
  const { miniGameStart, miniGameResult, myPlayerId, players } = useGameStore();
  const [phase, setPhase] = useState<DiceRacePhase>('idle');
  const [dice1, setDice1] = useState<number>(1);
  const [dice2, setDice2] = useState<number>(1);
  const [displayDice1, setDisplayDice1] = useState<number>(1);
  const [displayDice2, setDisplayDice2] = useState<number>(1);
  const rollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);


  const handleRoll = useCallback(() => {
    const finalDice1 = Math.floor(Math.random() * 6) + 1;
    const finalDice2 = Math.floor(Math.random() * 6) + 1;
    setDice1(finalDice1);
    setDice2(finalDice2);
    setPhase('rolling');

    const rollDuration = 1500;
    const switchInterval = 150;
    let elapsed = 0;

    rollTimerRef.current = setInterval(() => {
      elapsed += switchInterval;
      if (elapsed >= rollDuration) {
        setDisplayDice1(finalDice1);
        setDisplayDice2(finalDice2);
        if (rollTimerRef.current) {
          clearInterval(rollTimerRef.current);
        }
        rollTimerRef.current = null;
        setPhase('result');

        // Auto-submit immediately
        const scoreValue = finalDice1 + finalDice2;
        onSubmit({ dice1: finalDice1, dice2: finalDice2, score: scoreValue });
        return;
      }
      setDisplayDice1(Math.floor(Math.random() * 6) + 1);
      setDisplayDice2(Math.floor(Math.random() * 6) + 1);
    }, switchInterval);
  }, [onSubmit]);

  const score = dice1 + dice2;

  return (
    <div style={styles.gameArea}>
      {phase === 'idle' && (
        <>
          <p style={{ fontSize: '14px', color: '#666', textAlign: 'center' }}>投两个骰子，点数总和越高排名越高！</p>
          <button
            type="button"
            onClick={handleRoll}
            style={isParticipant ? { ...styles.button, backgroundColor: '#2196F3' } : styles.buttonDisabled}
            disabled={!isParticipant}
          >
            投骰子
          </button>
        </>
      )}

      {phase === 'rolling' && (
        <>
          <div style={styles.diceRow}>
            <DiceFace value={displayDice1} isRolling={true} size={90} />
            <DiceFace value={displayDice2} isRolling={true} size={90} />
          </div>
          <p style={{ fontSize: '14px', color: '#888', textAlign: 'center' }}>投掷中...</p>
        </>
      )}

      {phase === 'result' && (
        <div style={{ ...styles.resultContainer, backgroundColor: 'transparent', padding: '16px', width: '100%' }}>
          <div style={styles.diceRow}>
            <DiceFace value={dice1} size={90} />
            <DiceFace value={dice2} size={90} />
          </div>
          <p style={styles.scoreDisplay}>
            分数： {dice1} + {dice2} = {score}
          </p>
          <p style={{ ...styles.submittedText, fontWeight: 'bold', margin: '8px 0' }}>
            {isSubmitting ? '正在提交...' : '成绩已提交！'}
          </p>

          <div style={styles.miniRankingList}>
            {(miniGameStart?.players || []).map((pId) => {
              const isMe = pId === myPlayerId;
              const playerInfo = players.find((p) => p.player_id === pId);
              const allPlayersData = players.map((p) => ({
                displayName: p.display_name || p.player_id,
                userId: p.player_id,
              }));
              const name = getDisambiguatedDisplayName(playerInfo?.display_name || pId, pId, allPlayersData);
              const resultEntry = miniGameResult?.rankings.find((r) => r.player_id === pId);
              const isFinished = !!resultEntry;
              const resScore =
                typeof resultEntry?.game_data?.score === 'number' ? resultEntry.game_data.score : null;

              return (
                <div key={pId} style={styles.miniRankingItem}>
                  <span style={{ fontWeight: isMe ? 'bold' : 'normal' }}>
                    {name} {isMe ? '(我)' : ''}
                  </span>
                  {isMe ? (
                    <span style={styles.statusFinished}>{score}分</span>
                  ) : isFinished ? (
                    <span style={styles.statusFinished}>{resScore ?? '?'}分</span>
                  ) : (
                    <span style={styles.statusPlaying}>正在投骰子...</span>
                  )}
                </div>
              );
            })}
          </div>

          <p style={{ fontSize: '14px', color: '#888', textAlign: 'center', marginTop: '8px' }}>
            {miniGameResult ? '全员挑战结束，即将跳转...' : '等待其他玩家结束...'}
          </p>
        </div>
      )}



      {submitError && <p style={styles.errorText}>{submitError}</p>}
    </div>
  );
};
