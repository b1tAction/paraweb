/**
 * FactionSelectScene - choose a faction before entering the lobby.
 */

import type React from 'react';
import { useState } from 'react';
import { PhaserCharacterPreview } from '../components/PhaserCharacterPreview';
import { gameService } from '../service/NakamaService';
import { Scene, useGameStore } from '../store/gameStore';
import { assetCssUrl } from '../utils/assets';

const factionOptions = [
  {
    value: 'qing_long',
    label: '青龙',
    skillName: '威势',
    description: '每 2 回合充能，使用后获得一回合威势BUFF，良性增益效果翻倍',
  },
  {
    value: 'zhu_que',
    label: '朱雀',
    skillName: '离火',
    description: '每 3 回合触发，LP +1',
  },
  {
    value: 'bai_hu',
    label: '白虎',
    skillName: '劫运',
    description: '每 2 回合充能，使用时指定一名玩家获得一回合劫运BUFF，获取其良性增益效果',
  },
  {
    value: 'xuan_wu',
    label: '玄武',
    skillName: '镇厄',
    description: '每 2 回合充能，使用后获得一回合镇厄BUFF，免疫恶性事件和 debuff',
  },
] as const;

async function getErrorMessage(err: unknown): Promise<string> {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  try {
    return JSON.stringify(err);
  } catch {
    return '未知错误';
  }
}

