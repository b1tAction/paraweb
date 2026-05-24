/**
 * DilemmaRaceStyles - game-specific styles for the Dilemma Race mini-game
 *
 * Separated from MiniGameStyles.ts because the track visualization has
 * unique layout requirements (5x3 grid, cells, markers, choice buttons).
 * Reuses shared styles where applicable.
 */

import type { CSSProperties } from 'react';
import { styles as sharedStyles } from './MiniGameStyles';

export const dilemmaRaceStyles: Record<string, CSSProperties> = {
  // Reuse shared container
  gameArea: sharedStyles.gameArea,

  // ===== Header =====
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '8px 0',
  },
  roundLabel: {
    fontSize: '22px',
    fontWeight: 'bold',
    color: '#555',
  },
  timerDisplay: {
    fontSize: '30px',
    fontWeight: '800',
    color: '#e74c3c',
    fontFamily: 'monospace',
  },
  resolvingLabel: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#f39c12',
  },

  // ===== Track =====
  trackContainer: {
    width: '100%',
    margin: '16px 0',
  },
  trackGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '6px',
    padding: '8px',
    background: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)',
    borderRadius: '12px',
    boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.5)',
  },
  startCell: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
    color: '#27ae60',
    borderBottom: '2px solid #27ae60',
  },
  cell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    aspectRatio: '1 / 0.8',
    padding: '4px',
    borderRadius: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    fontSize: '12px',
    minHeight: '56px',
  },
  finishCell: {
    backgroundColor: 'rgba(255, 215, 0, 0.3)',
    border: '2px solid #FFD700',
  },
  cellNumber: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: '2px',
  },

  // ===== Player markers =====
  playerMarkerMe: {
    fontSize: '16px',
    fontWeight: '900',
    color: '#3498db',
    padding: '1px 4px',
    borderRadius: '3px',
    backgroundColor: 'rgba(52, 152, 219, 0.2)',
  },
  playerMarkerOther: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#e74c3c',
    padding: '1px 4px',
    borderRadius: '3px',
    backgroundColor: 'rgba(231, 76, 60, 0.2)',
  },
  blockedIcon: {
    color: '#f39c12',
    fontWeight: '900',
    fontSize: '10px',
  },
  finishedIcon: {
    color: '#FFD700',
    fontSize: '10px',
  },

  // ===== Choice Area =====
  choiceArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
  },
  choicePrompt: {
    fontSize: '18px',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  choiceButtons: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'center',
  },
  choiceButton: {
    width: '80px',
    height: '80px',
    fontSize: '28px',
    fontWeight: '900',
    borderRadius: '12px',
    border: '2px solid #3498db',
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
    color: '#3498db',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: '0 4px 8px rgba(52, 152, 219, 0.2)',
  },
  choiceButtonSelected: {
    width: '80px',
    height: '80px',
    fontSize: '28px',
    fontWeight: '900',
    borderRadius: '12px',
    border: '2px solid #27ae60',
    backgroundColor: 'rgba(39, 174, 96, 0.3)',
    color: '#27ae60',
    cursor: 'pointer',
    boxShadow: '0 2px 4px rgba(39, 174, 96, 0.2)',
    transition: 'all 0.15s ease',
  },
  choiceConfirmed: {
    fontSize: '14px',
    color: '#27ae60',
    fontWeight: 'bold',
  },

  // ===== Player Legend =====
  playerLegendArea: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'center',
    flexWrap: 'wrap',
    width: '100%',
    padding: '8px 0',
  },
  playerLegendItemMe: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#3498db',
  },
  playerLegendItemOther: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#e74c3c',
  },

  // ===== Resolution =====
  resolutionArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
  },
  resolutionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 12px',
    borderRadius: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    border: '1px solid rgba(0, 0, 0, 0.1)',
  },
  blockedText: {
    color: '#e74c3c',
    fontWeight: 'bold',
    fontSize: '14px',
  },
  movedText: {
    color: '#27ae60',
    fontWeight: 'bold',
    fontSize: '14px',
  },

  // ===== Finished =====
  finishedText: {
    fontSize: '20px',
    fontWeight: '900',
    color: '#FFD700',
    textAlign: 'center',
  },

  // ===== Error & Connecting =====
  connectingText: {
    fontSize: '16px',
    color: '#666',
    textAlign: 'center',
  },
  errorText: sharedStyles.errorText,
  waitingText: sharedStyles.waitingText,
};
