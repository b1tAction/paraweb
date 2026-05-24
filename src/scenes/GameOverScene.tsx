import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { PhaserCharacterPreview } from '../components/PhaserCharacterPreview';
import { GameOverAnimation } from './GameOverAnimation';
import { isBossPlayer } from '../game/bossVisualConfig';
import { getAchievementDef } from '../game/achievementDefs';
import { getFactionColors, getScoreCategoryColor } from '../game/scoreCategoryColors';
import { gameService } from '../service/NakamaService';
import { useGameStore } from '../store/gameStore';
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

export const GameOverScene: React.FC = () => {
  const gameOver = useGameStore((s) => s.gameOver);
  const gameOverAnimationComplete = useGameStore((s) => s.gameOverAnimationComplete);
  const players = useGameStore((s) => s.players);
  const myPlayerId = useGameStore((s) => s.myPlayerId);
  const resetMatchState = useGameStore((s) => s.resetMatchState);
  const setGameOverAnimationComplete = useGameStore((s) => s.setGameOverAnimationComplete);

  const [isRestarting, setIsRestarting] = useState(false);
  const [isRestartPressed, setIsRestartPressed] = useState(false);

  const visiblePlayers = useMemo(() => players.filter((player) => !isBossPlayer(player)), [players]);
  const playerMap = useMemo(
    () => new Map(visiblePlayers.map((player) => [player.player_id, player])),
    [visiblePlayers],
  );

  // Faction lookup from players array
  const factionLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of visiblePlayers) {
      map[p.player_id] = p.faction;
    }
    return map;
  }, [visiblePlayers]);

  // Disambiguated display name map
  const disambiguatedNames = useMemo(() => {
    const allPlayersData = visiblePlayers.map((p) => ({
      displayName: p.display_name || p.player_id,
      userId: p.player_id,
    }));
    const map: Record<string, string> = {};
    for (const p of visiblePlayers) {
      map[p.player_id] = getDisambiguatedDisplayName(p.display_name || p.player_id, p.player_id, allPlayersData);
    }
    return map;
  }, [visiblePlayers]);

  const getPlayerName = (playerId: string): string => {
    return disambiguatedNames[playerId] || playerId;
  };

  // Champion from rankings[0]
  const champion = useMemo(() => {
    if (!gameOver || gameOver.rankings.length === 0) return null;
    return gameOver.rankings[0];
  }, [gameOver]);

  // Rankings enriched with faction and display info
  const enrichedRankings = useMemo(() => {
    if (!gameOver) return [];
    return gameOver.rankings.map((r) => ({
      ...r,
      faction: factionLookup[r.player_id] ?? '',
      displayName: getPlayerName(r.player_id),
      isMe: r.player_id === myPlayerId,
      isChampion: r.rank === 1,
    }));
  }, [gameOver, factionLookup, getPlayerName, myPlayerId]);

  // Stats enriched with faction
  const enrichedStats = useMemo(() => {
    if (!gameOver) return [];
    return gameOver.stats
      .filter((stat) => !stat.player_id.includes('beeeeeef')) // Exclude Boss from main table
      .map((stat) => ({
        ...stat,
        faction: factionLookup[stat.player_id] ?? '',
        displayName: getPlayerName(stat.player_id),
        isMe: stat.player_id === myPlayerId,
        isChampion: champion?.player_id === stat.player_id,
      }));
  }, [gameOver, factionLookup, getPlayerName, myPlayerId, champion]);

  // Handle animation completion
  const handleAnimationComplete = useCallback(() => {
    setGameOverAnimationComplete(true);
  }, [setGameOverAnimationComplete]);

  if (!gameOver) {
    return <div style={styles.loading}>加载中...</div>;
  }

  // If animation not complete, show the animation overlay
  if (!gameOverAnimationComplete) {
    return <GameOverAnimation onComplete={handleAnimationComplete} />;
  }

  // ====== Final settlement page ======

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

  const championPlayer = champion ? playerMap.get(champion.player_id) : null;
  const championFactionKey = championPlayer?.faction?.trim() || (champion ? factionLookup[champion.player_id] : '');
  const championFaction = championFactionKey ? (factionMeta[championFactionKey] ?? null) : null;
  const championDisplayName = champion ? getPlayerName(champion.player_id) : '-';
  const championTagLabel = championFaction?.label || championFactionKey || '-';
  const showChampionFigure = Boolean(championPlayer);

  return (
    <main style={styles.page}>
      <div style={styles.overlay} aria-hidden="true" />

      {/* Champion banner */}
      <section style={styles.heroSection} aria-label="游戏结果">
        <div style={styles.resultLabel}>Game Over</div>
        <h1 style={styles.title}>胜者</h1>
        <div
          style={{
            ...styles.winnerCard,
            ...(showChampionFigure ? styles.winnerCardWithFigure : styles.winnerCardTextOnly),
          }}
        >
          {showChampionFigure && championPlayer && (
            <div style={styles.winnerFigureViewport} aria-hidden="true">
              <PhaserCharacterPreview
                faction={championPlayer.faction}
                width={160}
                height={160}
                style={styles.winnerFigureCanvas}
              />
            </div>
          )}
          <div style={styles.winnerInfo}>
            <div style={styles.winnerName}>{championDisplayName}</div>
            <div style={styles.winnerTags}>
              <span>{championTagLabel}</span>
              {champion?.player_id === myPlayerId && <span>我</span>}
              <span style={{ color: '#FFD700' }}>{champion?.total_score ?? 0} pts</span>
            </div>
          </div>
        </div>
      </section>

      {/* Player stage */}
      <section style={styles.playerStage} aria-label="玩家站位">
        {visiblePlayers.slice(0, 4).map((player, index) => {
          const slot = playerSlots[index];
          const faction = factionMeta[player.faction] ?? factionMeta.qing_long;
          const isChampionPlayer = player.player_id === champion?.player_id;
          const playerRanking = gameOver.rankings.find((r) => r.player_id === player.player_id);

          return (
            <div
              key={player.player_id || slot.key}
              style={{
                ...styles.playerSlot,
                ...slot.position,
                ...(isChampionPlayer ? styles.winnerPlayerSlot : undefined),
              }}
            >
              <div style={styles.figureViewport} aria-hidden="true">
                <PhaserCharacterPreview faction={player.faction} width={256} height={256} style={styles.figureCanvas} />
              </div>
              <div
                style={{
                  ...styles.playerPanel,
                  ...slot.panel,
                  ...(isChampionPlayer ? styles.winnerPlayerPanel : undefined),
                }}
              >
                <div style={styles.playerName}>{getPlayerName(player.player_id)}</div>
                <div style={styles.playerTags}>
                  <span>{faction.label}</span>
                  {isChampionPlayer && <span style={{ color: '#FFD700' }}>胜者</span>}
                  {player.player_id === myPlayerId && <span>我</span>}
                  {playerRanking && <span>{playerRanking.total_score}pts</span>}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* Rankings + Stats panel */}
      <section style={styles.summaryPanel} aria-label="排名与统计">
        {/* Rankings table */}
        <div style={styles.panelHeader}>
          <h2 style={styles.panelTitle}>排名</h2>
        </div>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>排名</th>
                <th style={styles.th}>玩家</th>
                <th style={styles.th}>阵营</th>
                <th style={styles.thScore}>总分</th>
                <th style={styles.thScore}>小游戏</th>
                <th style={styles.thScore}>Boss</th>
                <th style={styles.thScore}>道具</th>
                <th style={styles.thScore}>成就</th>
              </tr>
            </thead>
            <tbody>
              {enrichedRankings.map((r) => (
                <tr
                  key={r.player_id}
                  style={{
                    ...styles.row,
                    ...(r.isChampion ? styles.winnerRow : undefined),
                  }}
                >
                  <td style={styles.td}>{r.rank}</td>
                  <td style={styles.td}>
                    {r.displayName}
                    {r.isMe ? ' · 我' : ''}
                  </td>
                  <td style={styles.td}>{factionMeta[r.faction]?.label ?? r.faction}</td>
                  <td style={{ ...styles.td, fontWeight: 700 }}>{r.total_score}</td>
                  <td style={{ ...styles.td, color: getScoreCategoryColor('mini_game') }}>{r.mini_game_score}</td>
                  <td style={{ ...styles.td, color: getScoreCategoryColor('boss') }}>{r.boss_score}</td>
                  <td style={{ ...styles.td, color: getScoreCategoryColor('item') }}>{r.item_score}</td>
                  <td style={{ ...styles.td, color: getScoreCategoryColor('achievement') }}>{r.achievement_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Detailed stats table */}
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
                <th style={styles.th}>Boss伤害</th>
                <th style={styles.th}>成就</th>
              </tr>
            </thead>
            <tbody>
              {enrichedStats.map((stat) => (
                <tr
                  key={stat.player_id}
                  style={{
                    ...styles.row,
                    ...(stat.isChampion ? styles.winnerRow : undefined),
                  }}
                >
                  <td style={styles.td}>
                    {stat.displayName}
                    {stat.isMe ? ' · 我' : ''}
                  </td>
                  <td style={styles.td}>{stat.rounds_won}</td>
                  <td style={styles.td}>{stat.events_drawn}</td>
                  <td style={styles.td}>{stat.items_used}</td>
                  <td style={styles.td}>{stat.boss_damage_dealt}</td>
                  <td style={styles.td}>
                    {stat.achievements.map((a) => {
                      const def = getAchievementDef(a);
                      return def ? def.name : a;
                    }).join(', ') || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Achievements display */}
        {gameOver.rankings.some((r) => r.achievements.length > 0) && (
          <div style={styles.achievementsSection}>
            <h3 style={styles.achievementTitle}>成就一览</h3>
            <div style={styles.achievementGrid}>
              {gameOver.rankings
                .filter((r) => r.achievements.length > 0)
                .flatMap((r) =>
                  r.achievements.map((a) => ({
                    type: a,
                    playerName: getPlayerName(r.player_id),
                    faction: factionLookup[r.player_id] ?? '',
                  })),
                )
                .map(({ type, playerName, faction }) => {
                  const def = getAchievementDef(type);
                  const colors = getFactionColors(faction);
                  return (
                    <div key={`${type}-${playerName}`} style={{ ...styles.achievementCard, borderColor: colors.primary }}>
                      <div style={{ ...styles.achievementName, color: getScoreCategoryColor('achievement') }}>
                        {def?.name ?? type}
                      </div>
                      <div style={styles.achievementDesc}>{def?.desc ?? ''}</div>
                      <div style={styles.achievementPoints}>+{def?.points ?? 0}</div>
                      <div style={styles.achievementPlayer}>{playerName}</div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
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
    backgroundImage: assetCssUrl('assets/waiting.webp'),
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
    backgroundImage: assetCssUrl('assets/waiting.webp'),
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
    width: 'clamp(168px, 14.6vw, 256px)',
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
    overflowY: 'auto',
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
  thScore: {
    padding: '10px 8px',
    fontSize: '12px',
    color: '#f1e0ad',
    textAlign: 'center',
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
  achievementsSection: {
    marginTop: '18px',
  },
  achievementTitle: {
    margin: '0 0 12px',
    fontSize: 'clamp(16px, 1.5vw, 22px)',
    color: getScoreCategoryColor('achievement'),
  },
  achievementGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
  },
  achievementCard: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid',
    background: 'rgba(20, 20, 40, 0.7)',
    minWidth: '140px',
  },
  achievementName: {
    fontSize: '16px',
    fontWeight: 700,
  },
  achievementDesc: {
    fontSize: '12px',
    color: '#ccc',
    marginTop: '4px',
  },
  achievementPoints: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#FFD700',
    marginTop: '4px',
  },
  achievementPlayer: {
    fontSize: '12px',
    color: '#ead8a0',
    marginTop: '4px',
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
    backgroundImage: assetCssUrl('assets/button/button_up.png'),
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
    backgroundImage: assetCssUrl('assets/button/button_press.png'),
    transform: 'translateY(2px)',
  },
  restartButtonDisabled: {
    filter: 'grayscale(0.7)',
    opacity: 0.72,
    cursor: 'not-allowed',
  },
};

export default GameOverScene;