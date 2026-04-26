// Mini-game shared styles for all mini-game UI components.

import type { CSSProperties } from 'react';

export const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    gap: '16px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '8px',
  },
  gameArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '24px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    backgroundColor: '#f9f9f9',
    minWidth: '300px',
  },
  button: {
    padding: '12px 24px',
    fontSize: '16px',
    cursor: 'pointer',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#4CAF50',
    color: 'white',
  },
  buttonDisabled: {
    padding: '12px 24px',
    fontSize: '16px',
    cursor: 'not-allowed',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#ccc',
    color: '#666',
  },
  submittedText: {
    fontSize: '16px',
    color: '#666',
    textAlign: 'center',
  },
  errorText: {
    fontSize: '14px',
    color: '#d32f2f',
    textAlign: 'center',
  },

  // Dice race styles
  diceRow: {
    display: 'flex',
    gap: '20px',
    alignItems: 'center',
  },
  diceContainer: {
    width: '80px',
    height: '80px',
    backgroundColor: '#fff',
    border: '2px solid #333',
    borderRadius: '8px',
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridTemplateRows: 'repeat(3, 1fr)',
    padding: '8px',
    transition: 'transform 0.15s',
  },
  diceRolling: {
    animation: 'dice-roll 0.3s infinite',
  },
  diceDot: {
    width: '16px',
    height: '16px',
    backgroundColor: '#333',
    borderRadius: '50%',
    alignSelf: 'center',
    justifySelf: 'center',
  },
  diceDotHidden: {
    width: '16px',
    height: '16px',
    backgroundColor: 'transparent',
    borderRadius: '50%',
  },
  scoreDisplay: {
    fontSize: '20px',
    fontWeight: 'bold',
    textAlign: 'center',
  },

  // Count seconds styles
  timerDisplay: {
    fontSize: '48px',
    fontWeight: 'bold',
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  resultDisplay: {
    fontSize: '16px',
    textAlign: 'center',
  },

  // MiniGame result styles
  resultContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '24px',
    backgroundColor: '#e8f5e9',
    borderRadius: '8px',
    minWidth: '300px',
  },
  resultTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
  },
  rankingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 16px',
    backgroundColor: '#fff',
    borderRadius: '4px',
    border: '1px solid #ddd',
  },
  rankBadge: {
    fontSize: '18px',
    fontWeight: 'bold',
    width: '32px',
    textAlign: 'center',
  },
  playerName: {
    fontSize: '16px',
    flex: 1,
  },
  gameDataDetail: {
    fontSize: '14px',
    color: '#666',
  },
  waitingText: {
    fontSize: '14px',
    color: '#666',
    textAlign: 'center',
  },
};

// Dice face dot positions in 3x3 grid (0=top-left, 8=bottom-right)
// Each face maps to a set of grid indices where dots appear
export const DICE_DOTS: Record<number, number[]> = {
  1: [4],       // center
  2: [2, 6],    // top-right, bottom-left
  3: [2, 4, 6], // top-right, center, bottom-left
  4: [0, 2, 6, 8], // four corners
  5: [0, 2, 4, 6, 8], // four corners + center
  6: [0, 2, 3, 5, 6, 8], // left 3 + right 3
};