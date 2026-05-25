/**
 * DevPanel - DEV-mode floating debug panel
 *
 * Provides scene jumping, mock data injection, map inspection, and visual/audio effect triggers.
 * Only rendered in DEV mode (import.meta.env.DEV).
 */

import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { dispatchDevBoardFocusCell } from '../game/devBoardEvents';
import { Scene, useGameStore } from '../store/gameStore';
import type { MapConfig } from '../types/protocol';
import { playBoardBgm, stopBoardBgm } from '../utils/boardBgm';
import { playButtonSfx } from '../utils/buttonSfx';
import { playEndBgm, stopEndBgm } from '../utils/endBgm';
import { playMiniGameBgm, stopMiniGameBgm } from '../utils/miniGameBgm';
import { playStartBgm, stopStartBgm } from '../utils/startBgm';
import {
  DEV_DICE_TYPES,
  DEV_EFFECT_PRESETS,
  type DevDiceType,
  type DevEffectGroup,
  getDevEffectGroups,
  getNextDevDiceType,
  triggerDevEffect,
} from './devEffectTriggers';
import { injectBoard, injectGameOver, injectGameOverSkipAni, injectMiniGame, MOCK_MAP_CONFIG } from './devMockData';

type DevPanelTab = 'state' | 'scene' | 'board' | 'effects' | 'audio';

const SCENE_OPTIONS: { value: Scene; label: string }[] = [
  { value: Scene.Home, label: 'Home' },
  { value: Scene.CreateRoom, label: 'CreateRoom' },
  { value: Scene.JoinRoom, label: 'JoinRoom' },
  { value: Scene.FactionSelect, label: 'FactionSelect' },
  { value: Scene.Lobby, label: 'Lobby' },
  { value: Scene.Loading, label: 'Loading' },
  { value: Scene.DiceAssign, label: 'DiceAssign' },
  { value: Scene.Board, label: 'Board' },
  { value: Scene.BossBattle, label: 'BossBattle' },
  { value: Scene.MiniGameSubmitRank, label: 'MiniGame' },
  { value: Scene.GameOver, label: 'GameOver' },
];

const PRESET_INJECTORS: { label: string; inject: () => void }[] = [
  { label: 'Board Mock', inject: injectBoard },
  { label: 'MiniGame Mock', inject: injectMiniGame },
  { label: 'GameOver Ani', inject: injectGameOver },
  { label: 'GameOver Static', inject: injectGameOverSkipAni },
];

const TABS: { value: DevPanelTab; label: string }[] = [
  { value: 'state', label: 'State' },
  { value: 'scene', label: 'Scene' },
  { value: 'board', label: 'Board' },
  { value: 'effects', label: 'Effects' },
  { value: 'audio', label: 'Audio' },
];

const DEV_BOARD_FOCUS_RETRY_DELAYS_MS = [0, 80, 240];
const EFFECT_GROUPS = getDevEffectGroups();

function getValidCellIndices(mapConfig: MapConfig | null) {
  if (!mapConfig) return [];

  return [...new Set(mapConfig.cells.map((cell) => cell.index).filter(Number.isFinite))].sort((a, b) => a - b);
}

function normalizeCellIndex(index: number, validCellIndices: number[]) {
  const roundedIndex = Math.round(index);

  if (validCellIndices.length === 0) {
    return Math.max(0, roundedIndex);
  }

  if (roundedIndex <= validCellIndices[0]) return validCellIndices[0];
  if (roundedIndex >= validCellIndices[validCellIndices.length - 1]) {
    return validCellIndices[validCellIndices.length - 1];
  }

  return validCellIndices.reduce((closestIndex, candidateIndex) =>
    Math.abs(candidateIndex - roundedIndex) < Math.abs(closestIndex - roundedIndex) ? candidateIndex : closestIndex,
  );
}

function getSteppedCellIndex(currentIndex: number, delta: number, validCellIndices: number[]) {
  if (validCellIndices.length === 0) {
    return Math.max(0, currentIndex + delta);
  }

  const normalizedIndex = normalizeCellIndex(currentIndex, validCellIndices);
  const currentCellPosition = validCellIndices.indexOf(normalizedIndex);
  const nextCellPosition = Math.max(0, Math.min(validCellIndices.length - 1, currentCellPosition + delta));

  return validCellIndices[nextCellPosition];
}

