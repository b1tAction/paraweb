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
  gameArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    gap: '4px',
    width: '100%',
    height: '100%',
    minHeight: 0,
    padding: '0 2px 2px',
    color: '#28311f',
  },
  centerGameArea: sharedStyles.gameArea,

  // ===== Header =====
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    minHeight: '32px',
    padding: '0 4px',
    flexShrink: 0,
    gap: '10px',
  },
  roundLabel: {
    flex: '0 0 112px',
    fontSize: '18px',
    fontWeight: '800',
    color: '#4a4e4a',
  },
  timerDisplay: {
    flex: '0 0 78px',
    fontSize: '28px',
    fontWeight: '800',
    color: '#f05244',
    fontFamily: 'monospace',
    textAlign: 'right',
  },
  resolvingLabel: {
    flex: '0 0 104px',
    fontSize: '16px',
    fontWeight: '800',
    color: '#c67a16',
    textAlign: 'right',
  },

  // ===== Phaser Container =====
  phaserContainer: {
    width: '100%',
    height: '430px',
    flexShrink: 0,
    borderRadius: '6px',
    overflow: 'hidden',
    boxShadow: '0 5px 14px rgba(34, 44, 22, 0.3)',
    border: '2px solid rgba(45, 67, 31, 0.38)',
    backgroundColor: '#6f885d',
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
    gap: '6px',
    width: '100%',
    flexShrink: 0,
  },
  choicePrompt: {
    margin: 0,
    fontSize: '14px',
    fontWeight: '800',
    textAlign: 'center',
    color: '#2f332a',
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
    width: '70px',
    height: '70px',
    borderRadius: '8px',
    border: '2px solid #2b9ee8',
    backgroundColor: 'rgba(43, 158, 232, 0.12)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: '0 4px 8px rgba(35, 115, 160, 0.2)',
    padding: '5px',
  },
  choiceButtonSelected: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    width: '70px',
    height: '70px',
    borderRadius: '8px',
    border: '2px solid #2f9f55',
    backgroundColor: 'rgba(47, 159, 85, 0.28)',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(47, 159, 85, 0.36)',
    transition: 'all 0.15s ease',
    padding: '5px',
  },
  choiceDiceImage: {
    width: '42px',
    height: '34px',
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
    gap: '10px',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: '1 1 auto',
    minWidth: 0,
    minHeight: '30px',
    padding: 0,
  },
  playerLegendItemMe: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#3498db',
    whiteSpace: 'nowrap',
  },
  playerLegendItemOther: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#e74c3c',
    whiteSpace: 'nowrap',
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
