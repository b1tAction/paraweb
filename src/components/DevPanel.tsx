/**
 * DevPanel - DEV-mode floating debug panel
 *
 * Provides Scene jumping, mock data injection, and state inspection.
 * Only rendered in DEV mode (import.meta.env.DEV).
 */

import type React from 'react';
import { useCallback, useState } from 'react';
import { injectBoard, injectGameOver, injectGameOverSkipAni, injectMiniGame } from './devMockData';
import { Scene, useGameStore } from '../store/gameStore';

// ========== Scene list for dropdown ==========

const SCENE_OPTIONS: { value: Scene; label: string }[] = [
  { value: Scene.Home, label: 'Home (StartScene)' },
  { value: Scene.CreateRoom, label: 'CreateRoom' },
  { value: Scene.JoinRoom, label: 'JoinRoom' },
  { value: Scene.FactionSelect, label: 'FactionSelect' },
  { value: Scene.Lobby, label: 'Lobby' },
  { value: Scene.Loading, label: 'Loading' },
  { value: Scene.DiceAssign, label: 'DiceAssign' },
  { value: Scene.Board, label: 'Board' },
  { value: Scene.BossBattle, label: 'BossBattle' },
  { value: Scene.MiniGameSubmitRank, label: 'MiniGame' },
  { value: Scene.GameOver, label: 'GameOver' },
];

// ========== Preset inject buttons ==========

const PRESET_INJECTORS: { label: string; inject: () => void }[] = [
  { label: 'GameOver + Animation', inject: injectGameOver },
  { label: 'GameOver Skip Ani', inject: injectGameOverSkipAni },
  { label: 'Board + Mock', inject: injectBoard },
  { label: 'MiniGame + Mock', inject: injectMiniGame },
];

// ========== Component ==========

export const DevPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedScene, setSelectedScene] = useState<string>(Scene.Home);

  const currentScene = useGameStore((s) => s.currentScene);
  const globalState = useGameStore((s) => s.globalState);
  const turnState = useGameStore((s) => s.turnState);
  const playersCount = useGameStore((s) => s.players.length);

  const handleJumpToScene = useCallback(() => {
    useGameStore.getState().setScene(selectedScene as Scene);
  }, [selectedScene]);

  const handleReset = useCallback(() => {
    useGameStore.getState().resetMatchState();
  }, []);

  const handleReplayAnimation = useCallback(() => {
    const store = useGameStore.getState();
    if (store.gameOver && store.currentScene === Scene.GameOver) {
      store.setGameOverAnimationComplete(false);
    }
  }, []);

  return (
    <div style={styles.panelContainer}>
      {/* Collapsed toggle button */}
      <button
        type="button"
        style={styles.toggleButton}
        onClick={() => setIsOpen(!isOpen)}
        title={isOpen ? 'Close DevPanel' : 'Open DevPanel'}
      >
        DEV
      </button>

      {/* Expanded panel */}
      {isOpen && (
        <div style={styles.panel}>
          {/* State display */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Current State</div>
            <div style={styles.stateRow}>
              <span style={styles.stateLabel}>Scene:</span>
              <span style={styles.stateValue}>{currentScene}</span>
            </div>
            <div style={styles.stateRow}>
              <span style={styles.stateLabel}>Global:</span>
              <span style={styles.stateValue}>{globalState}</span>
            </div>
            <div style={styles.stateRow}>
              <span style={styles.stateLabel}>Turn:</span>
              <span style={styles.stateValue}>{turnState}</span>
            </div>
            <div style={styles.stateRow}>
              <span style={styles.stateLabel}>Players:</span>
              <span style={styles.stateValue}>{playersCount}</span>
            </div>
          </div>

          {/* Scene jump */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Scene Jump</div>
            <select
              value={selectedScene}
              onChange={(e) => setSelectedScene(e.target.value)}
              style={styles.select}
            >
              {SCENE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button type="button" style={styles.jumpButton} onClick={handleJumpToScene}>
              Jump
            </button>
          </div>

          {/* Preset injectors */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Inject Mock + Jump</div>
            {PRESET_INJECTORS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                style={styles.injectButton}
                onClick={preset.inject}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Quick actions */}
          <div style={styles.section}>
            <button type="button" style={styles.replayButton} onClick={handleReplayAnimation}>
              Replay GameOver Animation
            </button>
            <button type="button" style={styles.resetButton} onClick={handleReset}>
              Reset Match State
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ========== Styles ==========

const styles: Record<string, React.CSSProperties> = {
  panelContainer: {
    position: 'fixed',
    left: '8px',
    top: '8px',
    zIndex: 9999,
    fontFamily: 'monospace',
    fontSize: '12px',
    lineHeight: 1.4,
    userSelect: 'none',
  },
  toggleButton: {
    minWidth: '36px',
    minHeight: '24px',
    padding: '2px 8px',
    border: '1px solid rgba(255, 200, 100, 0.5)',
    borderRadius: '4px',
    backgroundColor: 'rgba(30, 30, 30, 0.85)',
    color: '#ffc864',
    fontSize: '11px',
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.05em',
  },
  panel: {
    marginTop: '4px',
    width: '240px',
    maxHeight: '80vh',
    overflowY: 'auto',
    padding: '10px',
    border: '1px solid rgba(255, 200, 100, 0.35)',
    borderRadius: '6px',
    backgroundColor: 'rgba(20, 22, 26, 0.92)',
    color: '#e0d8c0',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
  },
  section: {
    marginBottom: '10px',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#ffc864',
    marginBottom: '4px',
    borderBottom: '1px solid rgba(255, 200, 100, 0.2)',
  },
  stateRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '1px 0',
  },
  stateLabel: {
    color: '#9a9080',
    fontSize: '11px',
  },
  stateValue: {
    color: '#e8e0d0',
    fontSize: '11px',
    fontWeight: 600,
  },
  select: {
    width: '100%',
    padding: '4px 6px',
    border: '1px solid rgba(255, 200, 100, 0.3)',
    borderRadius: '3px',
    backgroundColor: 'rgba(40, 42, 48, 0.9)',
    color: '#e0d8c0',
    fontSize: '11px',
    fontFamily: 'monospace',
    cursor: 'pointer',
    marginBottom: '6px',
  },
  jumpButton: {
    width: '100%',
    padding: '4px',
    border: '1px solid rgba(100, 180, 255, 0.4)',
    borderRadius: '3px',
    backgroundColor: 'rgba(40, 80, 160, 0.6)',
    color: '#a0c8ff',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  injectButton: {
    width: '100%',
    padding: '4px',
    margin: '2px 0',
    border: '1px solid rgba(255, 180, 80, 0.35)',
    borderRadius: '3px',
    backgroundColor: 'rgba(80, 60, 20, 0.6)',
    color: '#ffb050',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  resetButton: {
    width: '100%',
    padding: '4px',
    border: '1px solid rgba(200, 80, 80, 0.35)',
    borderRadius: '3px',
    backgroundColor: 'rgba(80, 20, 20, 0.6)',
    color: '#ff8080',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  replayButton: {
    width: '100%',
    padding: '4px',
    margin: '2px 0',
    border: '1px solid rgba(100, 200, 100, 0.35)',
    borderRadius: '3px',
    backgroundColor: 'rgba(20, 80, 20, 0.6)',
    color: '#80ff80',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};

export default DevPanel;