import React, { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import { styles } from './MiniGameStyles';
import { getDisambiguatedDisplayName } from '../../utils/displayName';

// 可以在这里方便地修改速算小游戏的总题目数量
export const TOTAL_QUESTIONS = 3;

// Robust seeded PRNG: xmur3 for hashing, mulberry32 for generation
function xmur3(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = h << 13 | h >>> 19;
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a: number) {
  return function () {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

interface Question {
  text: string;
  answer: number;
}

// 增加 questionCount 参数，以支持动态题目数量
function generateQuestions(seed: string, questionCount: number): Question[] {
  const seedGen = xmur3(seed);
  const rand = mulberry32(seedGen());

  const questions: Question[] = [];
  const ops = ['+', '-', '×']; // Removed division

  for (let i = 0; i < questionCount; i++) {
    const op = ops[Math.floor(rand() * ops.length)];
    let num1 = 0, num2 = 0, answer = 0;

    if (op === '+') {
      // Addition: sum up to 50
      answer = Math.floor(rand() * 41) + 10; // 10 to 50
      num1 = Math.floor(rand() * (answer - 5)) + 2; 
      num2 = answer - num1;
    } else if (op === '-') {
      // Subtraction: max 50
      num1 = Math.floor(rand() * 41) + 10; // 10 to 50
      num2 = Math.floor(rand() * (num1 - 2)) + 1;
      answer = num1 - num2;
    } else if (op === '×') {
      // Multiplication: factors up to 10, product up to 50 (to keep it heart-calculatable)
      const pairs: [number, number][] =[];
      for (let a = 2; a <= 10; a++) {
        for (let b = 2; a * b <= 50; b++) {
          pairs.push([a, b]);
        }
      }
      const pair = pairs[Math.floor(rand() * pairs.length)] || [2, 2];
      num1 = pair[0];
      num2 = pair[1];
      answer = num1 * num2;
    }

    questions.push({
      text: `${num1} ${op} ${num2} = ?`,
      answer,
    });
  }
  return questions;
}

export interface MathCalcMiniGameProps {
  isParticipant: boolean;
  submitted: boolean;
  isSubmitting: boolean;
  submitError: string;
  onSubmit: (gameData: Record<string, any>) => void;
}

export const MathCalcMiniGame: React.FC<MathCalcMiniGameProps> = ({
  isParticipant,
  submitted,
  isSubmitting,
  submitError,
  onSubmit,
}) => {
  const { matchId, round } = useGameStore();

  const [phase, setPhase] = useState<'countdown' | 'playing' | 'finished'>('countdown');
  const [countdown, setCountdown] = useState(3);

  const [questions, setQuestions] = useState<Question[]>([]);
  const[currentQIndex, setCurrentQIndex] = useState(0);
  const [inputValue, setInputValue] = useState<string>('');
  const [correctCount, setCorrectCount] = useState(0);
  const[finalTimeMs, setFinalTimeMs] = useState<number>(0);

  const startTimeRef = useRef<number>(0);

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const[activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    const seed = `${matchId || 'fallback'}_${round}`;
    setQuestions(generateQuestions(seed, TOTAL_QUESTIONS));
  }, [matchId, round]);

  useEffect(() => {
    if (!isParticipant) return;

    if (phase === 'countdown') {
      if (countdown > 0) {
        const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
        return () => clearTimeout(timer);
      } else {
        setPhase('playing');
        startTimeRef.current = Date.now();
      }
    }
  }, [countdown, phase, isParticipant]);

  const handleKeyPress = (key: string) => {
    if (phase !== 'playing' || !isParticipant) return;

    if (key >= '0' && key <= '9') {
      setInputValue(prev => (prev.length < 3 ? prev + key : prev));
    } else if (key === 'Delete' || key === 'Backspace') {
      setInputValue(prev => prev.slice(0, -1));
    } else if (key === 'Submit' || key === 'Enter') {
      if (inputValue === '') return;

      const isCorrect = parseInt(inputValue, 10) === questions[currentQIndex].answer;
      let nextCorrect = correctCount;
      if (isCorrect) {
        nextCorrect = correctCount + 1;
        setCorrectCount(nextCorrect);
      }

      setInputValue('');

      // 使用 TOTAL_QUESTIONS 替代原本硬编码的 9
      if (currentQIndex < TOTAL_QUESTIONS - 1) {
        setCurrentQIndex(prev => prev + 1);
      } else {
        const endTime = Date.now();
        const duration = endTime - startTimeRef.current;
        // 使用 TOTAL_QUESTIONS 替代原本硬编码的 10.0
        const accuracy = nextCorrect / TOTAL_QUESTIONS;

        setFinalTimeMs(duration);
        setPhase('finished');
        if (!submitted && !isSubmitting) {
          onSubmit({ accuracy, time_ms: duration });
        }
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handleKeyPress('Delete');
      } else if (e.key === 'Enter') {
        handleKeyPress('Submit');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  },[phase, inputValue, currentQIndex, correctCount, questions, handleKeyPress]);

  const renderKeypad = () => {
    const keys =['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', 'Submit'];

    return (
      <div style={styles.keypadGrid}>
        {keys.map(key => {
          const isAction = key === 'Submit';
          const isZero = key === '0';

          let btnStyle = { ...styles.keypadBtn };
          if (isZero) btnStyle = { ...btnStyle, ...styles.zeroBtn };
          if (isAction) btnStyle = { ...btnStyle, ...styles.keypadBtnAction };

          if (activeKey === key) {
            btnStyle = { ...btnStyle, ...styles.keypadBtnActive };
          } else if (hoveredKey === key) {
            btnStyle = { ...btnStyle, ...styles.keypadBtnHover };
          }

          return (
            <button
              key={key}
              style={btnStyle}
              onMouseEnter={() => setHoveredKey(key)}
              onMouseLeave={() => { setHoveredKey(null); setActiveKey(null); }}
              onMouseDown={() => setActiveKey(key)}
              onMouseUp={() => { setActiveKey(null); handleKeyPress(key); }}
              onTouchStart={() => setActiveKey(key)}
              onTouchEnd={(e) => { e.preventDefault(); setActiveKey(null); handleKeyPress(key); }}
            >
              {key === 'Submit' ? '确认' : key}
            </button>
          );
        })}
      </div>
    );
  };

  if (phase === 'countdown') {
    return (
      <div style={styles.countdownContainer}>
        <p style={styles.countdownText}>{countdown}</p>
        <p style={{ fontSize: '18px', color: '#666', marginTop: '16px' }}>准备好计算了吗？</p>
      </div>
    );
  }

  if (phase === 'finished') {
    const { miniGameStart, miniGameResult, myPlayerId, players } = useGameStore.getState();
    const participants = miniGameStart?.players ||[];

    const allPlayersData = players.map(p => ({
      displayName: p.display_name || p.player_id,
      userId: p.player_id,
    }));

    return (
      <div style={styles.mathGameContainer}>
        <h3 style={styles.resultTitle}>计算完成!</h3>

        <div style={styles.miniRankingList}>
          {participants.map(pId => {
            const isMe = pId === myPlayerId;
            const playerInfo = players.find(p => p.player_id === pId);
            const name = getDisambiguatedDisplayName(
              playerInfo?.display_name || pId,
              pId,
              allPlayersData
            );

            const resultEntry = miniGameResult?.rankings.find(r => r.player_id === pId);
            const isFinished = !!resultEntry;

            return (
              <div key={pId} style={styles.miniRankingItem}>
                <span style={{ fontWeight: isMe ? 'bold' : 'normal' }}>
                  {name} {isMe ? '(我)' : ''}
                </span>

                {isMe ? (
                  <span style={styles.statusFinished}>
                    {/* 使用 TOTAL_QUESTIONS 计算正确的百分比 */}
                    {((correctCount / TOTAL_QUESTIONS) * 100).toFixed(0)}% | {(finalTimeMs / 1000).toFixed(1)}s
                  </span>
                ) : isFinished ? (
                  <span style={styles.statusFinished}>
                    {(resultEntry.game_data?.accuracy * 100).toFixed(0)}% | {(resultEntry.game_data?.time_ms / 1000).toFixed(1)}s
                  </span>
                ) : (
                  <span style={styles.statusPlaying}>正在答题中...</span>
                )}
              </div>
            );
          })}
        </div>

        <p style={{ ...styles.gameDataDetail, fontSize: '14px', textAlign: 'center' }}>
          {isSubmitting ? '正在同步成绩...' : (submitted ? '等待其他玩家答题...' : '提交中...')}
        </p>
        {submitError && <p style={{ color: 'red', fontSize: '12px' }}>{submitError}</p>}
      </div>
    );
  }

  const currentQ = questions[currentQIndex];

  return (
    <div style={styles.mathGameContainer}>
      <div style={styles.questionHeader}>
        {/* 使用 TOTAL_QUESTIONS 替换硬编码的 10 */}
        <span>题号: {currentQIndex + 1} / {TOTAL_QUESTIONS}</span>
        <span style={{ color: '#28a745' }}>数算挑战</span>
      </div>

      <div style={styles.questionDisplay}>
        {currentQ?.text}
      </div>

      <div style={styles.inputArea}>
        <div style={styles.inputDisplay}>
          {inputValue || <span style={{ color: '#aaa', fontWeight: 'normal' }}>?</span>}
        </div>
        <button
          style={styles.inlineDelBtn}
          onClick={() => handleKeyPress('Delete')}
        >
          退格
        </button>
      </div>

      {renderKeypad()}
    </div>
  );
};