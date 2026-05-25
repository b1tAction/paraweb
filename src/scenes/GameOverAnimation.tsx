/**
 * GameOverAnimation - Overlay component for GameOver reveal animation.
 *
 * Three-phase animation:
 * 1. RANK_REVEAL: Reveal each player from lowest rank to highest,
 *    using AwardRevealCard (main card) + ScoreEventViewport (fixed event window).
 *    Sub-phases per player: identity → scoring → bouncing → done.
 * 2. CHAMPION: Spotlight animation for the 1st place winner.
 * 3. DONE: Fade out overlay, trigger onComplete callback.
 *
 * Uses requestAnimationFrame for score counter, CSS transitions/keyframes for cards and labels.
 */

import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PhaserCharacterPreview } from '../components/PhaserCharacterPreview';
import { getFactionColors, getRankStyle, getScoreCategoryColor } from '../game/scoreCategoryColors';
import { useGameStore } from '../store/gameStore';
import type { PlayerRanking, ScoreReason } from '../types/protocol';

// ========== Animation Phase ==========

enum AnimationPhase {
  RANK_REVEAL,
  CHAMPION,
  DONE,
}

// ========== Timing Constants (ms) ==========

const ENTRY_DURATION = 600;
const IDENTITY_PAUSE = 800;
const BASE_REASON_DURATION = 520;
const SCORE_BOUNCE_DURATION = 280;
const CHAMPION_ENLARGE_DURATION = 1000;
const CHAMPION_TITLE_DURATION = 2000;
const CHAMPION_STAY_DURATION = 1600;
const FADE_OUT_DURATION = 500;
const PAUSE_AFTER_REVEAL = 700;

// Score event viewport constants
const MAX_VISIBLE_REASONS = 5;
const EVENT_ITEM_HEIGHT = 34;
const EVENT_ITEM_GAP = 6;
const EVENT_VIEWPORT_PADDING_X = 14;
const EVENT_VIEWPORT_PADDING_Y = 10;
const EVENT_VIEWPORT_BORDER_WIDTH = 1;
const EVENT_LIST_HEIGHT = MAX_VISIBLE_REASONS * EVENT_ITEM_HEIGHT + (MAX_VISIBLE_REASONS - 1) * EVENT_ITEM_GAP;
const EVENT_VIEWPORT_HEIGHT = EVENT_LIST_HEIGHT + EVENT_VIEWPORT_PADDING_Y * 2 + EVENT_VIEWPORT_BORDER_WIDTH * 2;

// ========== Animation Step Builder ==========

interface AnimationStep {
  startScore: number;
  endScore: number;
  reason: ScoreReason;
  duration: number;
}

interface ScoreReasonVisual {
  icon: string;
  textColor: string;
  borderColor: string;
  background: string;
  glowColor: string;
}

const SCORE_REASON_VISUALS: Record<string, ScoreReasonVisual> = {
  mini_game: {
    icon: '◆',
    textColor: '#ffe66d',
    borderColor: 'rgba(255, 215, 0, 0.5)',
    background: 'rgba(255, 215, 0, 0.16)',
    glowColor: 'rgba(255, 215, 0, 0.16)',
  },
  boss: {
    icon: '▲',
    textColor: '#ff7a45',
    borderColor: 'rgba(255, 69, 0, 0.5)',
    background: 'rgba(255, 69, 0, 0.16)',
    glowColor: 'rgba(255, 69, 0, 0.16)',
  },
  item: {
    icon: '✦',
    textColor: '#7dff7d',
    borderColor: 'rgba(50, 205, 50, 0.5)',
    background: 'rgba(50, 205, 50, 0.16)',
    glowColor: 'rgba(50, 205, 50, 0.16)',
  },
  achievement: {
    icon: '★',
    textColor: '#f4e9ff',
    borderColor: 'rgba(199, 166, 255, 0.52)',
    background: 'rgba(147, 112, 219, 0.28)',
    glowColor: 'rgba(147, 112, 219, 0.18)',
  },
  total: {
    icon: '■',
    textColor: '#fff8d7',
    borderColor: 'rgba(255, 232, 166, 0.42)',
    background: 'rgba(255, 232, 166, 0.14)',
    glowColor: 'rgba(255, 232, 166, 0.14)',
  },
};

