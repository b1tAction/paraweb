/**
 * DilemmaRaceStyles - game-specific styles for the Dilemma Race mini-game
 *
 * Hybrid layout: Phaser canvas for map/characters/popup,
 * React overlay for timer, legend, dice buttons.
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

  // ===== Phaser Container =====
  phaserContainer: {
    width: '100%',
    height: '300px',
    flexShrink: 0,
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    border: '2px solid rgba(255, 255, 255, 0.1)',
  },

  // ===== Player markers (avatar-based) =====
  playerAvatarContainer: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerAvatarMe: {
    width: '24px',
    height: '28px',
    borderRadius: '3px',
    border: '1.5px solid #3498db',
    boxShadow: '0 0 4px rgba(52, 152, 219, 0.5)',
    objectFit: 'contain',
    imageRendering: 'pixelated',
  },
  playerAvatarOther: {
    width: '24px',
    height: '28px',
    borderRadius: '3px',
    border: '1.5px solid #e74c3c',
    boxShadow: '0 0 4px rgba(231, 76, 60, 0.5)',
    objectFit: 'contain',
    imageRendering: 'pixelated',
  },
  playerAvatarBadgeBlocked: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    fontSize: '10px',
    fontWeight: '900',
    color: '#e74c3c',
    backgroundColor: '#fff',
    borderRadius: '50%',
    width: '14px',
    height: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: '1',
    boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
  },
  playerAvatarBadgeFinished: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    fontSize: '10px',
    fontWeight: '900',
    color: '#FFD700',
    backgroundColor: '#fff',
    borderRadius: '50%',
    width: '14px',
    height: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: '1',
    boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
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
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    width: '80px',
    height: '88px',
    borderRadius: '12px',
    border: '2px solid #3498db',
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: '0 4px 8px rgba(52, 152, 219, 0.2)',
    padding: '6px',
  },
  choiceButtonSelected: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    width: '80px',
    height: '88px',
    borderRadius: '12px',
    border: '2px solid #27ae60',
    backgroundColor: 'rgba(39, 174, 96, 0.3)',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(39, 174, 96, 0.4)',
    transition: 'all 0.15s ease',
    padding: '6px',
  },
  choiceDiceImage: {
    width: '56px',
    height: '46px',
    objectFit: 'contain',
    imageRendering: 'pixelated',
  },
  choiceDiceLabel: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#3498db',
  },
  choiceDiceLabelSelected: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#27ae60',
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