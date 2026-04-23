/**
 * OpCode 定义 - 对齐后端 pkg/net/opcode.go
 *
 * Server -> Client: 1-99
 * Client -> Server: 100+
 */

// ========== Server -> Client Messages ==========

/** 完整状态同步 - 进入新状态时广播 */
export const OpStateSync = 1;

/** 回合效果列表 - 用于客户端渲染 */
export const OpTurnSync = 2;

/** 决策请求 - 请求用户输入 (掷骰子、道具选择等) */
export const OpDecisionRequest = 3;

/** 可用操作列表 - 当前玩家可用操作 (道具、技能、骰子类型) */
export const OpAvailable = 4;

/** 小游戏开始通知 */
export const OpMiniGameStart = 5;

/** 小游戏结果广播 */
export const OpMiniGameResult = 6;

/** 游戏结束广播 */
export const OpGameOver = 7;

/** 完整同步 - 用于重连玩家 */
export const OpFullSync = 8;

/** 动作拒绝通知 */
export const OpActionRejected = 9;

/** 等待同步 - 游戏开始前房主等待状态 */
export const OpWaitingSync = 10;

// ========== Client -> Server Messages ==========

/** 掷骰子请求 */
export const OpRollDice = 100;

/** 使用道具请求 */
export const OpUseItem = 101;

/** 阵营技能请求 */
export const OpUseSkill = 102;

/** 决策选择响应 */
export const OpUserChoice = 103;

/** 小游戏排名提交 (已废弃 - 服务端计算) */
export const OpMiniGameResultSubmit = 104;

/** 房主开始游戏请求 */
export const OpStartGame = 105;

// ========== OpCode 工具函数 ==========

/** 获取 OpCode 名称 (用于日志) */
export function getOpCodeName(opCode: number): string {
  const names: Record<number, string> = {
    [OpStateSync]: 'state_sync',
    [OpTurnSync]: 'turn_sync',
    [OpDecisionRequest]: 'decision_request',
    [OpAvailable]: 'available',
    [OpMiniGameStart]: 'mini_game_start',
    [OpMiniGameResult]: 'mini_game_result',
    [OpGameOver]: 'game_over',
    [OpFullSync]: 'full_sync',
    [OpActionRejected]: 'action_rejected',
    [OpWaitingSync]: 'waiting_sync',
    [OpRollDice]: 'roll_dice',
    [OpUseItem]: 'use_item',
    [OpUseSkill]: 'use_skill',
    [OpUserChoice]: 'user_choice',
    [OpMiniGameResultSubmit]: 'mini_game_result_submit',
    [OpStartGame]: 'start_game',
  };
  return names[opCode] || 'unknown';
}

/** 判断是否为服务端到客户端的消息 */
export function isServerToClient(opCode: number): boolean {
  return opCode >= 1 && opCode <= 99;
}

/** 判断是否为客户端到服务端的消息 */
export function isClientToServer(opCode: number): boolean {
  return opCode >= 100;
}
