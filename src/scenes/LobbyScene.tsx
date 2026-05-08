/**
 * LobbyScene - waiting room before the match begins.
 */

import type React from 'react';
import { useMemo, useState } from 'react';
import { PhaserCharacterPreview } from '../components/PhaserCharacterPreview';
import { gameService } from '../service/NakamaService';
import { Scene, useGameStore } from '../store/gameStore';
import { assetCssUrl } from '../utils/assets';
import { getDisambiguatedDisplayName } from '../utils/displayName';

const factionMeta: Record<string, { label: string }> = {
  qing_long: { label: '青龙' },
  zhu_que: { label: '朱雀' },
  bai_hu: { label: '白虎' },
  xuan_wu: { label: '玄武' },
};

const playerSlots = [
  {
    key: 'left',
    position: { left: '37.5%', top: '70%' },
    panel: { left: '50%', top: '70%', transform: 'translateX(-50%)', textAlign: 'center' as const },
  },
  {
    key: 'top',
    position: { left: '50%', top: '58%' },
    panel: { left: '50%', top: '67%', transform: 'translateX(-50%)', textAlign: 'center' as const },
  },
  {
    key: 'right',
    position: { left: '62.5%', top: '70%' },
    panel: { left: '50%', top: '70%', transform: 'translateX(-50%)', textAlign: 'center' as const },
  },
  {
    key: 'bottom',
    position: { left: '50%', top: '85%' },
    panel: { left: '50%', top: '85%', transform: 'translateX(-50%)', textAlign: 'center' as const },
  },
] as const;

