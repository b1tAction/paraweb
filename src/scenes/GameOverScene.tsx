import React, { useMemo, useState } from 'react';
import { PhaserCharacterPreview } from '../components/PhaserCharacterPreview';
import { gameService } from '../service/NakamaService';
import { useGameStore } from '../store/gameStore';
import type { Player } from '../types/protocol';

const factionMeta: Record<string, { label: string }> = {
  qing_long: { label: '青龙' },
  zhu_que: { label: '朱雀' },
  bai_hu: { label: '白虎' },
  xuan_wu: { label: '玄武' },
};

const playerSlots = [
  { key: 'left', position: { left: '37.5%', top: '76%' } },
  { key: 'top', position: { left: '50%', top: '64%' } },
  { key: 'right', position: { left: '62.5%', top: '76%' } },
  { key: 'bottom', position: { left: '50%', top: '90%' } },
] as const;

function isBossPlayer(player: Player) {
  const maybeBoss = player as Player & { is_boss?: boolean };
  const normalizedId = player.player_id?.toLowerCase?.() || '';
  const normalizedName = player.display_name?.toLowerCase?.() || '';

  return Boolean(maybeBoss.is_boss) || normalizedId === 'boss' || normalizedName === 'boss';
}

export const GameOverScene: React.FC = () => {
  const { gameOver, players, myPlayerId, resetMatchState } = useGameStore();
  const [isRestarting, setIsRestarting] = useState(false);
  const [isRestartPressed, setIsRestartPressed] = useState(false);

  const visiblePlayers = useMemo(() => players.filter((player) => !isBossPlayer(player)), [players]);
  const playerMap = useMemo(() => new Map(visiblePlayers.map((player) => [player.player_id, player])), [visiblePlayers]);

  const winner = useMemo(() => {
    if (!gameOver) return null;

    return (
      playerMap.get(gameOver.winner_id) ??
      visiblePlayers.find((player) => player.display_name === gameOver.winner_id) ??
      null
    );
  }, [gameOver, playerMap, visiblePlayers]);

  const summaryRows = useMemo(() => {
    if (!gameOver) return [];

    return gameOver.stats
      .filter((stat) => playerMap.has(stat.player_id))
      .sort((a, b) => {
        if (b.rounds_won !== a.rounds_won) return b.rounds_won - a.rounds_won;
        if (b.events_drawn !== a.events_drawn) return b.events_drawn - a.events_drawn;
        return b.items_used - a.items_used;
      })
      .map((stat) => {
        const player = playerMap.get(stat.player_id) ?? null;

        return {
          ...stat,
          displayName: player?.display_name || stat.player_id,
          isWinner: stat.player_id === gameOver.winner_id,
          isMe: stat.player_id === myPlayerId,
        };
      });
  }, [gameOver, myPlayerId, playerMap]);

  if (!gameOver) {
    return <div style={styles.loading}>加载中...</div>;
  }

  const handleRestart = async () => {
    if (isRestarting) return;

    setIsRestarting(true);

    try {
      await gameService.leaveRoom();
    } catch (error) {
      console.warn('[GameOverScene] leaveRoom failed', error);
    } finally {
      resetMatchState();
      setIsRestarting(false);
    }
  };

  const winnerFactionKey = winner?.faction?.trim() || '';
  const winnerFaction = winnerFactionKey ? factionMeta[winnerFactionKey] ?? null : null;
  const winnerDisplayName = winner?.display_name?.trim() || gameOver.winner_id;
  const winnerTagLabel = winnerFaction?.label || winner?.faction?.trim() || '-';
  const showWinnerFigure = Boolean(winner);

  return (
    <main style={styles.page}>
      <div style={styles.overlay} aria-hidden="true" />

      <section style={styles.heroSection} aria-label="游戏结果">
        <div style={styles.resultLabel}>Game Over</div>
        <h1 style={styles.title}>胜者</h1>
        <div
          style={{
            ...styles.winnerCard,
            ...(showWinnerFigure ? styles.winnerCardWithFigure : styles.winnerCardTextOnly),
          }}
        >
          {showWinnerFigure && winner && (
            <div style={styles.winnerFigureViewport} aria-hidden="true">
              <PhaserCharacterPreview
                faction={winner.faction}
                width={160}
                height={160}
                style={styles.winnerFigureCanvas}
              />
            </div>
          )}
          <div style={styles.winnerInfo}>
            <div style={styles.winnerName}>{winnerDisplayName}</div>
            <div style={styles.winnerTags}>
              <span>{winnerTagLabel}</span>
              {winner?.player_id === myPlayerId && <span>我</span>}
            </div>
          </div>
        </div>
      </section>

      <section style={styles.playerStage} aria-label="玩家站位">
        {visiblePlayers.slice(0, 4).map((player, index) => {
          const slot = playerSlots[index];
          const faction = factionMeta[player.faction] ?? factionMeta.qing_long;
          const isWinner = player.player_id === gameOver.winner_id;

          return (
            <div
              key={player.player_id || slot.key}
              style={{
                ...styles.playerSlot,
                ...slot.position,
                ...(isWinner ? styles.winnerPlayerSlot : undefined),
              }}
            >
              <div style={styles.figureViewport} aria-hidden="true">
                <PhaserCharacterPreview
                  faction={player.faction}
                  width={224}
                  height={224}
                  style={styles.figureCanvas}
                />
              </div>
              <div
                style={{
                  ...styles.playerPanel,
                  ...(isWinner ? styles.winnerPlayerPanel : undefined),
                }}
              >
                <div style={styles.playerName}>{player.display_name || player.player_id}</div>
                <div style={styles.playerTags}>
                  <span>{faction.label}</span>
                  {isWinner && <span>胜者</span>}
                  {player.player_id === myPlayerId && <span>我</span>}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section style={styles.summaryPanel} aria-label="结算统计">
        <div style={styles.panelHeader}>
          <h2 style={styles.panelTitle}>本局统计</h2>
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>玩家</th>
                <th style={styles.th}>胜场</th>
                <th style={styles.th}>事件</th>
                <th style={styles.th}>道具</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((stat) => (
                <tr
                  key={stat.player_id}
                  style={{
                    ...styles.row,
                    ...(stat.isWinner ? styles.winnerRow : undefined),
                  }}
                >
                  <td style={styles.td}>
                    {stat.displayName}
                    {stat.isMe ? ' · 我' : ''}
                  </td>
                  <td style={styles.td}>{stat.rounds_won}</td>
                  <td style={styles.td}>{stat.events_drawn}</td>
                  <td style={styles.td}>{stat.items_used}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div style={styles.restartAction}>
        <button
          type="button"
          style={{
            ...styles.restartButton,
            ...(isRestartPressed ? styles.restartButtonPressed : undefined),
            ...(isRestarting ? styles.restartButtonDisabled : undefined),
          }}
          onClick={() => void handleRestart()}
          onPointerDown={() => setIsRestartPressed(true)}
          onPointerUp={() => setIsRestartPressed(false)}
          onPointerLeave={() => setIsRestartPressed(false)}
          onPointerCancel={() => setIsRestartPressed(false)}
          onKeyDown={(event) => {
            if (event.key === ' ' || event.key === 'Enter') {
              setIsRestartPressed(true);
            }
          }}
          onKeyUp={() => setIsRestartPressed(false)}
          disabled={isRestarting}
        >
          {isRestarting ? '返回中...' : '重新开始'}
        </button>
      </div>
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
    color: '#fff8d7',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, rgba(7, 11, 16, 0.22), rgba(8, 11, 14, 0.68))',
  },
  loading: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff8d7',
    backgroundImage: 'url("/assets/waiting.png")',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    fontFamily: 'Zpix, sans-serif',
  },
  heroSection: {
    position: 'absolute',
    left: '50%',
    top: '7%',
    transform: 'translateX(-50%)',
    width: 'min(720px, calc(100vw - 32px))',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    textShadow: '0 3px 0 rgba(62, 38, 29, 0.72), 0 10px 24px rgba(0, 0, 0, 0.4)',
  },
  resultLabel: {
    fontSize: 'clamp(12px, 1.2vw, 15px)',
    color: '#f3dfab',
    marginBottom: '8px',
  },
  title: {
    margin: 0,
    fontSize: 'clamp(36px, 5vw, 64px)',
    lineHeight: 1,
  },
  winnerCard: {
    marginTop: '20px',
    width: 'min(520px, 100%)',
    minHeight: '132px',
    padding: '18px 22px',
    display: 'grid',
    alignItems: 'center',
    justifyItems: 'center',
    gap: '18px',
    background: 'rgba(22, 29, 32, 0.68)',
    border: '1px solid rgba(255, 232, 166, 0.44)',
    borderRadius: '8px',
    boxShadow: '0 18px 40px rgba(0, 0, 0, 0.28)',
    backdropFilter: 'blur(3px)',
  },
  winnerCardWithFigure: {
    gridTemplateColumns: '120px minmax(0, 1fr)',
  },
  winnerCardTextOnly: {
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
  winnerFigureViewport: {
    width: '100%',
    aspectRatio: '1 / 1',
    overflow: 'hidden',
    imageRendering: 'pixelated',
    filter: 'drop-shadow(0 14px 14px rgba(0, 0, 0, 0.5))',
  },
  winnerFigureCanvas: {
    width: '100%',
    height: '100%',
  },
  winnerInfo: {
    width: '100%',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    textAlign: 'center',
  },
  winnerName: {
    width: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'clamp(24px, 3vw, 38px)',
    color: '#fff5c5',
  },
  winnerTags: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: '6px',
    color: '#ead8a0',
    fontSize: 'clamp(11px, 1vw, 14px)',
  },
  playerStage: {
    position: 'absolute',
    inset: 0,
    zIndex: 1,
    pointerEvents: 'none',
  },
  playerSlot: {
    position: 'absolute',
    transform: 'translate(-50%, -100%)',
    width: 'clamp(160px, 13.5vw, 224px)',
    aspectRatio: '1 / 1',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center',
    filter: 'drop-shadow(0 12px 12px rgba(0, 0, 0, 0.45)) brightness(0.92)',
  },
  winnerPlayerSlot: {
    filter: 'drop-shadow(0 12px 18px rgba(255, 225, 120, 0.25)) brightness(1.04)',
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
    left: '50%',
    top: '80%',
    transform: 'translateX(-50%)',
    minWidth: 'clamp(110px, 10vw, 156px)',
    maxWidth: 'min(220px, 22vw)',
    padding: '7px 9px',
    color: '#fdf5d0',
    background: 'rgba(29, 35, 35, 0.72)',
    border: '1px solid rgba(255, 232, 166, 0.4)',
    borderRadius: '8px',
    boxShadow: '0 9px 18px rgba(0, 0, 0, 0.28)',
    backdropFilter: 'blur(2px)',
  },
  winnerPlayerPanel: {
    background: 'rgba(60, 48, 18, 0.76)',
    borderColor: 'rgba(255, 222, 124, 0.68)',
  },
  playerName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'clamp(12px, 1.15vw, 15px)',
    fontWeight: 900,
    lineHeight: 1.3,
    textAlign: 'center',
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
  summaryPanel: {
    position: 'absolute',
    left: '24px',
    top: '22%',
    width: 'min(420px, calc(100vw - 32px))',
    maxHeight: '70vh',
    padding: '18px 20px 20px',
    zIndex: 1,
    background: 'rgba(13, 20, 22, 0.8)',
    border: '1px solid rgba(255, 232, 166, 0.34)',
    borderRadius: '8px',
    boxShadow: '0 18px 40px rgba(0, 0, 0, 0.28)',
    backdropFilter: 'blur(2px)',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: '14px',
  },
  panelTitle: {
    margin: 0,
    fontSize: 'clamp(18px, 2vw, 26px)',
  },
  restartAction: {
    position: 'absolute',
    left: '50%',
    bottom: '4%',
    transform: 'translateX(-50%)',
    zIndex: 1,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'auto',
  },
  restartButton: {
    minWidth: '288px',
    minHeight: '88px',
    padding: '16px 36px',
    color: '#3c3833',
    backgroundColor: 'transparent',
    backgroundImage: 'url("/assets/button/button_up.png")',
    backgroundSize: '100% 100%',
    backgroundRepeat: 'no-repeat',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '34px',
    textShadow: '0 1px 0 rgba(255,255,255,0.75)',
    imageRendering: 'pixelated',
  },
  restartButtonPressed: {
    backgroundImage: 'url("/assets/button/button_press.png")',
    transform: 'translateY(2px)',
  },
  restartButtonDisabled: {
    filter: 'grayscale(0.7)',
    opacity: 0.72,
    cursor: 'not-allowed',
  },
  tableWrap: {
    width: '100%',
    overflowX: 'auto',
    overflowY: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    color: '#fff7d6',
    tableLayout: 'fixed',
  },
  th: {
    padding: '10px 12px',
    fontSize: '13px',
    color: '#f1e0ad',
    textAlign: 'left',
    borderBottom: '1px solid rgba(255, 232, 166, 0.24)',
  },
  row: {
    background: 'transparent',
  },
  winnerRow: {
    background: 'rgba(116, 88, 21, 0.22)',
  },
  td: {
    padding: '11px 12px',
    fontSize: '13px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};

export default GameOverScene;