function scheduleDevBoardFocus(index: number) {
  if (typeof window === 'undefined') {
    dispatchDevBoardFocusCell(index);
    return;
  }

  DEV_BOARD_FOCUS_RETRY_DELAYS_MS.forEach((delay) => {
    window.setTimeout(() => dispatchDevBoardFocusCell(index), delay);
  });
}

function shouldIgnoreBoardKeyEvent(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

function formatSceneName(scene: Scene) {
  return String(scene).replace('Scene', '');
}

function isOutdatedDevBoardMap(mapConfig: MapConfig | null) {
  if (!mapConfig) return true;

  return mapConfig.length < MOCK_MAP_CONFIG.length || mapConfig.end_index < MOCK_MAP_CONFIG.end_index;
}

export const DevPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DevPanelTab>('board');
  const [selectedScene, setSelectedScene] = useState<string>(Scene.Home);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [focusedCellIndex, setFocusedCellIndex] = useState(0);
  const [selectedEffectGroup, setSelectedEffectGroup] = useState<DevEffectGroup>('Action');
  const [selectedEffectId, setSelectedEffectId] = useState(
    () => DEV_EFFECT_PRESETS.find((preset) => preset.group === 'Action')?.id ?? DEV_EFFECT_PRESETS[0]?.id ?? '',
  );
  const [selectedDiceType, setSelectedDiceType] = useState<DevDiceType>('wood');
  const [selectedDiceSteps, setSelectedDiceSteps] = useState(1);
  const [selectedFromDice, setSelectedFromDice] = useState<DevDiceType>('wood');
  const [selectedToDice, setSelectedToDice] = useState<DevDiceType>('copper');

  const currentScene = useGameStore((state) => state.currentScene);
  const globalState = useGameStore((state) => state.globalState);
  const turnState = useGameStore((state) => state.turnState);
  const players = useGameStore((state) => state.players);
  const mapConfig = useGameStore((state) => state.mapConfig);
  const currentPlayerId = useGameStore((state) => state.currentPlayerId);
  const myPlayerId = useGameStore((state) => state.myPlayerId);
  const pendingEntriesCount = useGameStore((state) => state.pendingEntries.length);
  const playedEntriesCount = useGameStore((state) => state.playedEntries.length);
  const stateSyncQueueLength = useGameStore((state) => state.stateSyncQueue.length);

  const validCellIndices = useMemo(() => getValidCellIndices(mapConfig), [mapConfig]);
  const selectedPlayer = useMemo(
    () => players.find((player) => player.player_id === selectedPlayerId) ?? players[0] ?? null,
    [players, selectedPlayerId],
  );
  const normalizedFocusedCellIndex = normalizeCellIndex(focusedCellIndex, validCellIndices);
  const canUseBoardControls = Boolean(mapConfig && selectedPlayer && players.length > 0);
  const filteredEffectPresets = useMemo(
    () => DEV_EFFECT_PRESETS.filter((preset) => preset.group === selectedEffectGroup),
    [selectedEffectGroup],
  );
  const selectedEffect =
    DEV_EFFECT_PRESETS.find((preset) => preset.id === selectedEffectId) ??
    filteredEffectPresets[0] ??
    DEV_EFFECT_PRESETS[0];

  useEffect(() => {
    if (players.length === 0) {
      setSelectedPlayerId('');
      return;
    }

    if (players.some((player) => player.player_id === selectedPlayerId)) return;

    setSelectedPlayerId(currentPlayerId || myPlayerId || players[0].player_id);
  }, [currentPlayerId, myPlayerId, players, selectedPlayerId]);

  useEffect(() => {
    if (selectedPlayer) {
      setFocusedCellIndex(normalizeCellIndex(selectedPlayer.position, validCellIndices));
      return;
    }

    if (validCellIndices.length > 0) {
      setFocusedCellIndex(validCellIndices[0]);
    }
  }, [selectedPlayer, validCellIndices]);

  useEffect(() => {
    const firstPresetInGroup = filteredEffectPresets[0];
    if (!firstPresetInGroup) return;
    if (filteredEffectPresets.some((preset) => preset.id === selectedEffectId)) return;

    setSelectedEffectId(firstPresetInGroup.id);
  }, [filteredEffectPresets, selectedEffectId]);

  const handleJumpToScene = useCallback(() => {
    useGameStore.getState().setScene(selectedScene as Scene);
  }, [selectedScene]);

  const handleReset = useCallback(() => {
    useGameStore.getState().resetMatchState();
  }, []);

  const handleReplayAnimation = useCallback(() => {
    const store = useGameStore.getState();
    if (store.gameOver && store.currentScene === Scene.GameOver) {
      store.setGameOverAnimationComplete(false);
    }
  }, []);

  const handleRenderBoardMap = useCallback(() => {
    const store = useGameStore.getState();

    if (isOutdatedDevBoardMap(store.mapConfig) || store.players.length === 0) {
      injectBoard();
    } else {
      store.setScene(Scene.Board);
    }

    const nextStore = useGameStore.getState();
    const nextPlayer =
      nextStore.players.find((player) => player.player_id === selectedPlayerId) ??
      nextStore.players.find((player) => player.player_id === nextStore.currentPlayerId) ??
      nextStore.players[0] ??
      null;
    const nextValidCellIndices = getValidCellIndices(nextStore.mapConfig);
    const nextFocusedCellIndex = normalizeCellIndex(
      nextPlayer?.position ?? nextStore.mapConfig?.start_index ?? focusedCellIndex,
      nextValidCellIndices,
    );

    if (nextPlayer) {
      setSelectedPlayerId(nextPlayer.player_id);
    }
    setFocusedCellIndex(nextFocusedCellIndex);
    scheduleDevBoardFocus(nextFocusedCellIndex);
  }, [focusedCellIndex, selectedPlayerId]);

  const handleFocusCell = useCallback(
    (index = focusedCellIndex) => {
      const nextCellIndex = normalizeCellIndex(index, validCellIndices);

      setFocusedCellIndex(nextCellIndex);
      useGameStore.getState().setScene(Scene.Board);
      scheduleDevBoardFocus(nextCellIndex);
    },
    [focusedCellIndex, validCellIndices],
  );

  const handleMoveSelectedPlayer = useCallback(
    (index = focusedCellIndex) => {
      let store = useGameStore.getState();

      if (!store.mapConfig || store.players.length === 0) {
        injectBoard();
        store = useGameStore.getState();
      }

      const selectedPlayerExists = store.players.some((player) => player.player_id === selectedPlayerId);
      const playerId =
        (selectedPlayerExists ? selectedPlayerId : '') ||
        store.currentPlayerId ||
        store.myPlayerId ||
        store.players[0]?.player_id ||
        '';
      if (!playerId) return;

      const nextValidCellIndices = getValidCellIndices(store.mapConfig);
      const nextCellIndex = normalizeCellIndex(index, nextValidCellIndices);

      store.setPlayers(
        store.players.map((player) =>
          player.player_id === playerId
            ? {
                ...player,
                position: nextCellIndex,
              }
            : player,
        ),
      );
      store.setScene(Scene.Board);
      setSelectedPlayerId(playerId);
      setFocusedCellIndex(nextCellIndex);
      scheduleDevBoardFocus(nextCellIndex);
    },
    [focusedCellIndex, selectedPlayerId],
  );

  const handleStepSelectedPlayer = useCallback(
    (delta: number) => {
      const store = useGameStore.getState();
      const player = store.players.find((entry) => entry.player_id === selectedPlayerId);
      const baseCellIndex = player?.position ?? focusedCellIndex;
      const nextCellIndex = getSteppedCellIndex(baseCellIndex, delta, getValidCellIndices(store.mapConfig));

      handleMoveSelectedPlayer(nextCellIndex);
    },
    [focusedCellIndex, handleMoveSelectedPlayer, selectedPlayerId],
  );

  const handleTriggerEffect = useCallback(() => {
    triggerDevEffect(selectedEffect.id, {
      preferredTargetPlayerId: selectedPlayerId,
      diceType: selectedDiceType,
      diceSteps: selectedDiceSteps,
      fromDice: selectedFromDice,
      toDice: selectedToDice,
    });
    setActiveTab('effects');
  }, [selectedDiceSteps, selectedDiceType, selectedEffect.id, selectedFromDice, selectedPlayerId, selectedToDice]);

  const handleStopAllBgm = useCallback(() => {
    stopStartBgm();
    stopBoardBgm();
    stopMiniGameBgm();
    stopEndBgm();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (activeTab !== 'board') return;
      if (shouldIgnoreBoardKeyEvent(event.target)) return;
      if (event.key !== '<' && event.key !== '>') return;

      event.preventDefault();
      handleStepSelectedPlayer(event.key === '<' ? -1 : 1);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, handleStepSelectedPlayer, isOpen]);

  if (!isOpen) {
    return (
      <button type="button" style={styles.collapsedButton} onClick={() => setIsOpen(true)} title="Open DevPanel">
        DEV
      </button>
    );
  }

  return (
    <aside style={styles.panelContainer}>
      <header style={styles.header}>
        <div>
          <div style={styles.headerTitle}>Dev Tools</div>
          <div style={styles.headerSubtitle}>
            {formatSceneName(currentScene)} · {globalState || '-'} / {turnState || '-'}
          </div>
        </div>
        <button type="button" style={styles.iconButton} onClick={() => setIsOpen(false)} title="Collapse DevPanel">
          ×
        </button>
      </header>

      <nav style={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            style={tab.value === activeTab ? styles.tabButtonActive : styles.tabButton}
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main style={styles.panelBody}>
        {activeTab === 'state' && (
          <section style={styles.section}>
            <div style={styles.sectionTitle}>Runtime State</div>
            <div style={styles.stateGrid}>
              <StateTile label="Scene" value={currentScene} />
              <StateTile label="Global" value={globalState || '-'} />
              <StateTile label="Turn" value={turnState || '-'} />
              <StateTile label="Players" value={String(players.length)} />
              <StateTile label="Pending" value={String(pendingEntriesCount)} />
              <StateTile label="Played" value={String(playedEntriesCount)} />
              <StateTile label="Sync Queue" value={String(stateSyncQueueLength)} />
              <StateTile label="Map" value={mapConfig ? `${mapConfig.length} cells` : 'not loaded'} />
            </div>
            <div style={styles.actionGridTwo}>
              <button type="button" style={styles.successButton} onClick={handleReplayAnimation}>
                Replay GameOver
              </button>
              <button type="button" style={styles.dangerButton} onClick={handleReset}>
                Reset Match
              </button>
            </div>
          </section>
        )}

        {activeTab === 'scene' && (
          <section style={styles.section}>
            <div style={styles.sectionTitle}>Scene Jump</div>
            <select
              value={selectedScene}
              onChange={(event) => setSelectedScene(event.target.value)}
              style={styles.select}
            >
              {SCENE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button type="button" style={styles.primaryButton} onClick={handleJumpToScene}>
              Jump to Scene
            </button>

            <div style={styles.sectionTitle}>Mock Presets</div>
            <div style={styles.actionGridTwo}>
              {PRESET_INJECTORS.map((preset) => (
                <button key={preset.label} type="button" style={styles.warningButton} onClick={preset.inject}>
                  {preset.label}
                </button>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'board' && (
          <section style={styles.section}>
            <div style={styles.sectionHeaderRow}>
              <div style={styles.sectionTitle}>Board Map</div>
              <span style={styles.pill}>
                {mapConfig ? `${mapConfig.start_index}-${mapConfig.end_index}` : 'not loaded'}
              </span>
            </div>
            <button type="button" style={styles.primaryButton} onClick={handleRenderBoardMap}>
              Render / Open Board
            </button>
            <select
              value={selectedPlayer?.player_id ?? ''}
              onChange={(event) => setSelectedPlayerId(event.target.value)}
              style={styles.select}
              disabled={players.length === 0}
            >
              {players.length === 0 ? (
                <option value="">No players</option>
              ) : (
                players.map((player) => (
                  <option key={player.player_id} value={player.player_id}>
                    {player.display_name || player.player_id} @ {player.position}
                  </option>
                ))
              )}
            </select>
            <div style={styles.mapControlRow}>
              <button
                type="button"
                style={styles.stepButton}
                onClick={() => handleStepSelectedPlayer(-1)}
                disabled={!canUseBoardControls}
              >
                &lt;
              </button>
              <input
                type="number"
                min={validCellIndices[0] ?? 0}
                max={validCellIndices[validCellIndices.length - 1] ?? 0}
                value={normalizedFocusedCellIndex}
                onChange={(event) => setFocusedCellIndex(Number(event.target.value))}
                onBlur={() => setFocusedCellIndex(normalizedFocusedCellIndex)}
                style={styles.cellInput}
                disabled={!mapConfig}
              />
              <button
                type="button"
                style={styles.stepButton}
                onClick={() => handleStepSelectedPlayer(1)}
                disabled={!canUseBoardControls}
              >
                &gt;
              </button>
            </div>
            <div style={styles.actionGridTwo}>
              <button
                type="button"
                style={styles.successButton}
                onClick={() => handleFocusCell(normalizedFocusedCellIndex)}
                disabled={!mapConfig}
              >
                Focus Cell
              </button>
              <button
                type="button"
                style={styles.successButton}
                onClick={() => handleMoveSelectedPlayer(normalizedFocusedCellIndex)}
                disabled={!canUseBoardControls}
              >
                Move Player
              </button>
            </div>
            <p style={styles.hint}>Tip: while this tab is active, keyboard &lt; / &gt; moves the selected player.</p>
          </section>
        )}

        {activeTab === 'effects' && (
          <section style={styles.section}>
            <div style={styles.sectionHeaderRow}>
              <div style={styles.sectionTitle}>Effect Lab</div>
              <span style={styles.pill}>{pendingEntriesCount} pending</span>
            </div>
            <select
              value={selectedPlayer?.player_id ?? ''}
              onChange={(event) => setSelectedPlayerId(event.target.value)}
              style={styles.select}
              disabled={players.length === 0}
            >
              {players.length === 0 ? (
                <option value="">Auto mock player</option>
              ) : (
                players
                  .filter((player) => !player.is_boss)
                  .map((player) => (
                    <option key={player.player_id} value={player.player_id}>
                      {player.display_name || player.player_id} @ {player.position}
                    </option>
                  ))
              )}
            </select>
            <div style={styles.groupBar}>
              {EFFECT_GROUPS.map((group) => (
                <button
                  key={group}
                  type="button"
                  style={group === selectedEffectGroup ? styles.groupButtonActive : styles.groupButton}
                  onClick={() => setSelectedEffectGroup(group)}
                >
                  {group}
                </button>
              ))}
            </div>
            <select
              value={selectedEffect.id}
              onChange={(event) => setSelectedEffectId(event.target.value)}
              style={styles.select}
            >
              {filteredEffectPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            {selectedEffect.diceControls === 'roll' && (
              <div style={styles.diceControlGrid}>
                <label style={styles.fieldLabel}>
                  Dice Type
                  <select
                    value={selectedDiceType}
                    onChange={(event) => setSelectedDiceType(event.target.value as DevDiceType)}
                    style={styles.select}
                  >
                    {DEV_DICE_TYPES.map((diceType) => (
                      <option key={diceType.value} value={diceType.value}>
                        {diceType.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={styles.fieldLabel}>
                  Steps
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={selectedDiceSteps}
                    onChange={(event) => setSelectedDiceSteps(Math.max(1, Math.min(6, Number(event.target.value) || 1)))}
                    style={styles.numberInput}
                  />
                </label>
              </div>
            )}
            {selectedEffect.diceControls === 'upgrade' && (
              <div style={styles.diceControlGrid}>
                <label style={styles.fieldLabel}>
                  From
                  <select
                    value={selectedFromDice}
                    onChange={(event) => {
                      const nextFromDice = event.target.value as DevDiceType;
                      setSelectedFromDice(nextFromDice);
                      setSelectedToDice(getNextDevDiceType(nextFromDice));
                    }}
                    style={styles.select}
                  >
                    {DEV_DICE_TYPES.map((diceType) => (
                      <option key={diceType.value} value={diceType.value}>
                        {diceType.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={styles.fieldLabel}>
                  To
                  <select
                    value={selectedToDice}
                    onChange={(event) => setSelectedToDice(event.target.value as DevDiceType)}
                    style={styles.select}
                  >
                    {DEV_DICE_TYPES.map((diceType) => (
                      <option key={diceType.value} value={diceType.value}>
                        {diceType.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <p style={styles.description}>{selectedEffect.description}</p>
            <div style={styles.actionGridTwo}>
              <button type="button" style={styles.primaryButton} onClick={handleTriggerEffect}>
                Trigger Effect
              </button>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => useGameStore.getState().clearAllEntries()}
              >
                Clear Log Queue
              </button>
            </div>
            <p style={styles.hint}>
              Event / buff / action / item / skill / dice all use the same LogEntry animation path as real gameplay.
            </p>
          </section>
        )}

        {activeTab === 'audio' && (
          <section style={styles.section}>
            <div style={styles.sectionTitle}>Audio Checks</div>
            <div style={styles.actionGridTwo}>
              <button type="button" style={styles.primaryButton} onClick={() => playStartBgm()}>
                Play Start BGM
              </button>
              <button type="button" style={styles.primaryButton} onClick={() => playBoardBgm(0)}>
                Play Board BGM
              </button>
              <button type="button" style={styles.primaryButton} onClick={() => playMiniGameBgm(0)}>
                Play MiniGame BGM
              </button>
              <button type="button" style={styles.primaryButton} onClick={() => playEndBgm()}>
                Play End BGM
              </button>
              <button type="button" style={styles.secondaryButton} onClick={playButtonSfx}>
                Play Button SFX
              </button>
              <button type="button" style={styles.dangerButton} onClick={handleStopAllBgm}>
                Stop All BGM
              </button>
            </div>
            <p style={styles.hint}>Browsers may require one user click before audio playback is allowed.</p>
          </section>
        )}
      </main>
    </aside>
  );
};

type StateTileProps = {
  label: string;
  value: string;
};

function StateTile({ label, value }: StateTileProps) {
  return (
    <div style={styles.stateTile}>
      <span style={styles.stateLabel}>{label}</span>
      <span style={styles.stateValue} title={value}>
        {value}
      </span>
    </div>
  );
}

const baseButton: React.CSSProperties = {
  minHeight: '30px',
  padding: '6px 8px',
  borderRadius: '7px',
  fontFamily: 'monospace',
  fontSize: '11px',
  fontWeight: 800,
  cursor: 'pointer',
};

const styles: Record<string, React.CSSProperties> = {
  collapsedButton: {
    position: 'fixed',
    right: '10px',
    top: '10px',
    zIndex: 9999,
    minWidth: '44px',
    minHeight: '28px',
    border: '1px solid rgba(255, 200, 100, 0.55)',
    borderRadius: '7px',
    backgroundColor: 'rgba(24, 26, 32, 0.9)',
    color: '#ffc864',
    fontFamily: 'monospace',
    fontSize: '12px',
    fontWeight: 900,
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.36)',
  },
  panelContainer: {
    position: 'fixed',
    right: '10px',
    top: '10px',
    zIndex: 9999,
    width: 'min(360px, calc(100vw - 20px))',
    maxHeight: 'calc(100vh - 20px)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    border: '1px solid rgba(255, 200, 100, 0.32)',
    borderRadius: '12px',
    backgroundColor: 'rgba(17, 20, 26, 0.94)',
    color: '#e8e0d0',
    boxShadow: '0 14px 36px rgba(0, 0, 0, 0.48)',
    fontFamily: 'monospace',
    fontSize: '12px',
    lineHeight: 1.4,
    userSelect: 'none',
    backdropFilter: 'blur(6px)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    padding: '10px 12px 8px',
    borderBottom: '1px solid rgba(255, 200, 100, 0.16)',
  },
  headerTitle: {
    color: '#ffc864',
    fontSize: '14px',
    fontWeight: 900,
    letterSpacing: '0.04em',
  },
  headerSubtitle: {
    maxWidth: '280px',
    overflow: 'hidden',
    color: '#9facbc',
    fontSize: '10px',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  iconButton: {
    width: '28px',
    height: '28px',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '7px',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    color: '#e8e0d0',
    fontSize: '18px',
    fontWeight: 900,
    cursor: 'pointer',
  },
  tabBar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '4px',
    padding: '8px',
    borderBottom: '1px solid rgba(255, 200, 100, 0.12)',
  },
  tabButton: {
    ...baseButton,
    minHeight: '28px',
    padding: '4px 2px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(40, 44, 54, 0.72)',
    color: '#aeb8c6',
    fontSize: '10px',
  },
  tabButtonActive: {
    ...baseButton,
    minHeight: '28px',
    padding: '4px 2px',
    border: '1px solid rgba(255, 200, 100, 0.42)',
    backgroundColor: 'rgba(255, 180, 80, 0.2)',
    color: '#ffd28a',
    fontSize: '10px',
  },
  panelBody: {
    overflowY: 'auto',
    padding: '10px 12px 12px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  sectionTitle: {
    color: '#ffc864',
    fontSize: '12px',
    fontWeight: 900,
  },
  pill: {
    padding: '2px 7px',
    border: '1px solid rgba(100, 180, 255, 0.28)',
    borderRadius: '999px',
    backgroundColor: 'rgba(40, 80, 160, 0.22)',
    color: '#a9d3ff',
    fontSize: '10px',
    fontWeight: 800,
  },
  stateGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '7px',
  },
  stateTile: {
    minWidth: 0,
    padding: '7px 8px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.045)',
  },
  stateLabel: {
    display: 'block',
    color: '#8f9cad',
    fontSize: '10px',
  },
  stateValue: {
    display: 'block',
    overflow: 'hidden',
    color: '#f0ead8',
    fontSize: '11px',
    fontWeight: 900,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  select: {
    width: '100%',
    minHeight: '32px',
    padding: '5px 8px',
    border: '1px solid rgba(255, 200, 100, 0.25)',
    borderRadius: '7px',
    backgroundColor: 'rgba(35, 38, 46, 0.95)',
    color: '#e8e0d0',
    fontFamily: 'monospace',
    fontSize: '11px',
    cursor: 'pointer',
  },
  diceControlGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '7px',
  },
  fieldLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    color: '#8f9cad',
    fontSize: '10px',
    fontWeight: 800,
  },
  numberInput: {
    width: '100%',
    minHeight: '32px',
    boxSizing: 'border-box',
    padding: '5px 8px',
    border: '1px solid rgba(255, 200, 100, 0.25)',
    borderRadius: '7px',
    backgroundColor: 'rgba(35, 38, 46, 0.95)',
    color: '#e8e0d0',
    fontFamily: 'monospace',
    fontSize: '11px',
  },
  primaryButton: {
    ...baseButton,
    border: '1px solid rgba(100, 180, 255, 0.38)',
    backgroundColor: 'rgba(44, 92, 178, 0.72)',
    color: '#d7ebff',
  },
  secondaryButton: {
    ...baseButton,
    border: '1px solid rgba(180, 190, 205, 0.24)',
    backgroundColor: 'rgba(70, 76, 90, 0.62)',
    color: '#d8dee9',
  },
  successButton: {
    ...baseButton,
    border: '1px solid rgba(100, 220, 140, 0.35)',
    backgroundColor: 'rgba(24, 108, 64, 0.68)',
    color: '#a9ffc8',
  },
  warningButton: {
    ...baseButton,
    border: '1px solid rgba(255, 180, 80, 0.32)',
    backgroundColor: 'rgba(102, 72, 22, 0.7)',
    color: '#ffc46d',
  },
  dangerButton: {
    ...baseButton,
    border: '1px solid rgba(240, 90, 90, 0.35)',
    backgroundColor: 'rgba(120, 28, 36, 0.72)',
    color: '#ff9a9a',
  },
  actionGridTwo: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '7px',
  },
  mapControlRow: {
    display: 'grid',
    gridTemplateColumns: '42px 1fr 42px',
    gap: '7px',
    alignItems: 'center',
  },
  stepButton: {
    ...baseButton,
    minHeight: '34px',
    border: '1px solid rgba(100, 180, 255, 0.38)',
    backgroundColor: 'rgba(44, 92, 178, 0.72)',
    color: '#d7ebff',
    fontSize: '15px',
  },
  cellInput: {
    minWidth: 0,
    minHeight: '32px',
    padding: '4px 8px',
    border: '1px solid rgba(255, 200, 100, 0.25)',
    borderRadius: '7px',
    backgroundColor: 'rgba(35, 38, 46, 0.95)',
    color: '#e8e0d0',
    fontFamily: 'monospace',
    fontSize: '12px',
  },
  groupBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  groupButton: {
    ...baseButton,
    minHeight: '26px',
    padding: '4px 7px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(40, 44, 54, 0.72)',
    color: '#aeb8c6',
    fontSize: '10px',
  },
  groupButtonActive: {
    ...baseButton,
    minHeight: '26px',
    padding: '4px 7px',
    border: '1px solid rgba(100, 220, 140, 0.36)',
    backgroundColor: 'rgba(24, 108, 64, 0.56)',
    color: '#a9ffc8',
    fontSize: '10px',
  },
  description: {
    minHeight: '34px',
    margin: 0,
    padding: '7px 8px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    color: '#c3ccda',
    fontSize: '11px',
  },
  hint: {
    margin: 0,
    color: '#8f9cad',
    fontSize: '10px',
  },
};

export default DevPanel;