export const LobbyScene: React.FC = () => {
  const { waitingSync, myPlayerId, matchId, resetMatchState } = useGameStore();
  const [isStarting, setIsStarting] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [kickingPlayerId, setKickingPlayerId] = useState('');
  const [isBeginPressed, setIsBeginPressed] = useState(false);
  const [notice, setNotice] = useState('');

  const lobbyPlayers = useMemo(() => {
    const players = waitingSync?.players.filter((player) => Boolean(factionMeta[player.faction])) || [];
    const nameSources = players.map((player) => ({
      displayName: player.display_name || player.user_id,
      userId: player.user_id,
    }));

    return players.map((player) => ({
      ...player,
      display: getDisambiguatedDisplayName(player.display_name || player.user_id, player.user_id, nameSources),
    }));
  }, [waitingSync?.players]);

  if (!waitingSync) {
    return (
      <main style={styles.page}>
        <div style={styles.cornerTitle}>LOBBY</div>
        <div style={styles.loading}>LOADING...</div>
      </main>
    );
  }

  const { match_id, host_user_id, player_count, min_players, max_players, can_start } = waitingSync;
  const isHost = myPlayerId === host_user_id;
  const displayMatchId = match_id || matchId;
  const isBeginDisabled = !can_start || isStarting || isLeaving;

  const handleBegin = async () => {
    try {
      setNotice('');
      setIsStarting(true);
      await gameService.sendStartGame();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '开始游戏失败';
      setNotice(errorMessage);
    } finally {
      setIsBeginPressed(false);
      setIsStarting(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (isLeaving) return;

    try {
      setNotice('');
      setIsLeaving(true);
      await gameService.leaveRoom();
    } catch (err) {
      console.warn('[LobbyScene] leaveRoom failed', err);
    } finally {
      useGameStore.getState().setJoinRoomNotice('');
      resetMatchState();
      useGameStore.getState().setScene(Scene.JoinRoom);
      setIsLeaving(false);
    }
  };

  const handleKickPlayer = async (targetId: string) => {
    if (!isHost || !targetId || targetId === myPlayerId || kickingPlayerId) return;

    try {
      setNotice('');
      setKickingPlayerId(targetId);
      await gameService.sendKickPlayer(targetId);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '移出玩家失败';
      setNotice(errorMessage);
    } finally {
      setKickingPlayerId('');
    }
  };

  return (
    <main style={styles.page}>
      <div style={styles.cornerTitle}>等待大厅</div>

      <section style={styles.roomHeader}>
        <button
          type="button"
          style={styles.roomId}
          title="复制房间 ID"
          onClick={() => displayMatchId && navigator.clipboard.writeText(displayMatchId)}
        >
          房间 ID: {displayMatchId || '-'}
        </button>
        <div style={styles.roomMeta}>
          {player_count} / {max_players} 人{player_count < min_players ? ` - NEED ${min_players}` : ''}
        </div>
      </section>

      <section style={styles.playerStage} aria-label="房间玩家">
        {lobbyPlayers.slice(0, 4).map((player, index) => {
          const slot = playerSlots[index];
          const faction = factionMeta[player.faction] ?? factionMeta.qing_long;
          const isMe = player.user_id === myPlayerId;
          const isPlayerHost = player.user_id === host_user_id;

          return (
            <div
              key={player.user_id || slot.key}
              style={{
                ...styles.playerSlot,
                ...slot.position,
              }}
            >
              <div style={styles.figureViewport} aria-hidden="true">
                <PhaserCharacterPreview faction={player.faction} width={256} height={256} style={styles.figureCanvas} />
              </div>
              <div style={{ ...styles.playerPanel, ...slot.panel }}>
                <div style={styles.playerName}>{player.display}</div>
                <div style={styles.playerTags}>
                  <span>{faction.label}</span>
                  {isPlayerHost && <span>房主</span>}
                  {isMe && <span>我</span>}
                </div>
                {isHost && !isMe && !isPlayerHost && (
                  <button
                    type="button"
                    title={`移出 ${player.display}`}
                    onClick={() => void handleKickPlayer(player.user_id)}
                    disabled={Boolean(kickingPlayerId) || isStarting || isLeaving}
                    style={{
                      ...styles.kickButton,
                      ...(kickingPlayerId || isStarting || isLeaving ? styles.kickButtonDisabled : undefined),
                    }}
                  >
                    {kickingPlayerId === player.user_id ? '...' : '移出'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section style={styles.footerPanel}>
        {notice && <div style={styles.message}>{notice}</div>}
        {isHost ? (
          <div style={styles.hostActions}>
            <button
              type="button"
              onClick={handleBegin}
              disabled={isBeginDisabled}
              style={{
                ...styles.beginButton,
                ...(isBeginPressed && !isBeginDisabled ? styles.beginButtonPressed : undefined),
                ...(isBeginDisabled ? styles.beginButtonDisabled : undefined),
              }}
              onPointerDown={() => setIsBeginPressed(true)}
              onPointerUp={() => setIsBeginPressed(false)}
              onPointerLeave={() => setIsBeginPressed(false)}
              onPointerCancel={() => setIsBeginPressed(false)}
              onKeyDown={(event) => {
                if (event.key === ' ' || event.key === 'Enter') {
                  setIsBeginPressed(true);
                }
              }}
              onKeyUp={() => setIsBeginPressed(false)}
            >
              {isStarting ? '启动中...' : '开始游戏'}
            </button>
            <button
              type="button"
              onClick={handleLeaveRoom}
              disabled={isLeaving || isStarting}
              style={{ ...styles.leaveButton, ...(isLeaving || isStarting ? styles.leaveButtonDisabled : undefined) }}
            >
              {isLeaving ? '解散中...' : '解散房间'}
            </button>
          </div>
        ) : (
          <div style={styles.guestActions}>
            <div style={styles.waitingText}>等待房主开始游戏...</div>
            <button
              type="button"
              onClick={handleLeaveRoom}
              disabled={isLeaving}
              style={{ ...styles.leaveButton, ...(isLeaving ? styles.leaveButtonDisabled : undefined) }}
            >
              {isLeaving ? '离开中...' : '离开房间'}
            </button>
          </div>
        )}
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
    backgroundImage: assetCssUrl('assets/waiting.png'),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    fontFamily: 'Zpix, sans-serif',
    color: '#fff7d6',
  },
  cornerTitle: {
    position: 'fixed',
    left: '72px',
    top: '68px',
    zIndex: 3,
    color: '#fff0b8',
    fontSize: '36px',
    textShadow: '0 3px 0 rgba(0,0,0,0.42)',
  },
  leaveButton: {
    minWidth: '118px',
    minHeight: '40px',
    padding: '8px 12px',
    color: '#fff6d6',
    background: 'rgba(41, 45, 49, 0.5)',
    border: '1px solid rgba(255, 238, 184, 0.48)',
    borderRadius: '8px',
    boxShadow: '0 8px 18px rgba(0, 0, 0, 0.24)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '12px',
    backdropFilter: 'blur(2px)',
  },
  leaveButtonDisabled: {
    opacity: 0.68,
    cursor: 'not-allowed',
  },
  loading: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff7d6',
  },
  roomHeader: {
    position: 'absolute',
    left: '50%',
    top: '48px',
    transform: 'translateX(-50%)',
    width: 'min(560px, calc(100vw - 56px))',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    textAlign: 'center',
    textShadow: '0 3px 0 rgba(62, 38, 29, 0.72), 0 10px 24px rgba(0, 0, 0, 0.4)',
  },
  roomId: {
    maxWidth: '100%',
    padding: '8px 14px',
    color: '#fff6d6',
    background: 'rgba(41, 45, 49, 0.38)',
    border: '1px solid rgba(255, 238, 184, 0.42)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 'clamp(12px, 1.35vw, 16px)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    backdropFilter: 'blur(2px)',
    boxShadow: '0 8px 18px rgba(0, 0, 0, 0.22)',
  },
  roomMeta: {
    color: '#f8e9bb',
    fontSize: '13px',
  },
  playerStage: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  playerSlot: {
    position: 'absolute',
    transform: 'translate(-50%, -100%)',
    width: 'clamp(168px, 14.6vw, 256px)',
    aspectRatio: '1 / 1',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center',
    filter: 'drop-shadow(0 12px 12px rgba(0, 0, 0, 0.45))',
  },
  figureViewport: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    imageRendering: 'pixelated',
  },
  figureCanvas: {
    width: '100%',
    height: '100%',
  },
  playerPanel: {
    position: 'absolute',
    minWidth: 'clamp(110px, 10vw, 160px)',
    maxWidth: 'min(220px, 22vw)',
    padding: '7px 9px',
    color: '#fdf5d0',
    background: 'rgba(29, 35, 35, 0.72)',
    border: '1px solid rgba(255, 232, 166, 0.4)',
    borderRadius: '8px',
    boxShadow: '0 9px 18px rgba(0, 0, 0, 0.28)',
    backdropFilter: 'blur(2px)',
    pointerEvents: 'auto',
  },
  playerName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'clamp(12px, 1.15vw, 15px)',
    fontWeight: 900,
    lineHeight: 1.3,
    textShadow: '0 2px 4px rgba(0, 0, 0, 0.65)',
  },
  playerTags: {
    marginTop: '5px',
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: '4px',
    color: '#e9d393',
    fontSize: 'clamp(10px, 0.95vw, 12px)',
    lineHeight: 1.2,
  },
  kickButton: {
    marginTop: '6px',
    minWidth: '42px',
    minHeight: '20px',
    padding: '2px 7px',
    color: '#ffe0d9',
    background: 'rgba(97, 30, 22, 0.72)',
    border: '1px solid rgba(255, 184, 172, 0.45)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '10px',
    lineHeight: 1,
  },
  kickButtonDisabled: {
    opacity: 0.64,
    cursor: 'not-allowed',
  },
  footerPanel: {
    position: 'absolute',
    left: '50%',
    top: 'clamp(96px, 16vh, 168px)',
    transform: 'translateX(-50%)',
    width: 'min(520px, calc(100vw - 56px))',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
  },
  message: {
    minHeight: '18px',
    color: '#f8e9bb',
    fontSize: '12px',
    textAlign: 'center',
    textShadow: '0 2px 0 rgba(0,0,0,0.45)',
  },
  beginButton: {
    minWidth: '170px',
    minHeight: '56px',
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
  beginButtonPressed: {
    backgroundImage: assetCssUrl('assets/button/button_press.png'),
    transform: 'translateY(2px)',
  },
  beginButtonDisabled: {
    filter: 'grayscale(0.75)',
    opacity: 0.72,
    cursor: 'not-allowed',
  },
  hostActions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
  },
  guestActions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
  },
  waitingText: {
    marginTop: '4px',
    padding: '7px 24px',
    color: '#f8e9bb',
    background: 'rgba(15, 24, 28, 0.32)',
    borderRadius: '8px',
    fontSize: '14px',
    boxShadow: '0 8px 18px rgba(0, 0, 0, 0.18)',
  },
};

export default LobbyScene;