export const FactionSelectScene: React.FC = () => {
  const { faction: storedFaction, match, pendingRoomAction, resetMatchState } = useGameStore();
  const [selectedFaction, setSelectedFaction] = useState(storedFaction || 'qing_long');
  const [isConfirming, setIsConfirming] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isConfirmPressed, setIsConfirmPressed] = useState(false);
  const [error, setError] = useState('');

  const handleExitRoom = async () => {
    if (isLeaving || isConfirming) return;

    try {
      setError('');
      setIsLeaving(true);
      if (match) {
        await gameService.leaveRoom();
        resetMatchState();
      }
    } catch (err) {
      console.warn('[FactionSelectScene] leaveRoom failed', err);
    } finally {
      useGameStore.getState().setPendingRoomAction(null);
      useGameStore.getState().setJoinRoomNotice('');
      useGameStore.getState().setScene(Scene.JoinRoom);
      setIsLeaving(false);
    }
  };

  const handleConfirm = async () => {
    if (isConfirming || isLeaving) return;

    try {
      setError('');
      setIsConfirming(true);
      useGameStore.getState().setFaction(selectedFaction);

      if (pendingRoomAction?.type === 'create') {
        await gameService.createRoom(pendingRoomAction.lobbyName, pendingRoomAction.maxPlayers);
      } else if (pendingRoomAction?.type === 'join') {
        await gameService.joinRoom(pendingRoomAction.matchId, { faction: selectedFaction });
      } else if (match) {
        await gameService.sendLobbyPlayerUpdate(selectedFaction);
      } else {
        throw new Error('没有待进入的房间');
      }

      useGameStore.getState().setPendingRoomAction(null);
      useGameStore.getState().setScene(Scene.Lobby);
    } catch (err: unknown) {
      const message = await getErrorMessage(err);
      setError(`选择阵营失败：${message}`);
    } finally {
      setIsConfirmPressed(false);
      setIsConfirming(false);
    }
  };

  return (
    <main style={styles.page}>
      <div style={styles.titleRow}>
        <div style={styles.cornerTitle}>选择阵营</div>
        <button
          type="button"
          onClick={handleExitRoom}
          disabled={isLeaving || isConfirming}
          style={{
            ...styles.exitButton,
            ...(isLeaving || isConfirming ? styles.exitButtonDisabled : undefined),
          }}
        >
          <span style={styles.exitArrow}>{'<'}</span>
          {isLeaving ? '离开中...' : '离开房间'}
        </button>
      </div>

      <section style={styles.factionRow} aria-label="选择阵营">
        {factionOptions.map((option) => {
          const isSelected = selectedFaction === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelectedFaction(option.value)}
              style={{
                ...styles.factionCard,
              }}
              aria-pressed={isSelected}
            >
              <div style={{ ...styles.figureStage, ...(isSelected ? styles.figureStageSelected : undefined) }}>
                <div style={styles.factionFigureViewport} aria-hidden="true">
                  <PhaserCharacterPreview
                    faction={option.value}
                    width={500}
                    height={500}
                    xOffset={-128}
                    yOffset={-152}
                    style={styles.factionFigureCanvas}
                  />
                </div>
              </div>
              <div style={styles.factionCopy}>
                <span style={styles.factionName}>{option.label}</span>
                <span style={styles.skillDescription}>
                  <span style={styles.skillName}>{option.skillName}</span>
                  <span>{option.description}</span>
                </span>
              </div>
            </button>
          );
        })}
      </section>

      <section style={styles.footer}>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isConfirming || isLeaving}
          style={{
            ...styles.confirmButton,
            ...(isConfirmPressed && !isConfirming && !isLeaving ? styles.confirmButtonPressed : undefined),
            ...(isConfirming || isLeaving ? styles.confirmButtonDisabled : undefined),
          }}
          onPointerDown={() => setIsConfirmPressed(true)}
          onPointerUp={() => setIsConfirmPressed(false)}
          onPointerLeave={() => setIsConfirmPressed(false)}
          onPointerCancel={() => setIsConfirmPressed(false)}
          onKeyDown={(event) => {
            if (event.key === ' ' || event.key === 'Enter') {
              setIsConfirmPressed(true);
            }
          }}
          onKeyUp={() => setIsConfirmPressed(false)}
        >
          {isConfirming ? '确认中...' : '确认选择'}
        </button>
        {error && <p style={styles.error}>{error}</p>}
      </section>
    </main>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    position: 'fixed',
    inset: 0,
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'clamp(18px, 3.4vh, 34px)',
    padding: '84px 28px 44px',
    boxSizing: 'border-box',
    backgroundImage: assetCssUrl('assets/waiting.webp'),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    fontFamily: 'Zpix, sans-serif',
    color: '#fff7d6',
  },
  titleRow: {
    position: 'fixed',
    left: '72px',
    top: '68px',
    zIndex: 3,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '14px',
  },
  exitButton: {
    minHeight: '28px',
    padding: '0 9px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    color: '#fff7d6',
    background: 'rgba(0, 0, 0, 0.24)',
    border: '1px solid rgba(255, 247, 214, 0.28)',
    borderRadius: '20px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '12px',
  },
  exitButtonDisabled: {
    opacity: 0.68,
    cursor: 'not-allowed',
  },
  exitArrow: {
    display: 'inline-block',
    transform: 'translateY(-1px)',
  },
  cornerTitle: {
    color: '#fff0b8',
    fontSize: '36px',
    textShadow: '0 3px 0 rgba(0,0,0,0.42)',
  },
  factionRow: {
    width: 'min(1240px, 100%)',
    marginTop: 'clamp(54px, 8vh, 78px)',
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: 'clamp(12px, 2vw, 24px)',
    alignItems: 'start',
  },
  factionCard: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '14px',
    padding: '10px 8px 16px',
    color: '#f8fff8',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'center',
    boxShadow: 'none',
    filter: 'drop-shadow(0 16px 18px rgba(0,0,0,0.34))',
    transform: 'none',
    transition: 'none',
  },
  figureStage: {
    width: 'clamp(198px, 19.8vw, 288px)',
    height: 'clamp(241px, 24.1vw, 351px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'clamp(19px, 1.95vw, 28px) clamp(16px, 1.65vw, 24px) clamp(15px, 1.55vw, 22px)',
    boxSizing: 'border-box',
    backgroundColor: 'transparent',
    backgroundImage: assetCssUrl('assets/frame/paper.png'),
    backgroundSize: '100% 100%',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    border: 'none',
    borderRadius: 0,
    imageRendering: 'pixelated',
  },
  figureStageSelected: {
    filter: 'drop-shadow(0 0 10px rgba(144, 215, 144, 0.93)) drop-shadow(0 0 38px rgb(149, 220, 153))',
  },
  factionFigureViewport: {
    width: 'min(500px, 100%)',
    aspectRatio: '1 / 1',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    imageRendering: 'pixelated',
    filter: 'drop-shadow(0 18px 18px rgba(0,0,0,0.48))',
  },
  factionFigureCanvas: {
    width: '100%',
    height: '100%',
  },
  factionName: {
    color: '#fff0b8',
    fontSize: 'clamp(18px, 2.3vw, 28px)',
    lineHeight: 1.1,
    textShadow: '0 4px 12px rgba(0,0,0,0.55)',
  },
  factionCopy: {
    minHeight: '126px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '7px',
    color: '#fff7d6',
    textShadow: '0 3px 8px rgba(0,0,0,0.62)',
  },
  skillName: {
    display: 'block',
    marginBottom: '4px',
    color: '#d9b6ff',
    fontSize: 'clamp(13px, 1.3vw, 16px)',
    lineHeight: 1.2,
  },
  skillDescription: {
    width: 'min(240px, 18vw)',
    padding: '7px 9px',
    color: '#fff1c6',
    background: 'rgba(19, 18, 28, 0.66)',
    border: '1px solid rgba(231, 202, 255, 0.32)',
    borderRadius: '8px',
    boxShadow: '0 8px 18px rgba(0, 0, 0, 0.22)',
    fontSize: 'clamp(11px, 1.05vw, 13px)',
    lineHeight: 1.55,
    whiteSpace: 'normal',
  },
  footer: {
    minHeight: '86px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
  },
  confirmButton: {
    minWidth: '170px',
    minHeight: '56px',
    padding: 0,
    color: '#352c20',
    backgroundImage: assetCssUrl('assets/button/button_up.png'),
    backgroundSize: '100% 100%',
    backgroundRepeat: 'no-repeat',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '17px',
    imageRendering: 'pixelated',
    boxShadow: 'none',
  },
  confirmButtonPressed: {
    backgroundImage: assetCssUrl('assets/button/button_press.png'),
    transform: 'translateY(2px)',
  },
  confirmButtonDisabled: {
    filter: 'grayscale(0.75)',
    opacity: 0.72,
    cursor: 'not-allowed',
  },
  error: {
    maxWidth: 'min(620px, 88vw)',
    margin: 0,
    padding: '10px 12px',
    color: '#ffe0d9',
    background: 'rgba(97, 30, 22, 0.66)',
    border: '1px solid rgba(255, 184, 172, 0.35)',
    borderRadius: '8px',
    fontSize: '13px',
  },
};

export default FactionSelectScene;
