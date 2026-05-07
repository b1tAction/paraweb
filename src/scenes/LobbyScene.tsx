/**
 * LobbyScene - waiting room before the match begins.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PhaserCharacterPreview } from '../components/PhaserCharacterPreview';
import { gameService } from '../service/NakamaService';
import { useGameStore } from '../store/gameStore';
import { getDisambiguatedDisplayName } from '../utils/displayName';

const factionOptions = [
  { value: 'qing_long', label: '青龙' },
  { value: 'zhu_que', label: '朱雀' },
  { value: 'bai_hu', label: '白虎' },
  { value: 'xuan_wu', label: '玄武' },
] as const;

const factionSlots: Record<string, {
  position: React.CSSProperties;
  panel: React.CSSProperties;
}> = {
  qing_long: {
    position: { left: '37.5%', top: '70%' },
    panel: { left: '50%', top: '73%', transform: 'translateX(-50%)', textAlign: 'center' },
  },
  zhu_que: {
    position: { left: '50%', top: '58%' },
    panel: { left: '50%', top: '70%', transform: 'translateX(-50%)', textAlign: 'center' },
  },
  bai_hu: {
    position: { left: '62.5%', top: '70%' },
    panel: { left: '50%', top: '73%', transform: 'translateX(-50%)', textAlign: 'center' },
  },
  xuan_wu: {
    position: { left: '50%', top: '85%' },
    panel: { left: '50%', top: '88%', transform: 'translateX(-50%)', textAlign: 'center' },
  },
};

export const LobbyScene: React.FC = () => {
  const { waitingSync, myPlayerId, matchId, faction: storedFaction } = useGameStore();
  const [selectedFaction, setSelectedFaction] = useState(storedFaction || 'qing_long');
  const hasTouchedFactionRef = useRef(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isUpdatingFaction, setIsUpdatingFaction] = useState(false);
  const [notice, setNotice] = useState('');

  const myWaitingPlayer = waitingSync?.players.find((player) => player.user_id === myPlayerId);

  useEffect(() => {
    if (!hasTouchedFactionRef.current && myWaitingPlayer?.faction && myWaitingPlayer.faction !== selectedFaction) {
      setSelectedFaction(myWaitingPlayer.faction);
      useGameStore.getState().setFaction(myWaitingPlayer.faction);
    }
  }, [myWaitingPlayer?.faction, selectedFaction]);

  const disambiguatedPlayers = useMemo(() => {
    const players = waitingSync?.players || [];
    return players.map((player) => ({
      ...player,
      display: getDisambiguatedDisplayName(
        player.display_name || player.user_id,
        player.user_id,
        players.map((p) => ({ displayName: p.display_name || p.user_id, userId: p.user_id })),
      ),
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

  const {
    match_id,
    host_user_id,
    player_count,
    min_players,
    max_players,
    can_start,
    message,
  } = waitingSync;

  const isHost = myPlayerId === host_user_id;
  const displayMatchId = match_id || matchId;

  const handleSelectFaction = async (faction: string) => {
    try {
      setNotice('');
      hasTouchedFactionRef.current = true;
      setSelectedFaction(faction);
      setIsUpdatingFaction(true);
      useGameStore.getState().setFaction(faction);
      await gameService.sendLobbyPlayerUpdate(faction);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '更新阵营失败';
      setNotice(errorMessage);
    } finally {
      setIsUpdatingFaction(false);
    }
  };

  const handleBegin = async () => {
    try {
      setNotice('');
      setIsStarting(true);
      await gameService.sendStartGame();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '开始游戏失败';
      setNotice(errorMessage);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <main style={styles.page}>
      <div style={styles.cornerTitle}>LOBBY</div>

      <section style={styles.roomHeader}>
        <button
          type="button"
          title="复制房间号"
          onClick={() => displayMatchId && navigator.clipboard.writeText(displayMatchId)}
          style={styles.roomId}
        >
          ROOM: {displayMatchId || '-'}
        </button>
        <div style={styles.roomMeta}>
          {player_count} / {max_players}
          {player_count < min_players ? ` - NEED ${min_players}` : ''}
        </div>
      </section>

      <section style={styles.factionStage} aria-label="选择阵营">
        {factionOptions.map((option) => {
          const occupants = disambiguatedPlayers.filter((player) => player.faction === option.value);
          const isSelected = selectedFaction === option.value;
          const slot = factionSlots[option.value];
          const selectFaction = () => {
            if (!isUpdatingFaction) {
              void handleSelectFaction(option.value);
            }
          };
          const handleFactionKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              selectFaction();
            }
          };

          return (
            <div
              key={option.value}
              style={{
                ...styles.factionSlot,
                ...slot.position,
                ...(isSelected ? styles.factionSlotSelected : undefined),
              }}
            >
              <div
                role="button"
                tabIndex={0}
                aria-label={`选择${option.label}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={selectFaction}
                onKeyDown={handleFactionKeyDown}
                style={styles.figureViewport}
              >
                <PhaserCharacterPreview faction={option.value} width={256} height={256} style={styles.figureCanvas} />
              </div>
              <div
                role="button"
                tabIndex={0}
                aria-label={`选择${option.label}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={selectFaction}
                onKeyDown={handleFactionKeyDown}
                style={{ ...styles.factionPanel, ...slot.panel }}
              >
                <div style={styles.factionName}>{option.label}</div>
                <div style={styles.occupants}>
                  {occupants.length > 0
                    ? occupants.map((player) => (
                      <span key={player.user_id} style={player.user_id === myPlayerId ? styles.meName : undefined}>
                        {player.display}
                        {player.user_id === host_user_id ? ' 房主' : ''}
                        {player.user_id === myPlayerId ? ' 我' : ''}
                      </span>
                    ))
                  : <span style={styles.emptyName}>EMPTY</span>}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section style={styles.footerPanel}>
        <div style={styles.message}>{notice || message}</div>
        {isHost ? (
          <button
            type="button"
            onClick={handleBegin}
            disabled={!can_start || isStarting}
            style={{ ...styles.beginButton, ...(!can_start || isStarting ? styles.beginButtonDisabled : undefined) }}
          >
            {isStarting ? 'STARTING...' : 'BEGIN'}
          </button>
        ) : (
          <div style={styles.waitingText}>WAITING FOR HOST</div>
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
    backgroundImage: 'url("/assets/waiting.png")',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    fontFamily: 'Zpix, sans-serif',
    color: '#fff7d6',
  },
  cornerTitle: {
    position: 'fixed',
    left: '28px',
    top: '24px',
    zIndex: 3,
    color: '#fff0b8',
    fontSize: '24px',
    textShadow: '0 3px 0 rgba(0,0,0,0.42)',
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
    top: '24px',
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
  factionStage: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  factionSlot: {
    position: 'absolute',
    transform: 'translate(-50%, -100%)',
    width: 'clamp(168px, 14.6vw, 256px)',
    aspectRatio: '1 / 1',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: 0,
    color: 'inherit',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    appearance: 'none',
    WebkitAppearance: 'none',
    WebkitTapHighlightColor: 'transparent',
    boxShadow: 'none',
    transition: 'none',
    cursor: 'default',
    fontFamily: 'inherit',
    filter: 'drop-shadow(0 12px 12px rgba(0, 0, 0, 0.45))',
    pointerEvents: 'none',
  },
  factionSlotSelected: {
    filter: 'drop-shadow(0 0 10px rgba(186, 247, 166, 0.85)) drop-shadow(0 12px 12px rgba(0, 0, 0, 0.45))',
  },
  figureViewport: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    imageRendering: 'pixelated',
    cursor: 'pointer',
    outline: 'none',
    pointerEvents: 'auto',
  },
  figureCanvas: {
    width: '100%',
    height: '100%',
  },
  factionPanel: {
    position: 'absolute',
    minWidth: 'clamp(116px, 10vw, 168px)',
    maxWidth: 'min(230px, 24vw)',
    padding: '7px 9px',
    color: '#fdf5d0',
    background: 'rgba(29, 35, 35, 0.72)',
    border: '1px solid rgba(255, 232, 166, 0.4)',
    borderRadius: '8px',
    boxShadow: '0 9px 18px rgba(0, 0, 0, 0.28)',
    backdropFilter: 'blur(2px)',
    cursor: 'pointer',
    outline: 'none',
    pointerEvents: 'auto',
  },
  factionName: {
    margin: 0,
    color: '#ffeeb0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'clamp(12px, 1.15vw, 15px)',
    fontWeight: 900,
    lineHeight: 1.3,
    textShadow: '0 2px 4px rgba(0, 0, 0, 0.65)',
  },
  occupants: {
    width: '100%',
    minHeight: '16px',
    marginTop: '5px',
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: '4px',
    color: '#e9d393',
    fontSize: 'clamp(10px, 0.95vw, 12px)',
    lineHeight: 1.2,
    overflow: 'hidden',
  },
  meName: {
    color: '#baf7a6',
  },
  emptyName: {
    color: 'rgba(255, 247, 214, 0.5)',
  },
  footerPanel: {
    position: 'absolute',
    left: '50%',
    top: 'clamp(112px, 18vh, 184px)',
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
    minHeight: '48px',
    color: '#352c20',
    backgroundImage: 'url("/assets/button/button_up.png")',
    backgroundSize: '100% 100%',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '17px',
    imageRendering: 'pixelated',
  },
  beginButtonDisabled: {
    filter: 'grayscale(0.75)',
    opacity: 0.72,
    cursor: 'not-allowed',
  },
  waitingText: {
    padding: '9px 14px',
    color: '#f8e9bb',
    background: 'rgba(15, 24, 28, 0.38)',
    borderRadius: '8px',
    fontSize: '13px',
    boxShadow: '0 8px 18px rgba(0, 0, 0, 0.18)',
  },
};

export default LobbyScene;
