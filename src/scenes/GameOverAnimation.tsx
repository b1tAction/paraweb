/**
 * GameOverAnimation - Overlay component for GameOver reveal animation.
 *
 * Three-phase animation:
 * 1. RANK_REVEAL: Reveal each player from lowest rank to highest,
 *    with score_reasons-driven score counter and floating reason labels.
 * 2. CHAMPION: Spotlight animation for the 1st place winner.
 * 3. DONE: Fade out overlay, trigger onComplete callback.
 *
 * Uses requestAnimationFrame for score counter, CSS transitions/keyframes for cards and labels.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerRanking, ScoreReason } from '../types/protocol';
import { useGameStore } from '../store/gameStore';
import { getAchievementDef } from '../game/achievementDefs';
import { getFactionColors, getRankStyle, getScoreCategoryColor } from '../game/scoreCategoryColors';

// ========== Animation Phase ==========

enum AnimationPhase {
  RANK_REVEAL,
  CHAMPION,
  DONE,
}

// ========== Timing Constants (ms) ==========

const ENTRY_DURATION = 800;
const BASE_REASON_DURATION = 300;
const REASON_LABEL_STAY = 500;
const SCORE_BOUNCE_DURATION = 300;
const CHAMPION_ENLARGE_DURATION = 1000;
const CHAMPION_TITLE_DURATION = 1500;
const CHAMPION_STAY_DURATION = 1000;
const FADE_OUT_DURATION = 500;
const PAUSE_AFTER_REVEAL = 600;

// ========== Animation Step Builder ==========

interface AnimationStep {
  startScore: number;
  endScore: number;
  reason: ScoreReason;
  duration: number;
}

function buildAnimationSteps(scoreReasons: ScoreReason[]): AnimationStep[] {
  if (scoreReasons.length === 0) return [];
  const avgPoints = scoreReasons.reduce((s, r) => s + r.points, 0) / scoreReasons.length;
  let currentScore = 0;
  return scoreReasons.map((reason) => {
    const startScore = currentScore;
    const endScore = currentScore + reason.points;
    const duration = BASE_REASON_DURATION * (1 + Math.log2(Math.max(1, reason.points / avgPoints)));
    currentScore = endScore;
    return { startScore, endScore, reason, duration };
  });
}

// ========== ScoreCounter ==========

function useAnimatedScore(targetScore: number, steps: AnimationStep[], isPlaying: boolean) {
  const [displayScore, setDisplayScore] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [floatingReason, setFloatingReason] = useState<ScoreReason | null>(null);
  const rafRef = useRef<number>(0);
  const stepStartTimeRef = useRef(0);

  useEffect(() => {
    if (!isPlaying || steps.length === 0) return;

    let stepIdx = 0;
    setDisplayScore(steps[0].startScore);
    setCurrentStepIndex(0);
    setFloatingReason(steps[0].reason);
    stepStartTimeRef.current = performance.now();

    const animate = (now: number) => {
      if (stepIdx >= steps.length) {
        setDisplayScore(targetScore);
        setCurrentStepIndex(steps.length);
        setFloatingReason(null);
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
          setFloatingReason(steps[stepIdx].reason);
          stepStartTimeRef.current = now;
        } else {
          setDisplayScore(targetScore);
          setCurrentStepIndex(steps.length);
          setFloatingReason(null);
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, steps, targetScore]);

  return { displayScore, currentStepIndex, floatingReason };
}

// ========== AchievementBadge ==========

function AchievementBadge({ type, index }: { type: string; index: number }) {
  const def = getAchievementDef(type);
  if (!def) return null;

  return (
    <div
      style={{
        ...styles.achievementBadge,
        animationDelay: `${index * 150}ms`,
        backgroundColor: getScoreCategoryColor('achievement'),
      }}
    >
      <span style={styles.achievementBadgeName}>{def.name}</span>
      <span style={styles.achievementBadgePoints}>+{def.points}</span>
    </div>
  );
}

// ========== RankRevealCard ==========

function RankRevealCard({
  ranking,
  faction,
  isVisible,
  scorePhase,
  onScorePhaseComplete,
}: {
  ranking: PlayerRanking;
  faction: string;
  isVisible: boolean;
  scorePhase: 'idle' | 'playing' | 'bouncing' | 'done';
  onScorePhaseComplete: () => void;
}) {
  const steps = useMemo(() => buildAnimationSteps(ranking.score_reasons), [ranking.score_reasons]);
  const isPlaying = scorePhase === 'playing';
  const { displayScore, currentStepIndex, floatingReason } = useAnimatedScore(
    ranking.total_score,
    steps,
    isPlaying,
  );
  const factionColor = getFactionColors(faction);
  const rankStyle = getRankStyle(ranking.rank);

  // Detect when score animation finishes
  useEffect(() => {
    if (scorePhase === 'playing' && currentStepIndex >= steps.length && displayScore === ranking.total_score) {
      onScorePhaseComplete();
    }
  }, [scorePhase, currentStepIndex, steps.length, displayScore, ranking.total_score, onScorePhaseComplete]);

  return (
    <div
      style={{
        ...styles.revealCard,
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateX(0) scale(1)' : 'translateX(-60px) scale(0.9)',
        transition: `opacity ${ENTRY_DURATION}ms ease-out, transform ${ENTRY_DURATION}ms ease-out`,
        borderColor: factionColor.primary,
        boxShadow: isVisible ? `0 0 40px ${factionColor.primary}44, 0 0 80px ${factionColor.primary}22` : 'none',
      }}
    >
      {/* Rank label */}
      <div style={{ ...styles.rankLabel, color: rankStyle.color, fontWeight: rankStyle.fontWeight }}>
        {rankStyle.label}
      </div>

      {/* Player info */}
      <div style={styles.playerInfo}>
        <div style={{ ...styles.factionTag, backgroundColor: factionColor.primary, color: faction === 'bai_hu' ? '#333' : '#fff' }}>
          {faction === 'qing_long' ? '青龙' : faction === 'zhu_que' ? '朱雀' : faction === 'bai_hu' ? '白虎' : faction === 'xuan_wu' ? '玄武' : faction}
        </div>
        <div style={styles.displayName}>{ranking.display_name}</div>
      </div>

      {/* Score counter */}
      <div style={styles.scoreCounterContainer}>
        <div
          style={{
            ...styles.scoreCounter,
            animation: scorePhase === 'bouncing' ? `scoreBounce ${SCORE_BOUNCE_DURATION}ms ease-out` : 'none',
          }}
        >
          {displayScore}
        </div>

        {/* Floating reason label */}
        {floatingReason && (
          <div
            style={{
              ...styles.floatingReason,
              color: getScoreCategoryColor(floatingReason.category),
            }}
          >
            {floatingReason.reason} +{floatingReason.points}
          </div>
        )}
      </div>

      {/* Score reasons list (completed ones) */}
      <div style={styles.reasonList}>
        {ranking.score_reasons.slice(0, Math.max(0, currentStepIndex)).map((r, i) => (
          <div
            key={i}
            style={{
              ...styles.reasonItem,
              color: getScoreCategoryColor(r.category),
              opacity: i < currentStepIndex ? 1 : 0.3,
            }}
          >
            {r.reason} +{r.points}
          </div>
        ))}
      </div>

      {/* Achievements */}
      {ranking.achievements.length > 0 && scorePhase === 'done' && (
        <div style={styles.achievementRow}>
          {ranking.achievements.map((a, i) => (
            <AchievementBadge key={a} type={a} index={i} />
          ))}
        </div>
      )}
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
        <div style={{ color: factionColor.primary, fontSize: '18px', fontWeight: 700 }}>
          {faction === 'qing_long' ? '青龙' : faction === 'zhu_que' ? '朱雀' : faction === 'bai_hu' ? '白虎' : '玄武'}
        </div>
        <div style={styles.championName}>{ranking.display_name}</div>
        <div style={styles.championScore}>{ranking.total_score}</div>
      </div>

      {/* Champion title */}
      {phase === 'title' || phase === 'stay' ? (
        <div style={styles.championTitle}>胜者</div>
      ) : null}

      {/* Achievements */}
      {ranking.achievements.length > 0 && (
        <div style={styles.championAchievementRow}>
          {ranking.achievements.map((a, i) => (
            <AchievementBadge key={a} type={a} index={i} />
          ))}
        </div>
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
  const [revealIndex, setRevealIndex] = useState(-1); // Start from -1, first tick moves to rankings.length-1
  const [scorePhaseMap, setScorePhaseMap] = useState<Record<number, 'idle' | 'playing' | 'bouncing' | 'done'>>({});

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

  // Start the first reveal on mount
  useEffect(() => {
    if (rankings.length === 0) return;
    const firstReveal = rankings.length - 1;
    setRevealIndex(firstReveal);
    setScorePhaseMap({ [firstReveal]: 'playing' });
  }, [rankings.length]);

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
      // Reveal next player
      setTimeout(() => {
        setRevealIndex(nextIndex);
        setScorePhaseMap((prev) => ({ ...prev, [nextIndex]: 'playing' }));
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

  if (!gameOver || rankings.length === 0) {
    // No data, skip directly to final page
    onComplete();
    return null;
  }

  return (
    <div style={styles.overlay}>
      {/* Background */}
      <div style={styles.overlayBackground} />

      {/* Skip button */}
      <button style={styles.skipButton} onClick={handleSkip}>
        跳过动画
      </button>

      {/* Phase: RANK_REVEAL */}
      {phase === AnimationPhase.RANK_REVEAL && revealIndex >= 0 && revealIndex < rankings.length && (
        <RankRevealCard
          ranking={rankings[revealIndex]}
          faction={factionLookup[rankings[revealIndex].player_id] ?? ''}
          isVisible={true}
          scorePhase={scorePhaseMap[revealIndex] ?? 'idle'}
          onScorePhaseComplete={() => handleScorePhaseComplete(revealIndex)}
        />
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '"Zpix", sans-serif',
  },
  overlayBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1A1A2E',
    zIndex: 0,
  },
  skipButton: {
    position: 'absolute',
    bottom: '24px',
    right: '24px',
    zIndex: 10,
    padding: '8px 16px',
    backgroundColor: 'rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    backdropFilter: 'blur(4px)',
  },
  revealCard: {
    position: 'relative',
    zIndex: 5,
    width: 'min(520px, calc(100vw - 40px))',
    padding: '32px 36px',
    borderRadius: '16px',
    border: '3px solid',
    backgroundColor: 'rgba(26, 26, 46, 0.92)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  rankLabel: {
    fontSize: '48px',
    lineHeight: 1,
    textAlign: 'center',
  },
  playerInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  factionTag: {
    padding: '4px 12px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 700,
  },
  displayName: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#E0E0E0',
  },
  scoreCounterContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  scoreCounter: {
    fontSize: '72px',
    fontWeight: 900,
    color: '#FFFFFF',
    textShadow: '0 0 20px rgba(255,215,0,0.5)',
    lineHeight: 1,
  },
  floatingReason: {
    fontSize: '18px',
    fontWeight: 700,
    padding: '6px 14px',
    borderRadius: '8px',
    backgroundColor: 'rgba(0,0,0,0.6)',
    textAlign: 'center',
    animation: `floatingReasonFade ${REASON_LABEL_STAY}ms ease-in-out`,
  },
  reasonList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    width: '100%',
    maxHeight: '120px',
    overflowY: 'auto',
  },
  reasonItem: {
    fontSize: '14px',
    fontWeight: 500,
    padding: '2px 8px',
  },
  achievementRow: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  achievementBadge: {
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: 700,
    color: '#1A1A2E',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    animation: `achievementPop 0.3s ease-out both`,
  },
  achievementBadgeName: {
    fontSize: '13px',
  },
  achievementBadgePoints: {
    fontSize: '12px',
    opacity: 0.8,
  },
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
    borderRadius: '20px',
    border: '4px solid',
    backgroundColor: 'rgba(26, 26, 46, 0.95)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  championName: {
    fontSize: '32px',
    fontWeight: 800,
    color: '#FFD700',
  },
  championScore: {
    fontSize: '80px',
    fontWeight: 900,
    color: '#FFFFFF',
    textShadow: '0 0 30px rgba(255,215,0,0.7)',
    lineHeight: 1,
  },
  championTitle: {
    fontSize: '56px',
    fontWeight: 900,
    color: '#FFD700',
    textShadow: '0 0 40px rgba(255,215,0,0.6)',
    animation: `championTitleFade 0.8s ease-out both`,
  },
  championAchievementRow: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
};