function getScoreReasonVisual(category: string): ScoreReasonVisual {
  return SCORE_REASON_VISUALS[category] ?? {
    icon: '•',
    textColor: getScoreCategoryColor(category),
    borderColor: 'rgba(255, 255, 255, 0.32)',
    background: 'rgba(255, 255, 255, 0.1)',
    glowColor: 'rgba(255, 255, 255, 0.12)',
  };
}

function buildAnimationSteps(scoreReasons: ScoreReason[]): AnimationStep[] {
  if (scoreReasons.length === 0) return [];
  const avgPoints = Math.max(1, scoreReasons.reduce((s, r) => s + Math.abs(r.points), 0) / scoreReasons.length);
  let currentScore = 0;
  return scoreReasons.map((reason) => {
    const points = Number.isFinite(reason.points) ? reason.points : 0;
    const startScore = currentScore;
    const endScore = currentScore + points;
    const duration = BASE_REASON_DURATION * (1 + Math.log2(Math.max(1, Math.abs(points) / avgPoints)));
    currentScore = endScore;
    return { startScore, endScore, reason: { ...reason, points }, duration };
  });
}

function getScoreReasonsForAnimation(ranking: PlayerRanking): ScoreReason[] {
  if (ranking.score_reasons.length > 0) return ranking.score_reasons;

  const fallbackReasons: ScoreReason[] = [
    { category: 'mini_game', reason: '小游戏积分', points: ranking.mini_game_score, round: 0 },
    { category: 'boss', reason: 'Boss积分', points: ranking.boss_score, round: 0 },
    { category: 'item', reason: '道具积分', points: ranking.item_score, round: 0 },
    { category: 'achievement', reason: '成就积分', points: ranking.achievement_score, round: 0 },
  ].filter((reason) => reason.points !== 0);

  if (fallbackReasons.length > 0) return fallbackReasons;
  if (ranking.total_score !== 0) {
    return [{ category: 'total', reason: '总积分', points: ranking.total_score, round: 0 }];
  }
  return [];
}

// ========== ScoreCounter ==========

