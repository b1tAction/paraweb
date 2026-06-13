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
  modalContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch', // Changed from center to stretch to fill the screen area
    justifyContent: 'center',
    // Use the gamepad frame image
    backgroundImage: 'url(/assets/ui/gamepad_frame.png)',
    backgroundSize: '100% 100%',
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated', // Keep pixel art sharp

    // Keep the 1760x800 frame ratio while making it as large as the viewport allows.
    width: 'min(98vw, calc(98vh * 1760 / 800))',
    aspectRatio: '1760 / 800',
    maxWidth: '1760px',
    maxHeight: '98vh',

    // Position relative so absolute children work
    position: 'relative',
    padding: '0', // Removing padding as we'll use absolute positioning

    gap: '0',
    color: '#333',
    fontFamily: '"Zpix", sans-serif',
    overflow: 'hidden',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '4px',
    textAlign: 'center',
    zIndex: 2, // Ensure it stays above the glass
  },
  screenContent: {
    position: 'absolute',
    // Exact coordinates: X=430, Y=70, W=900, H=630 on 1760x800 image
    left: '24.43%', // 430/1760
    top: '8.75%', // 70/800
    width: '51.14%', // 900/1760
    height: '78.75%', // 630/800

    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: '#f7f7ef',
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
    borderRadius: '4px',
    padding: '4px',
    overflow: 'hidden',
  },
  gameArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    width: '100%',
    height: '100%',
  },
  button: {
    padding: '14px 28px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#4CAF50',
    backgroundImage: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
    color: 'white',
    boxShadow: '0 4px 6px rgba(76, 175, 80, 0.2)',
  },
  buttonDisabled: {
    padding: '14px 28px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'not-allowed',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#e0e0e0',
    color: '#9e9e9e',
    boxShadow: 'none',
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
    fontSize: '120px', // Increased significantly for the 900x630 design space
    fontWeight: '800',
    textAlign: 'center',
    fontFamily: 'inherit',
    color: '#333',
    textShadow: '0 4px 8px rgba(0,0,0,0.15)',
    margin: '24px 0',
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
    fontStyle: 'italic',
  },

  // MathCalc Mini-Game Styles
  mathGameContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    maxWidth: '800px', // Increased to allow more room for ScaleWrapper
    margin: '0 auto',
  },
  questionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    padding: '0 8px',
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#555',
  },
  questionDisplay: {
    fontSize: '36px',
    fontWeight: '900',
    color: '#1a1a1a',
    letterSpacing: '2px',
    textAlign: 'center',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.4)',
    borderRadius: '12px',
    boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.05)',
    width: '100%',
  },
  inputArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    justifyContent: 'center',
    margin: '8px 0',
  },
  inputDisplay: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#0056b3',
    minHeight: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px 16px',
    borderBottom: '3px solid #0056b3',
    backgroundColor: 'rgba(255,255,255,0.2)',
    flex: 1,
    maxWidth: '200px',
  },
  inlineDelBtn: {
    padding: '8px 16px',
    fontSize: '16px',
    fontWeight: 'bold',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #6c757d 0%, #495057 100%)',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  keypadGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    width: '100%',
  },
  keypadBtn: {
    background: 'rgba(255, 255, 255, 0.6)',
    border: '1px solid rgba(200, 200, 200, 0.4)',
    borderRadius: '10px',
    padding: '12px',
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#333',
    cursor: 'pointer',
    transition: 'all 0.1s ease',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
  },
  keypadBtnHover: {
    background: 'rgba(255, 255, 255, 0.8)',
    transform: 'translateY(-1px)',
  },
  keypadBtnActive: {
    background: 'rgba(230, 230, 230, 0.8)',
    transform: 'translateY(1px)',
  },
  keypadBtnAction: {
    background: 'linear-gradient(135deg, #28a745 0%, #218838 100%)',
    color: 'white',
    border: 'none',
    gridColumn: 'span 1',
  },
  zeroBtn: {
    gridColumn: 'span 2',
  },

  // Mini ranking styles for MathCalc finished phase
  miniRankingList: {
    width: '100%',
    maxWidth: '500px', // Limit width so it's not "ridiculously wide"
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    margin: '16px 0',
  },
  miniRankingItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    background: 'rgba(255, 255, 255, 0.4)',
    borderRadius: '8px',
    fontSize: '18px',
    border: '2px solid rgba(0, 0, 0, 0.1)', // More visible border
    boxShadow: '0 4px 0 rgba(0,0,0,0.05)',
  },
  statusPlaying: {
    color: '#0056b3',
    fontStyle: 'italic',
    fontSize: '12px',
  },
  statusFinished: {
    color: '#28a745',
    fontWeight: 'bold',
  },

  // Rainbow Memory Styles
  rainbowGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
    width: '100%',
    maxWidth: '300px',
    margin: '20px auto',
  },
  colorSquare: {
    aspectRatio: '1 / 1',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
    border: '2px solid rgba(255,255,255,0.3)',
  },
  challengeText: {
    fontSize: '22px',
    fontWeight: 'bold',
    textAlign: 'center',
    margin: '12px 0',
    color: '#333',
    minHeight: '32px',
  },
  targetColorHighlight: {
    padding: '2px 8px',
    borderRadius: '4px',
    color: '#fff',
    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
  },

  // Vernier Styles
  vernierContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center', // Center vertically
    width: '100%',
    flex: 1, // Take up available space
    minHeight: '300px',
  },
  vernierTrack: {
    width: '100%',
    height: '60px',
    background: '#2c3e50',
    borderRadius: '8px',
    position: 'relative',
    // Removed overflow: hidden to show indicators outside
    boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.5)',
    border: '2px solid #34495e',
    margin: '40px 0',
  },
  vernierHighlight: {
    position: 'absolute',
    top: 0,
    height: '100%',
    background: 'rgba(231, 76, 60, 0.4)',
    borderLeft: '1px solid rgba(231, 76, 60, 0.8)',
    borderRight: '1px solid rgba(231, 76, 60, 0.8)',
  },
  vernierRuler: {
    height: '100%',
    width: '120px',
    background: 'linear-gradient(to bottom, #bdc3c7, #95a5a6)',
    position: 'absolute',
    top: 0,
    borderRadius: '4px',
    display: 'flex',
    justifyContent: 'center',
    boxShadow: '0 0 15px rgba(0,0,0,0.3)',
  },
  vernierCenterLine: {
    width: '3px',
    height: '100%',
    background: '#e74c3c',
    boxShadow: '0 0 8px rgba(231, 76, 60, 0.8)',
  },
  vernierIndicator: {
    position: 'absolute',
    top: '-28px', // Moved further out
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: '28px',
    color: '#f1c40f',
    textShadow: '0 2px 4px rgba(0,0,0,0.3)',
    zIndex: 10,
  },
  vernierIndicatorBottom: {
    position: 'absolute',
    bottom: '-28px', // Moved further out
    left: '50%',
    transform: 'translateX(-50%) rotate(180deg)',
    fontSize: '28px',
    color: '#f1c40f',
    zIndex: 10,
  },
  stopBtn: {
    marginTop: '20px',
    padding: '15px 40px',
    fontSize: '24px',
    fontWeight: 'bold',
    borderRadius: '50px',
    border: 'none',
    background: 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)',
    color: 'white',
    cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(231, 76, 60, 0.4)',
    transition: 'all 0.2s ease',
    textTransform: 'uppercase',
    letterSpacing: '2px',
  },
  stopBtnActive: {
    transform: 'scale(0.95)',
    boxShadow: '0 2px 10px rgba(231, 76, 60, 0.2)',
  },
  deviationText: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#333',
    margin: '10px 0',
    fontFamily: 'monospace', // Better for counting
  },

  // Unified Leaderboard Styles
  leaderboardContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    maxWidth: '500px',
    gap: '8px',
  },
  leaderboardHeader: {
    fontSize: '22px',
    fontWeight: '900',
    color: '#2a261d',
    margin: '0 0 8px 0',
    letterSpacing: '0',
    textAlign: 'center',
  },
  leaderboardRow: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: '10px 14px',
    borderRadius: '6px',
    background: 'rgba(32, 28, 21, 0.08)',
    border: '1px solid rgba(60, 48, 31, 0.18)',
    transition: 'background-color 0.2s ease, border-color 0.2s ease',
  },
  leaderboardRank: {
    fontSize: '15px',
    fontWeight: '900',
    width: '44px',
    marginRight: '12px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    color: '#3b3324',
  },
  leaderboardInfo: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
  leaderboardName: {
    fontSize: '15px',
    fontWeight: '800',
    color: '#2e291f',
    marginBottom: '2px',
  },
  leaderboardDetail: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#766b5a',
  },
  leaderboardDiceArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '4px',
  },
  diceBadge: {
    padding: '3px 8px',
    borderRadius: '3px',
    fontSize: '12px',
    color: '#2a2419',
    fontWeight: '900',
    letterSpacing: '0',
    border: '1px solid rgba(60, 48, 31, 0.2)',
  },
  diceDesc: {
    fontSize: '11px',
    color: '#4f4638',
    fontWeight: '800',
  },
  // Specific Rank Styles
  rank1: {
    background: 'rgba(190, 158, 82, 0.16)',
    border: '1px solid rgba(190, 158, 82, 0.42)',
  },
  rank2: {
    background: 'rgba(137, 143, 145, 0.13)',
    border: '1px solid rgba(137, 143, 145, 0.35)',
  },
  rank3: {
    background: 'rgba(157, 103, 62, 0.13)',
    border: '1px solid rgba(157, 103, 62, 0.35)',
  },
  rank4: {
    background: 'rgba(82, 66, 47, 0.1)',
    border: '1px solid rgba(82, 66, 47, 0.28)',
  },
  badgeGold: { backgroundColor: '#c7a85a', color: '#211b12' },
  badgeSilver: { backgroundColor: '#9ba0a0', color: '#191b1b' },
  badgeCopper: { backgroundColor: '#a46d45', color: '#211811' },
  badgeWood: { backgroundColor: '#6f5c42', color: '#f0e2c8' },
};

// Dice face dot positions in 3x3 grid (0=top-left, 8=bottom-right)
// Each face maps to a set of grid indices where dots appear
export const DICE_DOTS: Record<number, number[]> = {
  1: [4], // center
  2: [2, 6], // top-right, bottom-left
  3: [2, 4, 6], // top-right, center, bottom-left
  4: [0, 2, 6, 8], // four corners
  5: [0, 2, 4, 6, 8], // four corners + center
  6: [0, 2, 3, 5, 6, 8], // left 3 + right 3
};
