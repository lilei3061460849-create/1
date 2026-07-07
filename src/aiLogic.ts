import { Card } from './types';
import { GoogleGenAI, Type } from '@google/genai';
import { GameReport } from './VersusMode';

const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: () => T, gameReport?: GameReport): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('AI Timeout')), ms))
  ]).catch(e => {
    console.error("AI Error or Timeout:", e);
    if (gameReport) {
      if (!gameReport.errors) gameReport.errors = [];
      gameReport.errors.push(`[${new Date().toISOString()}] AI Error: ${e.message}`);
    }
    return fallback();
  });
};

export const getAiDraftChoice = async (
  pool: Card[],
  myHand: Card[],
  oppHand: Card[],
  aiType: 'AI_LOCAL' | 'AI_GEMINI',
  gameReport?: GameReport
): Promise<Card> => {
  const fallback = () => pool.reduce((prev, curr) => (curr.baseValue > prev.baseValue ? curr : prev), pool[0]);

  if (aiType === 'AI_LOCAL') {
    await new Promise(resolve => setTimeout(resolve, 500));
    return fallback();
  }

  const aiCall = async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `
    你正在玩一个卡牌游戏的轮流选牌（Draft）阶段。
    目前池子里还有以下卡牌：
    ${pool.map(c => `- ID: ${c.id}, 名称: ${c.name}, 点数: ${c.baseValue}, 描述: ${c.description}`).join('\n')}
    
    你目前已选的卡牌：${myHand.map(c => c.name).join(', ') || '无'}
    对手已选的卡牌：${oppHand.map(c => c.name).join(', ') || '无'}
    
    请根据卡牌的点数和效果，选择一张最有利于你的卡牌。
    返回你选择的卡牌的ID。
    `;
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            selectedCardId: { type: Type.STRING, description: "选择的卡牌ID" }
          },
          required: ["selectedCardId"]
        }
      }
    });
    
    const json = JSON.parse(response.text || '{}');
    let bestCard = pool.find(c => c.id === json.selectedCardId);
    if (!bestCard) return fallback();
    return bestCard;
  };

  return withTimeout(aiCall(), 5 * 60 * 1000, fallback, gameReport);
};

export const getAiChoice = async (
  hand: Card[],
  oppHand: Card[],
  hp: number,
  oppHp: number,
  discard: Card[],
  disabledCardId: string | null,
  aiType: 'AI_LOCAL' | 'AI_GEMINI',
  gameReport?: GameReport
): Promise<{ card: Card; baizeGuess: 'GT5' | 'LTE5' | null; jingweiTarget: Card | null }> => {
  let playableHand = hand.filter(c => c.instanceId !== disabledCardId);
  if (playableHand.length === 0) playableHand = hand; // Fallback
  
  let selectedCard = playableHand[0];
  let baizeGuess: 'GT5' | 'LTE5' | null = null;
  let jingweiTarget: Card | null = null;

  const fallback = () => {
    const oppAvg = oppHand.reduce((sum, c) => sum + c.currentValue, 0) / Math.max(1, oppHand.length);
    const winningCards = playableHand.filter(c => c.currentValue > oppAvg);
    if (winningCards.length > 0) {
      return winningCards.reduce((min, c) => c.currentValue < min.currentValue ? c : min, winningCards[0]);
    } else {
      return playableHand.reduce((min, c) => c.currentValue < min.currentValue ? c : min, playableHand[0]);
    }
  };

  if (aiType === 'AI_LOCAL') {
    await new Promise(resolve => setTimeout(resolve, 500));
    selectedCard = fallback();
  } else {
    const aiCall = async () => {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `
      你正在玩一个卡牌对战游戏。
      你的HP: ${hp}, 对手HP: ${oppHp}。
      你的手牌：
      ${playableHand.map(c => `- ID: ${c.id}, 名称: ${c.name}, 当前点数: ${c.currentValue}, 描述: ${c.description}`).join('\n')}
      
      对手的手牌（公开）：
      ${oppHand.map(c => `- ID: ${c.id}, 名称: ${c.name}, 当前点数: ${c.currentValue}, 描述: ${c.description}`).join('\n')}
      
      历史记录（记牌器）：
      ${gameReport ? JSON.stringify(gameReport.turns.slice(-3)) : '无'}
      
      规则：双方同时出牌，点数大者获胜。胜者对败者造成2点伤害。平局各受1点伤害。点数>=4的卡牌会额外造成1点伤害。
      请根据当前局势，选择一张你要打出的卡牌。
      返回你选择的卡牌的ID。
      `;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              selectedCardId: { type: Type.STRING, description: "选择的卡牌ID" }
            },
            required: ["selectedCardId"]
          }
        }
      });
      
      const json = JSON.parse(response.text || '{}');
      const foundCard = playableHand.find(c => c.id === json.selectedCardId);
      if (foundCard) return foundCard;
      return fallback();
    };

    selectedCard = await withTimeout(aiCall(), 5 * 60 * 1000, fallback, gameReport);
  }

  if (selectedCard.id === 'baize') {
    const gt5Count = oppHand.filter(c => c.currentValue > 5).length;
    const lte5Count = oppHand.length - gt5Count;
    baizeGuess = gt5Count > lte5Count ? 'GT5' : 'LTE5';
  }

  if (selectedCard.id === 'jingwei' && discard.length > 0) {
    jingweiTarget = [...discard].sort((a, b) => b.baseValue - a.baseValue)[0];
  }

  return { card: selectedCard, baizeGuess, jingweiTarget };
};
