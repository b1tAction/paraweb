import type React from 'react';
import { assetCssUrl, assetUrl } from '../utils/assets';

type SceneStatusPanelProps = {
  eyebrow?: string;
  title: string;
  background?: 'cover' | 'waiting';
  variant?: 'loading' | 'dice' | 'boss' | 'plain';
  accent?: 'gold' | 'green' | 'red' | 'blue';
};

const accentColors: Record<NonNullable<SceneStatusPanelProps['accent']>, { primary: string; glow: string }> = {
  gold: { primary: '#f6df9e', glow: 'rgba(255, 219, 112, 0.36)' },
  green: { primary: '#aee6a0', glow: 'rgba(126, 214, 112, 0.28)' },
  red: { primary: '#ffb09a', glow: 'rgba(255, 105, 70, 0.32)' },
  blue: { primary: '#a9d8ff', glow: 'rgba(86, 171, 255, 0.28)' },
};

const diceItems = [
  { label: '1st', name: '金骰', src: assetUrl('assets/dice/gold_rotate.gif') },
  { label: '2nd', name: '银骰', src: assetUrl('assets/dice/silver_rotate.gif') },
  { label: '3rd', name: '铜骰', src: assetUrl('assets/dice/copper_rotate.gif') },
  { label: '4th', name: '木骰', src: assetUrl('assets/dice/wood_rotate.gif') },
];

export function SceneStatusPanel({
  eyebrow = 'ParaDiced',
  title,
  background = 'waiting',
  variant = 'loading',
  accent = 'gold',
}: SceneStatusPanelProps) {
  const palette = accentColors[accent];

  return (
    <main
      style={{
        ...styles.page,
        backgroundImage: assetCssUrl(background === 'cover' ? 'assets/cover.webp' : 'assets/waiting.webp'),
      }}
    >
      <div style={styles.vignette} aria-hidden="true" />

      <section style={{ ...styles.panel, boxShadow: `0 22px 56px rgba(0, 0, 0, 0.38), 0 0 42px ${palette.glow}` }}>
        <div style={styles.paperInset}>
          <p style={{ ...styles.eyebrow, color: palette.primary }}>{eyebrow}</p>
          <h1 style={styles.title}>{title}</h1>

          {variant === 'dice' && <DiceShowcase />}
          {variant === 'boss' && <BossShowcase />}
          {variant === 'loading' && <LoadingShowcase color={palette.primary} />}
        </div>
      </section>
    </main>
  );
}

function LoadingShowcase({ color }: { color: string }) {
  return (
    <div style={styles.loadingRow} aria-hidden="true">
      <span style={{ ...styles.loadingDot, background: color, animationDelay: '0ms' }} />
      <span style={{ ...styles.loadingDot, background: color, animationDelay: '140ms' }} />
      <span style={{ ...styles.loadingDot, background: color, animationDelay: '280ms' }} />
      <img src={assetUrl('assets/dice/gold_rotate.gif')} alt="" style={styles.loadingDice} />
    </div>
  );
}

function DiceShowcase() {
  return (
    <div style={styles.diceGrid}>
      {diceItems.map((item) => (
        <div key={item.name} style={styles.diceCard}>
          <img src={item.src} alt="" style={styles.diceIcon} />
          <span style={styles.diceRank}>{item.label}</span>
          <strong style={styles.diceName}>{item.name}</strong>
        </div>
      ))}
    </div>
  );
}