function useAnimatedScore(targetScore: number, steps: AnimationStep[], isPlaying: boolean, resetKey: number) {
  const [displayScore, setDisplayScore] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const rafRef = useRef<number>(0);
  const stepStartTimeRef = useRef(0);

  // Reset internal state when resetKey changes (new player)
  useEffect(() => {
    if (!Number.isFinite(resetKey)) return;
    setDisplayScore(0);
    setCurrentStepIndex(-1);
  }, [resetKey]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    if (steps.length === 0) {
      setDisplayScore(targetScore);
      setCurrentStepIndex(0);
      return;
    }

    let stepIdx = 0;
    setDisplayScore(steps[0].startScore);
    setCurrentStepIndex(0);
    stepStartTimeRef.current = performance.now();

    const animate = (now: number) => {
      if (stepIdx >= steps.length) {
        setDisplayScore(targetScore);
        setCurrentStepIndex(steps.length);
        return;
      }

      const step = steps[stepIdx];
      const elapsed = now - stepStartTimeRef.current;
      const progress = Math.min(elapsed / step.duration, 1);
      const currentScore = step.startScore + (step.endScore - step.startScore) * progress;

      setDisplayScore(Math.round(currentScore));

      if (progress >= 1) {
        stepIdx++;
        if (stepIdx < steps.length) {
          setCurrentStepIndex(stepIdx);
          stepStartTimeRef.current = now;
        } else {
          setDisplayScore(targetScore);
          setCurrentStepIndex(steps.length);
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, steps, targetScore]);

  return { displayScore, currentStepIndex };
}

// ========== Faction Label Helper ==========

function getFactionLabel(faction: string): string {
  switch (faction) {
    case 'qing_long': return '青龙';
    case 'zhu_que': return '朱雀';
    case 'bai_hu': return '白虎';
    case 'xuan_wu': return '玄武';
    default: return faction;
  }
}

// ========== AwardRevealCard ==========

function AwardRevealCard({
  ranking,
  faction,
  isVisible,
  scorePhase,
  displayScore,
}: {
  ranking: PlayerRanking;
  faction: string;
  isVisible: boolean;
  scorePhase: 'idle' | 'identity' | 'playing' | 'bouncing' | 'done';
  displayScore: number;
}) {
  const factionColor = getFactionColors(faction);
  const rankStyle = getRankStyle(ranking.rank);

  // Show score only during playing/bouncing/done phases
  const showScore = scorePhase === 'playing' || scorePhase === 'bouncing' || scorePhase === 'done';

  return (
    <div
      style={{
        ...styles.awardCard,
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'scale(1)' : 'scale(0.85)',
        transition: `opacity ${ENTRY_DURATION}ms ease-out, transform ${ENTRY_DURATION}ms ease-out`,
        borderColor: factionColor.primary,
        boxShadow: isVisible ? `0 0 30px ${factionColor.primary}44` : 'none',
      }}
    >
      {/* Rank label */}
      <div style={{ ...styles.awardRank, color: rankStyle.color, fontWeight: rankStyle.fontWeight }}>
        {rankStyle.label}
      </div>

      {/* Character portrait */}
      <div style={styles.awardPortrait}>
        <PhaserCharacterPreview faction={faction} width={160} height={160} style={styles.awardFigureCanvas} />
      </div>

      {/* Player identity: faction tag + name */}
      <div style={styles.awardIdentity}>
        <div style={{ ...styles.factionTag, backgroundColor: factionColor.primary, color: faction === 'bai_hu' ? '#333' : '#fff' }}>
          {getFactionLabel(faction)}
        </div>
        <div style={styles.awardName}>{ranking.display_name}</div>
      </div>

      {/* Score counter - large, bottom of card */}
      {showScore && (
        <div
          style={{
            ...styles.awardScore,
            animation: scorePhase === 'bouncing' ? `scoreBounce ${SCORE_BOUNCE_DURATION}ms ease-out` : 'none',
          }}
        >
          {displayScore}
        </div>
      )}

    </div>
  );
}

// ========== ScoreEventViewport ==========

function ScoreEventViewport({
  playedReasons,
}: {
  playedReasons: ScoreReason[];
}) {
  // Only show the most recent MAX_VISIBLE_REASONS items
  const visibleReasons = playedReasons.slice(-MAX_VISIBLE_REASONS);

  return (
    <div style={styles.eventViewport}>
      {visibleReasons.map((reason, visibleIndex) => {
        // The last item (newest) gets the slide-in animation
        const isNewest = visibleIndex === visibleReasons.length - 1 && playedReasons.length > 0;
        const reasonIndex = playedReasons.length - visibleReasons.length + visibleIndex;
        const visual = getScoreReasonVisual(reason.category);
        return (
          <div
            key={`${reasonIndex}-${reason.category}-${reason.reason}-${reason.points}-${reason.round}`}
            style={{
              ...styles.eventItem,
              color: visual.textColor,
              borderColor: visual.borderColor,
              background: visual.background,
              boxShadow: `0 0 14px ${visual.glowColor}`,
              animation: isNewest ? 'scoreEventEnter 400ms ease-out both' : 'none',
            }}
          >
            <span style={styles.eventReasonText}>
              <span style={{ ...styles.eventIcon, color: visual.textColor }}>{visual.icon}</span>
              {reason.reason}
            </span>
            <span style={styles.eventPoints}>{reason.points >= 0 ? '+' : ''}{reason.points}</span>
          </div>
        );
      })}
    </div>
  );
}

// ========== ChampionSpotlight ==========

function ChampionSpotlight({
  ranking,
  faction,
  onComplete,
}: {
  ranking: PlayerRanking;
  faction: string;
  onComplete: () => void;
}) {
  const [phase, setPhase] = useState<'enlarge' | 'title' | 'stay' | 'fadeout'>('enlarge');
  const factionColor = getFactionColors(faction);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => setPhase('title'), CHAMPION_ENLARGE_DURATION));
    timers.push(setTimeout(() => setPhase('stay'), CHAMPION_ENLARGE_DURATION + CHAMPION_TITLE_DURATION));
    timers.push(setTimeout(() => setPhase('fadeout'), CHAMPION_ENLARGE_DURATION + CHAMPION_TITLE_DURATION + CHAMPION_STAY_DURATION));
    timers.push(setTimeout(() => onComplete(), CHAMPION_ENLARGE_DURATION + CHAMPION_TITLE_DURATION + CHAMPION_STAY_DURATION + FADE_OUT_DURATION));

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div
      style={{
        ...styles.championOverlay,
        opacity: phase === 'fadeout' ? 0 : 1,
        transition: phase === 'fadeout' ? `opacity ${FADE_OUT_DURATION}ms ease-out` : 'none',
      }}
    >
      {/* Champion card */}
      <div
        style={{
          ...styles.championCard,
          borderColor: '#FFD700',
          boxShadow: `0 0 60px #FFD70066, 0 0 120px #FFD70033`,
          transform: phase === 'enlarge' ? 'scale(1.1)' : 'scale(1.15)',
          transition: `transform ${CHAMPION_ENLARGE_DURATION}ms ease-out`,
        }}
      >
        <div style={styles.championPortrait} aria-hidden="true">
          <PhaserCharacterPreview faction={faction} width={180} height={180} style={styles.championFigureCanvas} />
        </div>
        <div style={{ color: factionColor.primary, fontSize: '18px', fontWeight: 700 }}>
          {getFactionLabel(faction)}
        </div>
        <div style={styles.championName}>{ranking.display_name}</div>
        <div style={styles.championScore}>{ranking.total_score}</div>
      </div>

      {/* Champion title */}
      {(phase === 'title' || phase === 'stay') && (
        <div style={styles.championTitle}>胜者</div>
      )}
    </div>
  );
}

