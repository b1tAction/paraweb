import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PhaserCharacterPreview } from '../components/PhaserCharacterPreview';
import { getAchievementDef } from '../game/achievementDefs';
import { isBossPlayer } from '../game/bossVisualConfig';
import { getFactionColors, getScoreCategoryColor } from '../game/scoreCategoryColors';
import { gameService } from '../service/NakamaService';
import { useGameStore } from '../store/gameStore';
import { assetCssUrl } from '../utils/assets';
import { getDisambiguatedDisplayName } from '../utils/displayName';
import { GameOverAnimation } from './GameOverAnimation';
import { SceneStatusPanel } from './SceneStatusPanel';

const factionMeta: Record<string, { label: string }> = {
  qing_long: { label: '青龙' },
  zhu_que: { label: '朱雀' },
  bai_hu: { label: '白虎' },
  xuan_wu: { label: '玄武' },
};

const ACHIEVEMENT_VISIBLE_CARD_COUNT = 4;
const ACHIEVEMENT_CARD_HEIGHT = 116;
const ACHIEVEMENT_CARD_GAP = 10;
const ACHIEVEMENT_VIEWPORT_HEIGHT =
  ACHIEVEMENT_VISIBLE_CARD_COUNT * ACHIEVEMENT_CARD_HEIGHT +
  (ACHIEVEMENT_VISIBLE_CARD_COUNT - 1) * ACHIEVEMENT_CARD_GAP;

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

  const achievementViewportRef = useRef<HTMLDivElement | null>(null);
  const achievementWheelLockedRef = useRef(false);
  const achievementWheelUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isRestartPressed, setIsRestartPressed] = useState(false);

  const scheduleAchievementWheelUnlock = useCallback(() => {
    if (achievementWheelUnlockTimerRef.current) {
      clearTimeout(achievementWheelUnlockTimerRef.current);
    }

    achievementWheelUnlockTimerRef.current = setTimeout(() => {
      achievementWheelLockedRef.current = false;
      achievementWheelUnlockTimerRef.current = null;
    }, 220);
  }, []);

  const handleAchievementWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const viewport = achievementViewportRef.current;
    if (!viewport || event.deltaY === 0) return;

    event.preventDefault();

    if (achievementWheelLockedRef.current) {
      scheduleAchievementWheelUnlock();
      return;
    }

    const cards = Array.from(viewport.querySelectorAll<HTMLElement>('[data-achievement-card="true"]'));
    if (cards.length === 0) return;

    const visibleCardCount = Math.max(1, cards.reduce((count, card) => {
      const cardBottom = card.offsetTop - cards[0].offsetTop + card.offsetHeight;
      return cardBottom <= viewport.clientHeight + 1 ? count + 1 : count;
    }, 0));
    const maxStartIndex = Math.max(0, cards.length - visibleCardCount);
    const direction = event.deltaY > 0 ? 1 : -1;
    const nearestIndex = cards.reduce((closestIndex, card, index) => {
      const closestDistance = Math.abs(cards[closestIndex].offsetTop - viewport.scrollTop);
      const distance = Math.abs(card.offsetTop - viewport.scrollTop);
      return distance < closestDistance ? index : closestIndex;
    }, 0);
    const currentIndex = Math.min(nearestIndex, maxStartIndex);
    const nextIndex = Math.max(0, Math.min(cards.length - 1, currentIndex + direction));
    const clampedNextIndex = Math.min(nextIndex, maxStartIndex);

    achievementWheelLockedRef.current = true;
    viewport.scrollTo({ top: cards[clampedNextIndex].offsetTop, behavior: 'smooth' });
    scheduleAchievementWheelUnlock();
  }, [scheduleAchievementWheelUnlock]);

  useEffect(() => {
    return () => {
      if (achievementWheelUnlockTimerRef.current) {
        clearTimeout(achievementWheelUnlockTimerRef.current);
      }
    };
  }, []);

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

  const getPlayerName = useCallback((playerId: string): string => {
    return disambiguatedNames[playerId] || playerId;
  }, [disambiguatedNames]);

  // Champion from rankings[0]
  const champion = useMemo(() => {
    if (!gameOver || gameOver.rankings.length === 0) return null;
    return gameOver.rankings[0];
  }, [gameOver]);

  // Stats enriched with faction and total score from rankings
  const enrichedStats = useMemo(() => {
    if (!gameOver) return [];
    const rankingByPlayerId = new Map(gameOver.rankings.map((r) => [r.player_id, r]));
    return gameOver.stats
      .filter((stat) => !stat.player_id.includes('beeeeeef')) // Exclude Boss from main table
      .map((stat) => {
        const ranking = rankingByPlayerId.get(stat.player_id);
        return {
          ...stat,
          faction: factionLookup[stat.player_id] ?? '',
          displayName: getPlayerName(stat.player_id),
          isMe: stat.player_id === myPlayerId,
          isChampion: champion?.player_id === stat.player_id,
          totalScore: ranking?.total_score ?? stat.total_score ?? 0,
        };
      })
      .sort((a, b) => b.totalScore - a.totalScore); // Sort by total score descending
  }, [gameOver, factionLookup, getPlayerName, myPlayerId, champion]);

  // Handle animation completion
  const handleAnimationComplete = useCallback(() => {
    setGameOverAnimationComplete(true);
  }, [setGameOverAnimationComplete]);

  if (!gameOver) {
    return (
      <SceneStatusPanel
        eyebrow="Game Over"
        title="结算加载中..."
        variant="loading"
      />
    );
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
  const showChampionFigure = Boolean(championFactionKey);

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
          {showChampionFigure && (
            <div style={styles.winnerFigureViewport} aria-hidden="true">
              <PhaserCharacterPreview
                faction={championFactionKey}
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

      
        {/* Stats panel */}
      <section style={styles.summaryPanel} aria-label="本局统计">
        {/* Detailed stats table */}
        <div style={styles.panelHeader}>
          <h2 style={styles.panelTitle}>本局统计</h2>
        </div>
        <div className="gameover-scroll" style={styles.statsTableViewport}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>玩家</th>
                <th style={styles.thScore}>总分</th>
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
                  <td style={{ ...styles.td, fontWeight: 700 }}>{stat.total_score}</td>
                  <td style={styles.td}>{stat.rounds_won}</td>
                  <td style={styles.td}>{stat.events_drawn}</td>
                  <td style={styles.td}>{stat.items_used}</td>
                  <td style={styles.td}>{stat.boss_damage_dealt}</td>
                  <td style={styles.td}>{stat.achievements.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Achievement panel - right side */}
      <section style={styles.achievementPanel} aria-label="成就一览">
        <div style={styles.panelHeader}>
          <h2 style={{ ...styles.panelTitle, color: getScoreCategoryColor('achievement') }}>成就一览</h2>
        </div>
        {gameOver.rankings.some((r) => r.achievements.length > 0) ? (
          <div
            ref={achievementViewportRef}
            className="gameover-scroll"
            style={styles.achievementViewport}
            onWheel={handleAchievementWheel}
          >
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
                    <div
                      key={`${type}-${playerName}`}
                      data-achievement-card="true"
                      style={{ ...styles.achievementCard, borderColor: colors.primary }}
                    >
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
        ) : (
          <div style={styles.achievementEmpty}>本局暂无成就</div>
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
    zIndex: 0,
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
  // ====== 1. 胜者区：向上提，并精简高度，防止压迫中间人物 ======
  heroSection: {
    position: 'absolute',
    left: '50%',
    top: '3%', // 从 7% 提到 3%
    transform: 'translateX(-50%)',
    width: 'min(640px, calc(100vw - 32px))',
    zIndex: 10, // 确保在最上层
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    textShadow: '0 3px 0 rgba(62, 38, 29, 0.72), 0 10px 24px rgba(0, 0, 0, 0.4)',
  },
  resultLabel: {
    fontSize: 'clamp(11px, 1vw, 13px)',
    color: '#f3dfab',
    marginBottom: '4px',
  },
  title: {
    margin: 0,
    fontSize: 'clamp(28px, 4vw, 48px)', // 略微缩小字体
    lineHeight: 1,
  },
  winnerCard: {
    marginTop: '10px', // 缩小间距
    width: 'min(460px, 100%)',
    minHeight: '90px', // 缩小高度
    padding: '10px 16px',
    display: 'grid',
    alignItems: 'center',
    justifyItems: 'center',
    gap: '12px',
    background: 'rgba(22, 29, 32, 0.85)', // 提高不透明度，文字更清晰
    border: '1px solid rgba(255, 232, 166, 0.44)',
    borderRadius: '8px',
    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(4px)',
  },
  winnerCardWithFigure: {
    gridTemplateColumns: '90px minmax(0, 1fr)', // 缩小立绘格子
  },
  winnerCardTextOnly: {
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
  winnerFigureViewport: {
    width: '100%',
    aspectRatio: '1 / 1',
    overflow: 'hidden',
    imageRendering: 'pixelated',
    filter: 'drop-shadow(0 8px 8px rgba(0, 0, 0, 0.5))',
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
    gap: '4px',
    textAlign: 'center',
  },
  winnerName: {
    width: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'clamp(20px, 2.5vw, 30px)',
    color: '#fff5c5',
  },
  winnerTags: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: '6px',
    color: '#ead8a0',
    fontSize: 'clamp(11px, 0.9vw, 13px)',
  },
  // ====== 2. 玩家舞台：调低层级，并整体稍微向下平移 ======
  playerStage: {
    position: 'absolute',
    inset: 0,
    top: '6%', // 整体舞台往下微调 6%，避开上方的胜者卡片
    zIndex: 1, // 放在统计面板的下方
    pointerEvents: 'none',
  },
  playerSlot: {
    position: 'absolute',
    transform: 'translate(-50%, -100%)',
    width: 'clamp(140px, 12vw, 220px)', // 稍微收敛一下立绘大小
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
    minWidth: 'clamp(110px, 10vw, 140px)',
    maxWidth: 'min(200px, 20vw)',
    padding: '6px 8px',
    color: '#fdf5d0',
    background: 'rgba(29, 35, 35, 0.85)',
    border: '1px solid rgba(255, 232, 166, 0.4)',
    borderRadius: '8px',
    boxShadow: '0 9px 18px rgba(0, 0, 0, 0.28)',
    backdropFilter: 'blur(2px)',
  },
  winnerPlayerPanel: {
    background: 'rgba(60, 48, 18, 0.85)',
    borderColor: 'rgba(255, 222, 124, 0.68)',
  },
  playerName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'clamp(12px, 1.1vw, 14px)',
    fontWeight: 900,
    lineHeight: 1.3,
    textAlign: 'center',
    textShadow: '0 2px 4px rgba(0, 0, 0, 0.65)',
  },
  playerTags: {
    marginTop: '4px',
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: '4px',
    color: '#e9d393',
    fontSize: 'clamp(10px, 0.9vw, 11px)',
    lineHeight: 1.2,
  },
  // ====== 3. 左右两侧面板 ======
  summaryPanel: {
    position: 'absolute',
    left: '24px',
    top: '24%',
    width: 'min(440px, calc(100vw - 32px))', // 宽度略微收紧
    maxHeight: '58vh',
    padding: '18px 20px 20px',
    zIndex: 5, // 高于舞台
    background: 'rgba(13, 20, 22, 0.85)',
    border: '1px solid rgba(255, 232, 166, 0.34)',
    borderRadius: '8px',
    boxShadow: '0 18px 40px rgba(0, 0, 0, 0.4)',
    backdropFilter: 'blur(2px)',
    overflow: 'hidden',
  },
  statsTableViewport: {
    maxHeight: '42vh',
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
    fontSize: 'clamp(18px, 1.8vw, 24px)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    color: '#fff7d6',
    tableLayout: 'fixed',
  },
  th: {
    padding: '10px 6px', // 紧凑间距
    fontSize: '12px',
    color: '#f1e0ad',
    textAlign: 'left',
    borderBottom: '1px solid rgba(255, 232, 166, 0.24)',
  },
  thScore: {
    padding: '10px 4px',
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
    padding: '10px 6px',
    fontSize: '12px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  achievementPanel: {
    position: 'absolute',
    right: '24px',
    top: '24%',
    width: 'min(280px, calc(100vw - 32px))',
    maxHeight: '66vh',
    padding: '18px 20px 20px',
    zIndex: 5, // 高于舞台
    background: 'rgba(13, 20, 22, 0.85)',
    border: '1px solid rgba(255, 232, 166, 0.34)',
    borderRadius: '8px',
    boxShadow: '0 18px 40px rgba(0, 0, 0, 0.4)',
    backdropFilter: 'blur(2px)',
    overflow: 'hidden',
  },
  achievementViewport: {
    height: ACHIEVEMENT_VIEWPORT_HEIGHT,
    maxHeight: 'calc(66vh - 64px)',
    overflowY: 'auto',
    paddingRight: '4px',
    overscrollBehaviorY: 'contain',
    scrollbarGutter: 'stable',
    scrollSnapType: 'y mandatory',
    scrollBehavior: 'smooth',
  },
  achievementEmpty: {
    textAlign: 'center',
    color: '#ead8a0',
    fontSize: '14px',
    padding: '20px 0',
  },
  achievementGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: ACHIEVEMENT_CARD_GAP,
  },
  achievementCard: {
    height: ACHIEVEMENT_CARD_HEIGHT,
    minHeight: ACHIEVEMENT_CARD_HEIGHT,
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid',
    background: 'rgba(20, 20, 40, 0.7)',
    overflow: 'hidden',
    scrollSnapAlign: 'start',
    scrollSnapStop: 'always',
  },
  achievementName: {
    fontSize: '15px',
    fontWeight: 700,
  },
  achievementDesc: {
    fontSize: '11px',
    color: '#ccc',
    marginTop: '2px',
  },
  achievementPoints: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#FFD700',
    marginTop: '2px',
  },
  achievementPlayer: {
    fontSize: '11px',
    color: '#ead8a0',
    marginTop: '2px',
  },
  // ====== 4. 重新开始按钮 ======
  restartAction: {
    position: 'absolute',
    left: '50%',
    bottom: '2%', // 从 4% 压到 2%，紧贴屏幕底部，给玄武守护航
    transform: 'translateX(-50%)',
    zIndex: 10, // 提到最顶层
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'auto',
  },
  restartButton: {
    minWidth: '240px', // 稍微缩小一点按钮基底
    minHeight: '74px',
    padding: '12px 28px',
    color: '#3c3833',
    backgroundColor: 'transparent',
    backgroundImage: assetCssUrl('assets/button/button_up.png'),
    backgroundSize: '100% 100%',
    backgroundRepeat: 'no-repeat',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '28px', // 字体略微收紧
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
