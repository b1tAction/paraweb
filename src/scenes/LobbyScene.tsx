/**
 * LobbyScene - 房间等待场景
 *
 * 显示房间玩家列表，房主可以开始游戏。
 */
import React, { useState } from 'react';
import { PhaserCharacterPreview } from '../components/PhaserCharacterPreview';
import { gameService } from '../service/NakamaService';
import { useGameStore } from '../store/gameStore';

const factionMeta: Record<string, { label: string }> = {
  qing_long: { label: '青龙' },
  zhu_que: { label: '朱雀' },
  bai_hu: { label: '白虎' },
  xuan_wu: { label: '玄武' },
};

const playerSlots = [
  {
    key: 'left',
    position: { left: '37.5%', top: '73%' },
    panel: { left: '50%', top: '73%', transform: 'translateX(-50%)', textAlign: 'center' as const },
  },
  {
    key: 'top',
    position: { left: '50%', top: '61%' },
    panel: { left: '50%', top: '70%', transform: 'translateX(-50%)', textAlign: 'center' as const },
  },
  {
    key: 'right',
    position: { left: '62.5%', top: '73%' },
    panel: { left: '50%', top: '73%', transform: 'translateX(-50%)', textAlign: 'center' as const },
  },
  {
    key: 'bottom',
    position: { left: '50%', top: '88%' },
    panel: { left: '50%', top: '88%', transform: 'translateX(-50%)', textAlign: 'center' as const },
  },
] as const;

export const LobbyScene: React.FC = () => {
  const { waitingSync, myPlayerId, matchId } = useGameStore();
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState('');

  if (!waitingSync) {
    return <div style={styles.loading}>加载中...</div>;
  }

  const {
    match_id,
    host_user_id,
    players,
    player_count,
    min_players,
    max_players,
    can_start,
    message,
  } = waitingSync;

  const isHost = myPlayerId === host_user_id;
  const displayMatchId = match_id || matchId;

  const handleStartGame = async () => {
    try {
      setStartError('');
      setIsStarting(true);
      console.log('[LobbyScene] 开始游戏');
      await gameService.sendStartGame();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '发送开始游戏请求失败';
      setStartError(errorMessage);
      console.error('[LobbyScene] 开始游戏失败', err);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <main style={styles.page}>
      <section style={styles.roomHeader} aria-label="房间信息">
        <h1 style={styles.title}>房间等待</h1>
        <button
          type="button"
          style={styles.roomId}
          title="复制房间 ID"
          onClick={() => displayMatchId && navigator.clipboard.writeText(displayMatchId)}
        >
          房间 ID: {displayMatchId || '-'}
        </button>
        <div style={styles.roomMeta}>
          {player_count} / {max_players} 人
          {player_count < min_players ? `，至少需要 ${min_players} 人` : ''}
        </div>
        {isHost ? (
          <button
            type="button"
            style={{
              ...styles.startButton,
              ...(!can_start || isStarting ? styles.startButtonDisabled : undefined),
            }}
            onClick={handleStartGame}
            disabled={!can_start || isStarting}
          >
            {isStarting ? '启动中...' : '开始游戏'}
          </button>
        ) : (
          <div style={styles.waitingText}>等待房主开始游戏</div>
        )}
        {(message || startError) && (
          <div style={{ ...styles.notice, ...(startError ? styles.errorNotice : undefined) }}>
            {startError || message}
          </div>
        )}
      </section>

      <section style={styles.playerStage} aria-label="房间玩家">
        {players?.slice(0, 4).map((player, index) => {
          const slot = playerSlots[index];
          const faction = factionMeta[player.faction] ?? factionMeta.qing_long;
          const isMe = player.user_id === myPlayerId;
          const isPlayerHost = player.user_id === host_user_id;

          return (
            <div
              key={player.user_id || index}
              style={{
                ...styles.playerSlot,
                ...slot.position,
              }}
            >
              <div style={styles.figureViewport} aria-hidden="true">
                <PhaserCharacterPreview
                  faction={player.faction}
                  width={256}
                  height={256}
                  style={styles.figureCanvas}
                />
              </div>
              <div style={{ ...styles.playerPanel, ...slot.panel }}>
                <div style={styles.playerName}>{player.display_name || player.user_id}</div>
                <div style={styles.playerTags}>
                  <span>{faction.label}</span>
                  {isPlayerHost && <span>房主</span>}
                  {isMe && <span>我</span>}
                </div>
              </div>
            </div>
          );
        })}
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
    backgroundImage: 'url("/assets/waiting.png")',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    fontFamily: 'Zpix, sans-serif',
  },
  loading: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff7d6',
    backgroundImage: 'url("/assets/waiting.png")',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    fontFamily: 'Zpix, sans-serif',
  },
  roomHeader: {
    position: 'absolute',
    left: '50%',
    top: '10%',
    transform: 'translateX(-50%)',
    width: 'min(680px, calc(100vw - 32px))',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    color: '#fff8d7',
    textAlign: 'center',
    textShadow: '0 3px 0 rgba(62, 38, 29, 0.72), 0 10px 24px rgba(0, 0, 0, 0.4)',
    pointerEvents: 'auto',
  },
  title: {
    margin: 0,
    fontSize: 'clamp(34px, 5vw, 62px)',
    lineHeight: 1,
    fontWeight: 900,
    letterSpacing: 0,
  },
  roomId: {
    maxWidth: '100%',
    padding: '8px 14px',
    color: '#fff6d6',
    background: 'rgba(41, 45, 49, 0.32)',
    border: '1px solid rgba(255, 238, 184, 0.42)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 'clamp(12px, 1.4vw, 16px)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    backdropFilter: 'blur(2px)',
    boxShadow: '0 8px 18px rgba(0, 0, 0, 0.22)',
  },
  roomMeta: {
    fontSize: 'clamp(12px, 1.3vw, 15px)',
    color: '#f8e9bb',
  },
  startButton: {
    marginTop: '4px',
    minWidth: '144px',
    minHeight: '44px',
    padding: '8px 18px',
    color: '#3c3833',
    backgroundColor: 'transparent',
    backgroundImage: 'url("/assets/button/button_up.png")',
    backgroundSize: '100% 100%',
    backgroundRepeat: 'no-repeat',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '17px',
    textShadow: '0 1px 0 rgba(255,255,255,0.75)',
    imageRendering: 'pixelated',
  },
  startButtonDisabled: {
    filter: 'grayscale(0.75)',
    opacity: 0.72,
    cursor: 'not-allowed',
  },
  waitingText: {
    marginTop: '4px',
    padding: '7px 12px',
    color: '#f8e9bb',
    background: 'rgba(15, 24, 28, 0.32)',
    borderRadius: '8px',
    fontSize: '14px',
    boxShadow: '0 8px 18px rgba(0, 0, 0, 0.18)',
  },
  notice: {
    maxWidth: 'min(520px, 90vw)',
    padding: '6px 10px',
    color: '#fff6d6',
    background: 'rgba(15, 24, 28, 0.38)',
    borderRadius: '8px',
    fontSize: '12px',
  },
  errorNotice: {
    color: '#ffd7cf',
    background: 'rgba(90, 24, 16, 0.5)',
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
    pointerEvents: 'none',
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
};

export default LobbyScene;