// ========== Main Overlay Component ==========

interface GameOverAnimationProps {
  onComplete: () => void;
}

export function GameOverAnimation({ onComplete }: GameOverAnimationProps) {
  const gameOver = useGameStore((s) => s.gameOver);
  const players = useGameStore((s) => s.players);
  const [phase, setPhase] = useState<AnimationPhase>(AnimationPhase.RANK_REVEAL);
  const [revealIndex, setRevealIndex] = useState(-1);
  const [scorePhaseMap, setScorePhaseMap] = useState<Record<number, 'idle' | 'identity' | 'playing' | 'bouncing' | 'done'>>({});

  // Build faction lookup from players array
  const factionLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of players) {
      map[p.player_id] = p.faction;
    }
    return map;
  }, [players]);

  // Reveal order: from last ranking to first (rankings.length-1 → 0)
  const rankings = gameOver?.rankings ?? [];

  // Start the first reveal on mount - begin with 'identity' phase
  useEffect(() => {
    if (rankings.length === 0) return;
    const firstReveal = rankings.length - 1;
    setRevealIndex(firstReveal);
    setScorePhaseMap({ [firstReveal]: 'identity' });
  }, [rankings.length]);

  // Transition from 'identity' to 'playing' after IDENTITY_PAUSE
  useEffect(() => {
    if (revealIndex < 0 || revealIndex >= rankings.length) return;
    const currentPhase = scorePhaseMap[revealIndex];
    if (currentPhase !== 'identity') return;

    const timer = setTimeout(() => {
      setScorePhaseMap((prev) => ({ ...prev, [revealIndex]: 'playing' }));
    }, IDENTITY_PAUSE);

    return () => clearTimeout(timer);
  }, [revealIndex, scorePhaseMap, rankings.length]);

  // Handle when a player's score animation finishes
  const handleScorePhaseComplete = useCallback((idx: number) => {
    setScorePhaseMap((prev) => ({ ...prev, [idx]: 'bouncing' }));

    // After bounce, transition to 'done'
    setTimeout(() => {
      setScorePhaseMap((prev) => ({ ...prev, [idx]: 'done' }));
    }, SCORE_BOUNCE_DURATION);
  }, []);

  // Advance to next player after current one is done
  useEffect(() => {
    if (revealIndex < 0 || revealIndex >= rankings.length) return;
    const currentPhase = scorePhaseMap[revealIndex];
    if (currentPhase !== 'done') return;

    const nextIndex = revealIndex - 1;

    if (nextIndex < 0) {
      // All players revealed, move to champion phase
      setTimeout(() => setPhase(AnimationPhase.CHAMPION), PAUSE_AFTER_REVEAL);
    } else {
      // Reveal next player - start with identity phase
      setTimeout(() => {
        setRevealIndex(nextIndex);
        setScorePhaseMap((prev) => ({ ...prev, [nextIndex]: 'identity' }));
      }, PAUSE_AFTER_REVEAL);
    }
  }, [revealIndex, scorePhaseMap, rankings.length]);

  const handleChampionComplete = useCallback(() => {
    setPhase(AnimationPhase.DONE);
    onComplete();
  }, [onComplete]);

  // Skip button
  const handleSkip = useCallback(() => {
    setPhase(AnimationPhase.DONE);
    onComplete();
  }, [onComplete]);

  // Current player being revealed
  const currentScorePhase = revealIndex >= 0 && revealIndex < rankings.length
    ? (scorePhaseMap[revealIndex] ?? 'idle')
    : 'idle';

  const isCardVisible = currentScorePhase === 'identity' || currentScorePhase === 'playing' || currentScorePhase === 'bouncing' || currentScorePhase === 'done';
  const isScorePlaying = currentScorePhase === 'playing';

  // Build animation steps and run score counter for current player
  const currentRanking = revealIndex >= 0 && revealIndex < rankings.length ? rankings[revealIndex] : null;
  const currentScoreReasons = useMemo(
    () => currentRanking ? getScoreReasonsForAnimation(currentRanking) : [],
    [currentRanking],
  );
  const currentSteps = useMemo(
    () => buildAnimationSteps(currentScoreReasons),
    [currentScoreReasons],
  );
  const { displayScore, currentStepIndex } = useAnimatedScore(
    currentRanking?.total_score ?? 0,
    currentSteps,
    isScorePlaying,
    revealIndex, // resetKey: resets internal state when switching to a new player
  );

  // Detect when score animation finishes for the current player
  // Only trigger if currentStepIndex has been set for the current player (>= 0, not the reset -1)
  useEffect(() => {
    if (currentScorePhase === 'playing' && currentStepIndex >= 0 && currentStepIndex >= currentSteps.length && displayScore === (currentRanking?.total_score ?? 0) && revealIndex >= 0) {
      handleScorePhaseComplete(revealIndex);
    }
  }, [currentScorePhase, currentStepIndex, currentSteps.length, displayScore, currentRanking, revealIndex, handleScorePhaseComplete]);

  useEffect(() => {
    if (!gameOver || rankings.length === 0) {
      onComplete();
    }
  }, [gameOver, rankings.length, onComplete]);

  // Played reasons for the event viewport
  const playedReasonCount = currentScorePhase === 'playing' ? currentStepIndex + 1 : currentStepIndex;
  const playedReasons = currentRanking
    ? currentScoreReasons.slice(0, Math.max(0, Math.min(currentScoreReasons.length, playedReasonCount)))
    : [];

  if (!gameOver || rankings.length === 0) {
    return null;
  }

  return (
    <div style={styles.overlay}>
      {/* Background decoration layer */}
      <div style={styles.overlayBackground} />

      {/* Skip button */}
      <button type="button" style={styles.skipButton} onClick={handleSkip}>
        跳过动画
      </button>

      {/* Phase: RANK_REVEAL */}
      {phase === AnimationPhase.RANK_REVEAL && currentRanking && isCardVisible && (
        <div style={styles.revealLayout}>
          {/* AwardRevealCard - main card with character, rank, name, score */}
          <AwardRevealCard
            ranking={currentRanking}
            faction={factionLookup[currentRanking.player_id] ?? ''}
            isVisible={isCardVisible}
            scorePhase={currentScorePhase}
            displayScore={displayScore}
          />

          {/* ScoreEventViewport - fixed-height event window on right side */}
          {(currentScorePhase === 'playing' || currentScorePhase === 'bouncing' || currentScorePhase === 'done') && playedReasons.length > 0 && (
            <ScoreEventViewport playedReasons={playedReasons} />
          )}
        </div>
      )}

      {/* Phase: CHAMPION */}
      {phase === AnimationPhase.CHAMPION && (
        <ChampionSpotlight
          ranking={rankings[0]}
          faction={factionLookup[rankings[0].player_id] ?? ''}
          onComplete={handleChampionComplete}
        />
      )}

      {/* Phase: DONE - empty, overlay fades out via parent */}
    </div>
  );
}