function BossShowcase() {
  return (
    <div style={styles.bossStage} aria-hidden="true">
      <img src={assetUrl('assets/boss/skill-thunder1.png')} alt="" style={{ ...styles.thunderIcon, ...styles.thunderLeft }} />
      <div style={styles.bossPortraitFrame}>
        <img src={assetUrl('assets/boss/beast/portrait.png')} alt="" style={styles.bossPortrait} />
      </div>
      <img src={assetUrl('assets/boss/skill-thunder2.png')} alt="" style={{ ...styles.thunderIcon, ...styles.thunderRight }} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    position: 'fixed',
    inset: 0,
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    color: '#fff7d6',
    fontFamily: 'Zpix, sans-serif',
  },
  vignette: {
    position: 'absolute',
    inset: 0,
    background:
      'radial-gradient(circle at 50% 36%, rgba(255, 226, 157, 0.16), transparent 32%), linear-gradient(180deg, rgba(8, 13, 16, 0.22), rgba(7, 10, 12, 0.72))',
  },
  panel: {
    position: 'relative',
    zIndex: 1,
    width: 'min(680px, calc(100vw - 40px))',
    minHeight: 'min(420px, calc(100vh - 48px))',
    padding: '34px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(11, 19, 21, 0.74)',
    border: '1px solid rgba(255, 233, 172, 0.18)',
    borderRadius: '20px',
    backdropFilter: 'blur(2px)',
  },
  paperInset: {
    width: '100%',
    minHeight: '300px',
    padding: '34px 38px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    textAlign: 'center',
    background:
      'linear-gradient(180deg, rgba(25, 34, 31, 0.58), rgba(12, 18, 20, 0.7)), rgba(255, 247, 214, 0.06)',
    border: '1px solid rgba(255, 233, 172, 0.38)',
    borderRadius: '10px',
    boxShadow: 'inset 0 0 28px rgba(0, 0, 0, 0.28)',
    backdropFilter: 'blur(2px)',
  },
  eyebrow: {
    margin: 0,
    fontSize: 'clamp(12px, 1.2vw, 15px)',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    textShadow: '0 2px 0 rgba(0, 0, 0, 0.45)',
  },
  title: {
    margin: 0,
    color: '#fff7d6',
    fontSize: 'clamp(30px, 4.6vw, 54px)',
    lineHeight: 1.15,
    textShadow: '0 4px 0 rgba(54, 35, 25, 0.74), 0 14px 24px rgba(0, 0, 0, 0.38)',
  },
  loadingRow: {
    marginTop: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
  },
  loadingDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    boxShadow: '0 0 14px currentColor',
    animation: 'paradice-status-dot 900ms ease-in-out infinite',
  },
  loadingDice: {
    width: '72px',
    height: '58px',
    objectFit: 'contain',
    filter: 'drop-shadow(0 10px 10px rgba(0, 0, 0, 0.38))',
  },
  diceGrid: {
    width: 'min(520px, 100%)',
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '10px',
  },
  diceCard: {
    minWidth: 0,
    padding: '12px 8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    background: 'rgba(13, 20, 22, 0.58)',
    border: '1px solid rgba(255, 232, 166, 0.32)',
    borderRadius: '8px',
  },
  diceIcon: {
    width: '64px',
    height: '52px',
    objectFit: 'contain',
    filter: 'drop-shadow(0 8px 8px rgba(0, 0, 0, 0.42))',
  },
  diceRank: {
    color: '#f6df9e',
    fontSize: '11px',
  },
  diceName: {
    color: '#fff7d6',
    fontSize: '13px',
  },
  bossStage: {
    position: 'relative',
    width: 'min(360px, 72vw)',
    minHeight: '150px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bossPortraitFrame: {
    width: '132px',
    height: '132px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(circle, rgba(255, 93, 65, 0.3), rgba(12, 18, 20, 0.72) 66%)',
    border: '2px solid rgba(255, 176, 154, 0.58)',
    borderRadius: '50%',
    boxShadow: '0 0 30px rgba(255, 87, 56, 0.3), inset 0 0 22px rgba(0, 0, 0, 0.42)',
  },
  bossPortrait: {
    width: '96px',
    height: '96px',
    objectFit: 'contain',
    transform: 'scale(1.8)',
    filter: 'drop-shadow(0 12px 10px rgba(0, 0, 0, 0.54))',
  },
  thunderIcon: {
    position: 'absolute',
    width: '92px',
    height: '92px',
    objectFit: 'contain',
    opacity: 0.86,
    filter: 'drop-shadow(0 0 16px rgba(255, 224, 128, 0.52))',
  },
  thunderLeft: {
    left: '12px',
    top: '18px',
    transform: 'rotate(-16deg)',
  },
  thunderRight: {
    right: '12px',
    bottom: '10px',
    transform: 'rotate(14deg)',
  },
};

export default SceneStatusPanel;
