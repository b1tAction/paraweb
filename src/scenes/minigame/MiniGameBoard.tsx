/**
 * MiniGameBoard - DEV-mode four-quadrant mini-game testing page
 *
 * Simulates four independent clients on a single page.
 * Each quadrant has its own Nakama connection (MiniGameClient) with
 * an isolated Zustand store, so all four "players" can participate
 * in the same mini-game round simultaneously.
 */

import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ColyseusService } from '../../service/ColyseusService';
import { MiniGameClient } from '../../service/MiniGameClient';
import { gameService } from '../../service/NakamaService';
import { CountSecondsMiniGame } from './CountSecondsMiniGame';
import { DiceRaceMiniGame } from './DiceRaceMiniGame';
import { DilemmaRaceMiniGame } from './DilemmaRaceMiniGame';
import { MathCalcMiniGame } from './MathCalcMiniGame';
import { MiniGameLeaderboard } from './MiniGameLeaderboard';
import { styles } from './MiniGameStyles';
import { type MiniGameBoardGameType, miniGameBoardDevControls } from './miniGameBoardDevControls';
import type { MiniGameViewContext } from './miniGameViewContext';
import { RainbowMemoryMiniGame } from './RainbowMemoryMiniGame';
import { VernierMiniGame } from './VernierMiniGame';

// ========== Constants ==========

const FACTION_COLORS = ['#4fc3f7', '#ff7043', '#f5f5f5', '#8d6e63'];