// ========== Styles ==========

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2000,
    background: '#070b10', // Opaque background, no transparency
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '"Zpix", sans-serif',
    overflow: 'hidden',
  },
  overlayBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: `
      radial-gradient(circle at 50% 38%, rgba(255, 216, 120, 0.08), transparent 34%),
      linear-gradient(180deg, #090e13 0%, #050709 100%)
    `,
    zIndex: 0,
  },
  skipButton: {
    position: 'absolute',
    bottom: '24px',
    right: '24px',
    zIndex: 10,
    padding: '8px 16px',
    backgroundColor: 'rgba(22,29,32,0.68)',
    color: '#fff8d7',
    border: '1px solid rgba(255,232,166,0.34)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    backdropFilter: 'blur(3px)',
  },
  // Main card + event window layout
  revealLayout: {
    position: 'relative',
    zIndex: 5,
    display: 'flex',
    gap: '24px',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  // AwardRevealCard - main card styles
  awardCard: {
    width: 'min(520px, 86vw)',
    minHeight: '360px',
    maxHeight: '420px',
    padding: '24px 28px',
    borderRadius: '12px',
    border: '1px solid rgba(255,232,166,0.44)',
    background: 'rgba(22,29,32,0.68)',
    backdropFilter: 'blur(3px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    boxShadow: '0 18px 40px rgba(0, 0, 0, 0.28)',
  },
  awardRank: {
    fontSize: '36px',
    lineHeight: 1,
    textAlign: 'center',
  },
  awardPortrait: {
    width: '160px',
    height: '160px',
    overflow: 'hidden',
    imageRendering: 'pixelated',
    filter: 'drop-shadow(0 8px 8px rgba(0,0,0,0.45))',
  },
  awardFigureCanvas: {
    width: '100%',
    height: '100%',
  },
  awardIdentity: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    textAlign: 'center',
  },
  factionTag: {
    padding: '3px 10px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 700,
  },
  awardName: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#fff8d7',
  },
  awardScore: {
    fontSize: '96px',
    fontWeight: 900,
    color: '#fff5c5',
    textShadow: '0 0 20px rgba(255,215,0,0.5)',
    lineHeight: 1,
    textAlign: 'center',
  },
  // ScoreEventViewport - fixed-height event window
  eventViewport: {
    width: '320px',
    height: EVENT_VIEWPORT_HEIGHT,
    overflow: 'hidden',
    padding: `${EVENT_VIEWPORT_PADDING_Y}px ${EVENT_VIEWPORT_PADDING_X}px`,
    borderRadius: '8px',
    border: `${EVENT_VIEWPORT_BORDER_WIDTH}px solid rgba(255,232,166,0.28)`,
    background: 'rgba(22,29,32,0.56)',
    backdropFilter: 'blur(2px)',
    display: 'flex',
    flexDirection: 'column',
    gap: EVENT_ITEM_GAP,
    boxShadow: '0 12px 24px rgba(0, 0, 0, 0.18)',
  },
  eventItem: {
    fontSize: '14px',
    fontWeight: 500,
    height: EVENT_ITEM_HEIGHT,
    minHeight: EVENT_ITEM_HEIGHT,
    padding: '0 10px',
    lineHeight: 1,
    borderRadius: '6px',
    border: '1px solid transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    whiteSpace: 'nowrap',
  },
  eventReasonText: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  eventIcon: {
    display: 'inline-block',
    width: '16px',
    marginRight: '6px',
    textAlign: 'center',
  },
  eventPoints: {
    flexShrink: 0,
    fontWeight: 700,
  },
  // Champion spotlight styles
  championOverlay: {
    position: 'relative',
    zIndex: 5,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  championCard: {
    padding: '36px 48px',
    borderRadius: '12px',
    border: '2px solid rgba(255,232,166,0.44)',
    background: 'rgba(22,29,32,0.68)',
    backdropFilter: 'blur(3px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    boxShadow: '0 18px 40px rgba(0, 0, 0, 0.28)',
  },
  championPortrait: {
    width: '180px',
    height: '180px',
    overflow: 'hidden',
    imageRendering: 'pixelated',
    filter: 'drop-shadow(0 12px 12px rgba(0, 0, 0, 0.48))',
  },
  championFigureCanvas: {
    width: '100%',
    height: '100%',
  },
  championName: {
    fontSize: '32px',
    fontWeight: 800,
    color: '#fff5c5',
  },
  championScore: {
    fontSize: '80px',
    fontWeight: 900,
    color: '#fff5c5',
    textShadow: '0 0 30px rgba(255,215,0,0.7)',
    lineHeight: 1,
  },
  championTitle: {
    fontSize: '56px',
    fontWeight: 900,
    color: '#FFD700',
    textShadow: '0 0 40px rgba(255,215,0,0.6)',
    animation: 'championTitleFade 0.8s ease-out both',
  },
};
