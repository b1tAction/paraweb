/**
 * CountSecondsMiniGame - count_seconds mini-game component
 *
 * Player estimates 5 seconds, submits elapsed time.
 * Deviation ascending ranking (closer to 5.0 = better rank).
 */

import type React from 'react';
import { useCallback, useState } from 'react';
import { styles } from './MiniGameStyles';

// ========== CountSecondsMiniGame Component ==========

type CountSecondsPhase = 'idle' | 'running' | 'stopped';

export interface CountSecondsMiniGameProps {
  isParticipant: boolean;
  submitted: boolean;
  isSubmitting: boolean;
  submitError: string;
  onSubmit: (gameData: Record<string, unknown>) => void;
}

export const CountSecondsMiniGame: React.FC<CountSecondsMiniGameProps> = ({
  isParticipant,
  submitted,
  isSubmitting,
  submitError,
  onSubmit,
}) => {
  const [phase, setPhase] = useState<CountSecondsPhase>('idle');
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  const handleStart = useCallback(() => {
    setStartTime(Date.now());
    setPhase('running');
  }, []);

  const handleStop = useCallback(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    setElapsedSeconds(elapsed);
    setPhase('stopped');
  }, [startTime]);

  const handleSubmit = useCallback(() => {
    const deviation = Math.abs(elapsedSeconds - 5.0);
    onSubmit({ elapsed: elapsedSeconds, deviation });
  }, [elapsedSeconds, onSubmit]);

  const deviation = phase === 'stopped' ? Math.abs(elapsedSeconds - 5.0) : null;

  const getDeviationColor = (dev: number | null) => {
    if (dev === null) return '#666';
    if (dev <= 0.2) return '#4CAF50'; // Perfect (Green)
    if (dev <= 0.8) return '#FF9800'; // Good (Orange)
    return '#f44336'; // Missed (Red)
  };

  return (
    <div style={styles.gameArea}>
      {phase === 'idle' && (
        <>
          <p style={{ fontSize: '14px', color: '#666', textAlign: 'center' }}>在脑子里数5秒，然后点击停止！</p>
          <button
            type="button"
            onClick={handleStart}
            style={
              isParticipant
                ? {
                    ...styles.button,
                    backgroundColor: '#2196F3',
                    backgroundImage: 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)',
                    boxShadow: '0 4px 6px rgba(33, 150, 243, 0.2)',
                  }
                : styles.buttonDisabled
            }
            disabled={!isParticipant}
          >
            开始
          </button>
        </>
      )}

      {phase === 'running' && (
        <>
          <p style={styles.timerDisplay}>???</p>
          <p style={{ fontSize: '14px', color: '#888', textAlign: 'center' }}>在脑子里数5秒...</p>
          <button
            type="button"
            onClick={handleStop}
            style={{
              ...styles.button,
              backgroundColor: '#f44336',
              backgroundImage: 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)',
              boxShadow: '0 4px 6px rgba(244, 67, 54, 0.2)',
              marginTop: '16px',
            }}
          >
            停止
          </button>
        </>
      )}

      {phase === 'stopped' && !submitted && (
        <>
          <p style={{ ...styles.resultDisplay, fontWeight: 'bold' }}>
            你的估计： <span style={{ color: '#2196F3' }}>{elapsedSeconds.toFixed(2)}秒</span>
          </p>
          <p style={{ ...styles.resultDisplay, fontWeight: 'bold', color: getDeviationColor(deviation) }}>
            偏差： {deviation?.toFixed(2) ?? '?'}秒 （目标：5.0秒）
          </p>
          <button
            type="button"
            onClick={handleSubmit}
            style={isSubmitting ? styles.buttonDisabled : { ...styles.button, backgroundColor: '#4CAF50' }}
            disabled={isSubmitting}
          >
            {isSubmitting ? '提交中...' : '提交结果'}
          </button>
        </>
      )}

      {phase === 'stopped' && submitted && (
        <div style={{ ...styles.resultContainer, backgroundColor: 'transparent', padding: '16px' }}>
          <p style={{ ...styles.submittedText, fontWeight: 'bold' }}>已提交！</p>
          <p style={{ fontSize: '16px', color: '#333' }}>
            估计值： <span style={{ color: '#2196F3' }}>{elapsedSeconds.toFixed(2)}秒</span>
          </p>
          <p style={{ fontSize: '16px', fontWeight: 'bold', color: getDeviationColor(deviation) }}>
            偏差： {deviation?.toFixed(2) ?? '?'}秒
          </p>
        </div>
      )}

      {submitError && <p style={styles.errorText}>{submitError}</p>}
    </div>
  );
};
