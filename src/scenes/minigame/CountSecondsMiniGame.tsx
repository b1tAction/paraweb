/**
 * CountSecondsMiniGame - count_seconds mini-game component
 *
 * Player estimates 5 seconds, submits elapsed time.
 * Deviation ascending ranking (closer to 5.0 = better rank).
 */

import React, { useCallback, useState } from 'react';
import { styles } from './MiniGameStyles';

// ========== CountSecondsMiniGame Component ==========

type CountSecondsPhase = 'idle' | 'running' | 'stopped';

export interface CountSecondsMiniGameProps {
  isParticipant: boolean;
  submitted: boolean;
  isSubmitting: boolean;
  submitError: string;
  onSubmit: (gameData: Record<string, any>) => void;
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

  return (
    <div style={styles.gameArea}>
      {phase === 'idle' && (
        <>
          <p style={{ fontSize: '14px', color: '#666', textAlign: 'center' }}>
            Count 5 seconds in your head, then click Stop!
          </p>
          <button
            onClick={handleStart}
            style={isParticipant ? { ...styles.button, backgroundColor: '#2196F3' } : styles.buttonDisabled}
            disabled={!isParticipant}
          >
            Start
          </button>
        </>
      )}

      {phase === 'running' && (
        <>
          <p style={styles.timerDisplay}>???</p>
          <p style={{ fontSize: '14px', color: '#888', textAlign: 'center' }}>
            Count 5 seconds in your head...
          </p>
          <button
            onClick={handleStop}
            style={{ ...styles.button, backgroundColor: '#f44336', marginTop: '16px' }}
          >
            Stop
          </button>
        </>
      )}

      {phase === 'stopped' && !submitted && (
        <>
          <p style={styles.resultDisplay}>
            Your estimate: {elapsedSeconds.toFixed(2)} seconds
          </p>
          <p style={styles.resultDisplay}>
            Deviation: {deviation!.toFixed(2)} seconds (target: 5.0)
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

      {phase === 'stopped' && submitted && (
        <p style={styles.submittedText}>
          Submitted! Estimate: {elapsedSeconds.toFixed(2)}s, deviation: {deviation!.toFixed(2)}s
        </p>
      )}

      {submitError && <p style={styles.errorText}>{submitError}</p>}
    </div>
  );
};