function waitForRenderCleanup(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

// ========== MiniGameQuadrant ==========

interface QuadrantProps {
  client: MiniGameClient;
  index: number;
}

const MiniGameQuadrant: React.FC<QuadrantProps> = ({ client, index }) => {
  const store = client.getStore();
  const onlineService = useMemo(() => new ColyseusService(), []);

  // Subscribe to store changes
  const myPlayerId = store((s) => s.myPlayerId);
  const displayName = store((s) => s.displayName);
  const connectionStatus = store((s) => s.connectionStatus);
  const errorMessage = store((s) => s.errorMessage);
  const miniGameStart = store((s) => s.miniGameStart);
  const miniGameResult = store((s) => s.miniGameResult);
  const quadrantMatchId = store((s) => s.matchId);
  const isSubmitting = store((s) => s.isSubmitting);
  const submitted = store((s) => s.submitted);
  const submitError = store((s) => s.submitError);

  const participantIds = miniGameStart?.players || [];
  const isParticipant = participantIds.includes(myPlayerId);
  const gameType = miniGameStart?.game_type || '';

  const viewContext = useMemo<MiniGameViewContext>(() => ({
    matchId: quadrantMatchId,
    round: 0,
    miniGameStart,
    miniGameResult,
    myPlayerId,
    players: participantIds.map((playerId, playerIndex) => ({
      player_id: playerId,
      display_name: MiniGameClient.DISPLAY_NAMES[playerIndex] || playerId,
      faction: '',
      position: 0,
      hp: 0,
      max_hp: 0,
      lp: 0,
      buffs: [],
      items: [],
      charge: 0,
      fire_counter: 0,
      is_dead: false,
      skip_turn: false,
    })),
  }), [miniGameStart, miniGameResult, myPlayerId, participantIds, quadrantMatchId]);

  // Submit handler using the client's own WebSocket connection
  const submitGameData = useCallback(
    async (gameData: Record<string, unknown>) => {
      if (!isParticipant || submitted) return;

      try {
        await client.submitMiniGameData(gameType, gameData);
      } catch {
        // Error is stored in client.store
      }
    },
    [client, isParticipant, submitted, gameType],
  );

  const renderGame = () => {
    switch (gameType) {
      case 'dilemma_race':
        if (miniGameStart?.connection) {
          return (
            <DilemmaRaceMiniGame
              key={miniGameStart.connection.minigame_instance_id || miniGameStart.connection.room_id || gameType}
              connection={miniGameStart.connection}
              isParticipant={isParticipant}
              onlineService={onlineService}
              playerId={myPlayerId}
              participantIds={participantIds}
            />
          );
        }

        return (
          <div style={quadrantStyles.gameArea}>
            <p style={styles.submittedText}>Waiting for online game connection...</p>
          </div>
        );
      case 'dice_race':
        return (
          <DiceRaceMiniGame
            isParticipant={isParticipant}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onSubmit={submitGameData}
            viewContext={viewContext}
          />
        );
      case 'count_seconds':
        return (
          <CountSecondsMiniGame
            isParticipant={isParticipant}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onSubmit={submitGameData}
            viewContext={viewContext}
          />
        );
      case 'math_calc':
        return (
          <MathCalcMiniGame
            isParticipant={isParticipant}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onSubmit={submitGameData}
            viewContext={viewContext}
          />
        );
      case 'rainbow_memory':
        return (
          <RainbowMemoryMiniGame
            isParticipant={isParticipant}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onSubmit={submitGameData}
            viewContext={viewContext}
          />
        );
      case 'vernier':
        return (
          <VernierMiniGame
            isParticipant={isParticipant}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onSubmit={submitGameData}
            viewContext={viewContext}
          />
        );
      default:
        return (
          <div style={quadrantStyles.gameArea}>
            <p style={styles.submittedText}>
              {gameType || 'No game'} — waiting for MiniGameStart...
            </p>
          </div>
        );
    }
  };

  const renderContent = () => {
    if (connectionStatus === 'disconnected') {
      return <p style={styles.submittedText}>Not connected</p>;
    }

    if (connectionStatus === 'connecting') {
      return <p style={styles.submittedText}>Connecting...</p>;
    }

    if (connectionStatus === 'error') {
      return <p style={quadrantStyles.errorText}>{errorMessage}</p>;
    }

    // Result phase
    if (miniGameResult) {
      return <MiniGameLeaderboard gameType={gameType} result={miniGameResult} />;
    }

    // Playing phase
    if (miniGameStart) {
      if (!isParticipant) {
        return <p style={styles.submittedText}>Not participating. Waiting...</p>;
      }

      return renderGame();
    }

    return <p style={styles.submittedText}>Connected. Waiting for mini-game start...</p>;
  };

  const statusIcon = connectionStatus === 'connected' ? '●' : connectionStatus === 'error' ? '✗' : '○';

  return (
    <div style={quadrantStyles.container}>
      <div style={quadrantStyles.header}>
        <span style={{ color: FACTION_COLORS[index], ...quadrantStyles.headerName }}>
          {displayName}
        </span>
        <span style={quadrantStyles.headerStatus}>
          {statusIcon} {connectionStatus}
        </span>
      </div>
      <div style={quadrantStyles.body}>
        {renderContent()}
      </div>
    </div>
  );
};

// ========== MiniGameBoard (main page) ==========

export const MiniGameBoardScene: React.FC = () => {
  const [clients, setClients] = useState<MiniGameClient[]>([]);
  const [selectedGameType, setSelectedGameType] = useState<MiniGameBoardGameType>('dice_race');
  const [matchId, setMatchId] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [statusLog, setStatusLog] = useState<{ id: number; message: string }[]>([]);
  const nextLogIdRef = useRef(0);

  // Get the same Nakama endpoint that the main client is using
  const endpointInput = useMemo(() => {
    // Use the raw endpoint string directly from the running gameService
    return gameService.getServerConfig().endpoint;
  }, []);

  // Initialize four MiniGameClient instances
  const initClients = useCallback(() => {
    const newClients = [0, 1, 2, 3].map((i) => new MiniGameClient(i, endpointInput));
    setClients(newClients);
    return newClients;
  }, [endpointInput]);

  const addLog = useCallback((message: string) => {
    const id = nextLogIdRef.current;
    nextLogIdRef.current += 1;
    setStatusLog((prev) => [...prev.slice(-20), { id, message }]);
  }, []);

  // Connect all four clients
  const handleConnectAll = useCallback(async () => {
    setIsConnecting(true);
    addLog('Connecting four test clients...');

    const newClients = clients.length === 0 ? initClients() : clients;

    try {
      await Promise.all(newClients.map((c) => c.connect()));
      addLog('All four clients connected successfully!');
    } catch (error) {
      addLog(`Connection error: ${error instanceof Error ? error.message : String(error)}`);
    }

    setIsConnecting(false);
  }, [addLog, clients, initClients]);

  // Create room and join all clients
  const handleCreateAndJoin = useCallback(async () => {
    if (clients.length === 0 || clients.some((c) => c.getStore().getState().connectionStatus !== 'connected')) {
      addLog('Error: Connect all clients first!');
      return;
    }

    setIsCreatingRoom(true);
    addLog('Creating room...');

    try {
      // Client 0 creates the room
      const newMatchId = await clients[0].createRoom('test_minigame', 4);
      setMatchId(newMatchId);
      addLog(`Room created: ${newMatchId}`);

      // All four clients join
      await Promise.all(clients.map((c) => c.joinMatch(newMatchId)));
      addLog('All four clients joined the room!');

      addLog('Room is ready. Select a game type, then trigger it.');
    } catch (error) {
      addLog(`Room error: ${error instanceof Error ? error.message : String(error)}`);
    }

    setIsCreatingRoom(false);
  }, [addLog, clients]);

  // Trigger mini-game via RPC
  const handleTriggerMinigame = useCallback(async () => {
    if (!matchId || clients.length === 0) {
      addLog('Error: No match ID available');
      return;
    }

    setIsTriggering(true);

    try {
      const clientStates = clients.map((client) => client.getStore().getState());
      const hasActiveRound = clientStates.some((state) => state.miniGameStart && !state.miniGameResult);
      const hasResultView = !hasActiveRound && clientStates.some((state) => state.miniGameResult);

      if (hasResultView) {
        clients.forEach((client) => {
          client.resetForNewRound();
        });
        await waitForRenderCleanup();
        addLog('Previous mini-game view cleared.');
      } else if (hasActiveRound) {
        addLog('Mini-game still active; sent trigger will be queued by the backend.');
      }

      await clients[0].triggerMiniGame(selectedGameType);
      addLog(`${selectedGameType} trigger sent for match ${matchId}`);
    } catch (error) {
      addLog(`Trigger error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsTriggering(false);
    }
  }, [addLog, clients, matchId, selectedGameType]);

  const connectionLabel = (() => {
    if (clients.length === 0) return 'not connected';

    const connectedCount = clients.filter(
      (client) => client.getStore().getState().connectionStatus === 'connected',
    ).length;
    return `${connectedCount}/${clients.length} connected`;
  })();

  useEffect(() => {
    return miniGameBoardDevControls.attach({
      connectAll: handleConnectAll,
      createAndJoin: handleCreateAndJoin,
      triggerMiniGame: handleTriggerMinigame,
      setGameType: setSelectedGameType,
    });
  }, [handleConnectAll, handleCreateAndJoin, handleTriggerMinigame]);

  useEffect(() => {
    miniGameBoardDevControls.publish({
      selectedGameType,
      matchId,
      connectionLabel,
      isConnecting,
      isCreatingRoom,
      isTriggering,
      canCreateRoom: connectionLabel === '4/4 connected',
      canTriggerMiniGame: Boolean(matchId) && connectionLabel === '4/4 connected' && !isTriggering,
      statusLog,
    });
  }, [connectionLabel, isConnecting, isCreatingRoom, isTriggering, matchId, selectedGameType, statusLog]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clients.forEach((client) => {
        void client.disconnect();
      });
    };
  }, [clients]);

  return (
    <div style={boardStyles.page}>
      <div style={boardStyles.quadrantGrid}>
        {clients.map((client, i) => (
          <MiniGameQuadrant key={client.getQuadrantIndex()} client={client} index={i} />
        ))}
        {clients.length === 0 && (
          <div style={boardStyles.emptyState}>
            <strong style={boardStyles.emptyTitle}>MiniGameBoard</strong>
            <span style={boardStyles.emptyText}>Open DEV → MiniGame and connect four clients.</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default MiniGameBoardScene;

// ========== Styles ==========

const boardStyles: Record<string, React.CSSProperties> = {
  page: {
    height: '100dvh',
    width: '100%',
    backgroundColor: '#101216',
    color: '#e8e0d0',
    fontFamily: 'monospace',
    fontSize: '12px',
    overflow: 'hidden',
  },
  quadrantGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gridTemplateRows: '1fr 1fr',
    height: '100%',
    gap: '1px',
    backgroundColor: '#292f37',
  },
  emptyState: {
    gridArea: '1 / 1 / 3 / 3',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    color: '#8993a2',
  },
  emptyTitle: {
    color: '#f0f2f5',
    fontSize: '28px',
    letterSpacing: '0.08em',
  },
  emptyText: {
    fontSize: '13px',
  },
};

const quadrantStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
    backgroundColor: '#171a20',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
    padding: '5px 10px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    backgroundColor: '#11141a',
  },
  headerName: {
    fontSize: '12px',
    fontWeight: 900,
  },
  headerStatus: {
    fontSize: '10px',
    color: '#9facbc',
  },
  body: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '8px',
    minHeight: 0,
    overflow: 'auto',
  },
  gameArea: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  errorText: {
    color: '#ff9a9a',
    fontSize: '11px',
  },
};
