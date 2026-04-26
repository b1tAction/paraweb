/**
 * DiceRaceMiniGame - dice_race mini-game component
 *
 * Player rolls two dice, submits dice1 + dice2 as score.
 * Score descending ranking (higher score = better rank).
 */

import React, { useCallback, useRef, useState } from 'react';
import { DICE_DOTS, styles } from './MiniGameStyles';

// ========== DiceFace Component ==========

interface DiceFaceProps {
  value: number;
  isRolling?: boolean;
  size?: number;
}

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
        boxShadow: isRolling
          ? '0 4px 12px rgba(0,0,0,0.3)'
          : '0 2px 4px rgba(0,0,0,0.1)',
        transform: isRolling ? `rotate(${Math.random() * 30 - 15}deg)` : 'none',
        transition: isRolling ? 'none' : 'transform 0.3s ease-out',
      }}
    >
      {Array.from({ length: 9 }, (_, idx) => {
        const hasDot = dotPositions.includes(idx);
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

// ========== DiceRaceMiniGame Component ==========

type DiceRacePhase = 'idle' | 'rolling' | 'result';

export interface DiceRaceMiniGameProps {
  isParticipant: boolean;
  submitted: boolean;
  isSubmitting: boolean;
  submitError: string;
  onSubmit: (gameData: Record<string, any>) => void;
}

export const DiceRaceMiniGame: React.FC<DiceRaceMiniGameProps> = ({
  isParticipant,
  submitted,
  isSubmitting,
  submitError,
  onSubmit,
}) => {
  const [phase, setPhase] = useState<DiceRacePhase>('idle');
  const [dice1, setDice1] = useState<number>(1);
  const [dice2, setDice2] = useState<number>(1);
  const [displayDice1, setDisplayDice1] = useState<number>(1);
  const [displayDice2, setDisplayDice2] = useState<number>(1);
  const rollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset when submitted
  React.useEffect(() => {
    if (submitted) {
      if (rollTimerRef.current) {
        clearInterval(rollTimerRef.current);
        rollTimerRef.current = null;
      }
    }
  }, [submitted]);

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
        clearInterval(rollTimerRef.current!);
        rollTimerRef.current = null;
        setPhase('result');
        return;
      }
      setDisplayDice1(Math.floor(Math.random() * 6) + 1);
      setDisplayDice2(Math.floor(Math.random() * 6) + 1);
    }, switchInterval);
  }, []);

  const handleSubmit = useCallback(() => {
    const score = dice1 + dice2;
    onSubmit({ dice1, dice2, score });
  }, [dice1, dice2, onSubmit]);

  const score = dice1 + dice2;

  return (
    <div style={styles.gameArea}>
      {phase === 'idle' && (
        <>
          <p style={{ fontSize: '14px', color: '#666', textAlign: 'center' }}>
            Roll two dice! Higher sum = better rank!
          </p>
          <button
            onClick={handleRoll}
            style={isParticipant ? { ...styles.button, backgroundColor: '#2196F3' } : styles.buttonDisabled}
            disabled={!isParticipant}
          >
            Roll Dice
          </button>
        </>
      )}

      {phase === 'rolling' && (
        <>
          <div style={styles.diceRow}>
            <DiceFace value={displayDice1} isRolling={true} size={90} />
            <DiceFace value={displayDice2} isRolling={true} size={90} />
          </div>
          <p style={{ fontSize: '14px', color: '#888', textAlign: 'center' }}>
            Rolling...
          </p>
        </>
      )}

      {phase === 'result' && !submitted && (
        <>
          <div style={styles.diceRow}>
            <DiceFace value={dice1} size={90} />
            <DiceFace value={dice2} size={90} />
          </div>
          <p style={styles.scoreDisplay}>
            Score: {dice1} + {dice2} = {score}
          </p>
          <button
            onClick={handleSubmit}
            style={isSubmitting ? styles.buttonDisabled : { ...styles.button, backgroundColor: '#4CAF50' }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Result'}
          </button>
        </>
      )}

      {phase === 'result' && submitted && (
        <>
          <div style={styles.diceRow}>
            <DiceFace value={dice1} size={90} />
            <DiceFace value={dice2} size={90} />
          </div>
          <p style={styles.submittedText}>
            Submitted! Dice: {dice1} + {dice2} = {score}
          </p>
        </>
      )}

      {submitError && <p style={styles.errorText}>{submitError}</p>}
    </div>
  );
};