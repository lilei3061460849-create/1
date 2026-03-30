import React, { useState, useEffect, useRef } from 'react';
import { Card } from './types';
import { ALIEN_BEASTS } from './cards';
import { cloneCard } from './utils';
import { Shield, Sword, Heart, History, ArrowLeft, Loader2, X, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from '@google/genai';

type VersusPhase = 'DRAFT' | 'BATTLE' | 'GAMEOVER';

interface HistoryRecord {
  turn: number;
  pCard: Card;
  eCard: Card;
  result: string;
  events: string[];
  pHP: number;
  eHP: number;
}

export default function VersusMode({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<VersusPhase>('DRAFT');
  const [pool, setPool] = useState<Card[]>([]);
  const [pHand, setPHand] = useState<Card[]>([]);
  const [eHand, setEHand] = useState<Card[]>([]);
  const [pDiscard, setPDiscard] = useState<Card[]>([]);
  const [eDiscard, setEDiscard] = useState<Card[]>([]);
  const [pHP, setPHP] = useState(15);
  const [eHP, setEHP] = useState(15);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [turnCount, setTurnCount] = useState(1);
  const [draftSequence, setDraftSequence] = useState<('PLAYER' | 'ENEMY')[]>([
    'PLAYER', 'ENEMY', 'ENEMY', 'PLAYER', 'PLAYER', 'ENEMY', 'ENEMY', 'PLAYER', 'PLAYER', 'ENEMY', 'ENEMY', 'PLAYER'
  ]);
  const draftTurn = draftSequence[0] || 'PLAYER';
  const [isAiThinking, setIsAiThinking] = useState(false);
  const isProcessingRef = useRef(false);
  const draftedCardsRef = useRef<Set<string>>(new Set());
  const [useHeuristic, setUseHeuristic] = useState(false);
  const [showTracker, setShowTracker] = useState(false);
  const [baizePendingCard, setBaizePendingCard] = useState<Card | null>(null);
  const [jingweiPendingCard, setJingweiPendingCard] = useState<Card | null>(null);
  const [revealState, setRevealState] = useState<{pCard: Card, eCard: Card, result: string, events: string[]} | null>(null);

  useEffect(() => {
    isProcessingRef.current = false;
  }, [draftSequence.length, phase]);

  const exportLog = () => {
    const text = history.map(r => `第 ${r.turn} 回合\n你: ${r.pCard.name}(${r.pCard.currentValue}) VS 敌: ${r.eCard.name}(${r.eCard.currentValue})\n结果: ${r.result}\n回合结束血量: 你 ${r.pHP} | 敌 ${r.eHP}\n详细: \n${r.events.map(e => '- ' + e).join('\n')}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'battle_log.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Initialize Pool
  useEffect(() => {
    let validPool = false;
    let candidatePool: Card[] = [];
    
    while (!validPool) {
      const shuffled = [...ALIEN_BEASTS].sort(() => 0.5 - Math.random());
      candidatePool = shuffled.slice(0, 12);
      
      const hasYuOrBaizeOrHenggongyu = candidatePool.some(c => c.id === 'yu' || c.id === 'baize' || c.id === 'henggongyu');
      const hasHighValue = candidatePool.some(c => c.baseValue > 5);
      
      if (hasYuOrBaizeOrHenggongyu && !hasHighValue) continue;
      
      validPool = true;
    }
    
    setPool(candidatePool.map(cloneCard));
  }, []);

  // AI Draft Logic
  useEffect(() => {
    if (phase === 'DRAFT' && draftTurn === 'ENEMY' && pool.length > 0 && !isAiThinking) {
      const doAiDraft = async () => {
        setIsAiThinking(true);
        
        const processAiPick = (card: Card) => {
          if (draftedCardsRef.current.has(card.instanceId)) return;
          draftedCardsRef.current.add(card.instanceId);

          setEHand(prev => [...prev, card]);
          const newPool = pool.filter(c => c.instanceId !== card.instanceId);
          setPool(newPool);

          let newSeq = [...draftSequence].slice(1);

          if (card.id === 'biyi') {
            const nextIdx = newSeq.indexOf('ENEMY');
            if (nextIdx !== -1) {
              newSeq.splice(nextIdx, 1);
            }
          }

          setDraftSequence(newSeq);

          if (newPool.length === 0 || newSeq.length === 0) {
            setPhase('BATTLE');
          }
        };

        if (useHeuristic) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const bestCard = pool.reduce((prev, curr) => (curr.baseValue > prev.baseValue ? curr : prev), pool[0]);
          processAiPick(bestCard);
          setIsAiThinking(false);
          return;
        }

        try {
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          const prompt = `
          你正在玩一个卡牌游戏的轮流选牌（Draft）阶段。
          目前池子里还有以下卡牌：
          ${pool.map(c => `- ID: ${c.id}, 名称: ${c.name}, 点数: ${c.baseValue}, 描述: ${c.description}`).join('\n')}
          
          你目前已选的卡牌：${eHand.map(c => c.name).join(', ') || '无'}
          对手已选的卡牌：${pHand.map(c => c.name).join(', ') || '无'}
          
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
          if (!bestCard) bestCard = pool.reduce((prev, curr) => (curr.baseValue > prev.baseValue ? curr : prev), pool[0]);
          
          processAiPick(bestCard!);
        } catch (e: any) {
          if (e?.status === 429 || e?.status === 'RESOURCE_EXHAUSTED' || JSON.stringify(e).includes('quota') || e?.message?.includes('429')) {
            setUseHeuristic(true);
          } else {
            console.error("AI Draft Error:", e);
          }
          const bestCard = pool.reduce((prev, curr) => (curr.baseValue > prev.baseValue ? curr : prev), pool[0]);
          processAiPick(bestCard);
        } finally {
          setIsAiThinking(false);
        }
      };
      
      doAiDraft();
    }
  }, [draftTurn, phase, pool, eHand, pHand, isAiThinking, draftSequence]);

  const handleDraft = (card: Card) => {
    if (draftTurn !== 'PLAYER' || isAiThinking || isProcessingRef.current) return;
    
    if (draftedCardsRef.current.has(card.instanceId)) return;
    draftedCardsRef.current.add(card.instanceId);

    isProcessingRef.current = true;
    
    setPHand(prev => [...prev, card]);
    const newPool = pool.filter(c => c.instanceId !== card.instanceId);
    setPool(newPool);
    
    let newSeq = [...draftSequence].slice(1);

    if (card.id === 'biyi') {
      const nextIdx = newSeq.indexOf('PLAYER');
      if (nextIdx !== -1) {
        newSeq.splice(nextIdx, 1);
      }
    }

    setDraftSequence(newSeq);

    if (newPool.length === 0 || newSeq.length === 0) {
      setPhase('BATTLE');
    }
  };

  const playCard = (pCard: Card) => {
    if (phase !== 'BATTLE' || isAiThinking || revealState || baizePendingCard || jingweiPendingCard || isProcessingRef.current) return;
    
    if (pCard.id === 'baize') {
      isProcessingRef.current = true;
      setBaizePendingCard(pCard);
      setTimeout(() => { isProcessingRef.current = false; }, 50);
      return;
    }
    if (pCard.id === 'jingwei' && pDiscard.length > 0) {
      isProcessingRef.current = true;
      setJingweiPendingCard(pCard);
      setTimeout(() => { isProcessingRef.current = false; }, 50);
      return;
    }
    resolvePlayCard(pCard, null, null);
  };

  const resolvePlayCard = async (pCard: Card, baizeGuess: 'GT5' | 'LTE5' | null = null, jingweiTarget: Card | null = null) => {
    if (phase !== 'BATTLE' || isAiThinking || revealState || isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsAiThinking(true);

    try {
      let eCard = eHand[0];
    
    if (useHeuristic) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const pAvg = pHand.reduce((sum, c) => sum + c.currentValue, 0) / pHand.length;
      const winningCards = eHand.filter(c => c.currentValue > pAvg);
      if (winningCards.length > 0) {
        eCard = winningCards.reduce((min, c) => c.currentValue < min.currentValue ? c : min, winningCards[0]);
      } else {
        eCard = eHand.reduce((min, c) => c.currentValue < min.currentValue ? c : min, eHand[0]);
      }
    } else {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const prompt = `
        你正在玩一个卡牌对战游戏。
        你的HP: ${eHP}, 对手HP: ${pHP}。
        你的手牌：
        ${eHand.map(c => `- ID: ${c.id}, 名称: ${c.name}, 当前点数: ${c.currentValue}, 描述: ${c.description}`).join('\n')}
        
        对手的手牌（公开）：
        ${pHand.map(c => `- ID: ${c.id}, 名称: ${c.name}, 当前点数: ${c.currentValue}, 描述: ${c.description}`).join('\n')}
        
        规则：双方同时出牌，点数大者获胜。胜者对败者造成2点伤害。平局各受1点伤害。点数>3的卡牌会额外造成1点伤害。
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
        const selectedCard = eHand.find(c => c.id === json.selectedCardId);
        if (selectedCard) eCard = selectedCard;
      } catch (e: any) {
        if (e?.status === 429 || e?.status === 'RESOURCE_EXHAUSTED' || JSON.stringify(e).includes('quota') || e?.message?.includes('429')) {
          setUseHeuristic(true);
        } else {
          console.error("AI Play Error:", e);
        }
        // Fallback to heuristic
        const pAvg = pHand.reduce((sum, c) => sum + c.currentValue, 0) / pHand.length;
        const winningCards = eHand.filter(c => c.currentValue > pAvg);
        if (winningCards.length > 0) {
          eCard = winningCards.reduce((min, c) => c.currentValue < min.currentValue ? c : min, winningCards[0]);
        } else {
          eCard = eHand.reduce((min, c) => c.currentValue < min.currentValue ? c : min, eHand[0]);
        }
      }
    }

    let eJingweiTarget: Card | null = null;
    if (eCard.id === 'jingwei' && eDiscard.length > 0) {
      eJingweiTarget = [...eDiscard].sort((a, b) => b.baseValue - a.baseValue)[0];
    }

    // Remove from hands
    let newPHand = pHand.filter(c => c.instanceId !== pCard.instanceId);
    let newEHand = eHand.filter(c => c.instanceId !== eCard.instanceId);

    let pCardCopy = cloneCard(pCard);
    let eCardCopy = cloneCard(eCard);
    
    let events: string[] = [];
    
    let currentPDiscard = [...pDiscard];
    let currentEDiscard = [...eDiscard];
    
    let pDamage = 0;
    let eDamage = 0;
    let pHeal = 0;
    let eHeal = 0;
    let pCardDies = false;
    let eCardDies = false;
    let pCardReturns = false;
    let eCardReturns = false;
    let pNoDamage = false;
    let eNoDamage = false;
    let pDisableEffects = false;
    let eDisableEffects = false;
    let pCardRemoved = false;
    let eCardRemoved = false;

    // Qilin check
    if (pCardCopy.id === 'qilin') { eDisableEffects = true; events.push(`你的【麒麟】发动能力，封印了敌方异兽能力！`); }
    if (eCardCopy.id === 'qilin') { pDisableEffects = true; events.push(`敌方的【麒麟】发动能力，封印了你的异兽能力！`); }

    if (!pDisableEffects && pCardCopy.id === 'zhuyan') {
      if (newPHand.length > 0) {
        const maxP = newPHand.reduce((max, c) => c.currentValue > max.currentValue ? c : max, newPHand[0]);
        newPHand = newPHand.filter(c => c.instanceId !== maxP.instanceId);
        currentPDiscard.push(maxP);
        events.push(`你的【朱厌】发动能力，你弃置了最大点数牌【${maxP.name}】`);
      }
      if (newEHand.length > 0) {
        const maxE = newEHand.reduce((max, c) => c.currentValue > max.currentValue ? c : max, newEHand[0]);
        newEHand = newEHand.filter(c => c.instanceId !== maxE.instanceId);
        currentEDiscard.push(maxE);
        events.push(`你的【朱厌】发动能力，敌方弃置了最大点数牌【${maxE.name}】`);
      }
    }

    if (!eDisableEffects && eCardCopy.id === 'zhuyan') {
      if (newPHand.length > 0) {
        const maxP = newPHand.reduce((max, c) => c.currentValue > max.currentValue ? c : max, newPHand[0]);
        newPHand = newPHand.filter(c => c.instanceId !== maxP.instanceId);
        currentPDiscard.push(maxP);
        events.push(`敌方的【朱厌】发动能力，你弃置了最大点数牌【${maxP.name}】`);
      }
      if (newEHand.length > 0) {
        const maxE = newEHand.reduce((max, c) => c.currentValue > max.currentValue ? c : max, newEHand[0]);
        newEHand = newEHand.filter(c => c.instanceId !== maxE.instanceId);
        currentEDiscard.push(maxE);
        events.push(`敌方的【朱厌】发动能力，敌方弃置了最大点数牌【${maxE.name}】`);
      }
    }

    // Pre-reveal modifications
    if (!pDisableEffects) {
      if (pCardCopy.id === 'changyou') { pCardCopy.currentValue = eCardCopy.currentValue; events.push(`你的【长右】发动能力，点数变为敌方点数(${eCardCopy.currentValue})`); }
      if (pCardCopy.id === 'bian') { pCardCopy.currentValue += 1; events.push(`你的【狴犴】发动能力，点数+1`); }
      if (pCardCopy.id === 'bibi' && !pCardCopy.playedOnce) { pCardCopy.currentValue += 2; events.push(`你的【獙獙】首次打出，点数+2`); }
      if (pCardCopy.id === 'dijiang') { pCardCopy.currentValue = Math.floor(Math.random() * 9) + 1; events.push(`你的【帝江】发动能力，点数随机变为${pCardCopy.currentValue}`); }
      if (pCardCopy.id === 'kuafu') { pDamage += 1; events.push(`你的【夸父】发动能力，你失去1生命`); }
      if (pCardCopy.id === 'baize') {
        if (baizeGuess === 'GT5') {
          if (eCardCopy.currentValue > 5) { pCardCopy.currentValue += 2; events.push(`你的【白泽】猜测成功(敌方>5)，点数+2`); }
          else { pCardCopy.currentValue -= 2; events.push(`你的【白泽】猜测失败(敌方<=5)，点数-2`); }
        } else if (baizeGuess === 'LTE5') {
          if (eCardCopy.currentValue <= 5) { pCardCopy.currentValue += 2; events.push(`你的【白泽】猜测成功(敌方<=5)，点数+2`); }
          else { pCardCopy.currentValue -= 2; events.push(`你的【白泽】猜测失败(敌方>5)，点数-2`); }
        }
      }
    }

    if (!eDisableEffects) {
      if (eCardCopy.id === 'changyou') { eCardCopy.currentValue = pCardCopy.currentValue; events.push(`敌方的【长右】发动能力，点数变为你的点数(${pCardCopy.currentValue})`); }
      if (eCardCopy.id === 'bian') { eCardCopy.currentValue += 1; events.push(`敌方的【狴犴】发动能力，点数+1`); }
      if (eCardCopy.id === 'bibi' && !eCardCopy.playedOnce) { eCardCopy.currentValue += 2; events.push(`敌方的【獙獙】首次打出，点数+2`); }
      if (eCardCopy.id === 'dijiang') { eCardCopy.currentValue = Math.floor(Math.random() * 9) + 1; events.push(`敌方的【帝江】发动能力，点数随机变为${eCardCopy.currentValue}`); }
      if (eCardCopy.id === 'kuafu') { eDamage += 1; events.push(`敌方的【夸父】发动能力，敌方失去1生命`); }
      if (eCardCopy.id === 'baize') {
        const gt5Count = pHand.filter(c => c.currentValue > 5).length;
        const lte5Count = pHand.length - gt5Count;
        const eGuess = gt5Count > lte5Count ? 'GT5' : 'LTE5';
        
        if (eGuess === 'GT5') {
          if (pCardCopy.currentValue > 5) { eCardCopy.currentValue += 2; events.push(`敌方的【白泽】猜测成功(你>5)，点数+2`); }
          else { eCardCopy.currentValue -= 2; events.push(`敌方的【白泽】猜测失败(你<=5)，点数-2`); }
        } else {
          if (pCardCopy.currentValue <= 5) { eCardCopy.currentValue += 2; events.push(`敌方的【白泽】猜测成功(你<=5)，点数+2`); }
          else { eCardCopy.currentValue -= 2; events.push(`敌方的【白泽】猜测失败(你>5)，点数-2`); }
        }
      }
    }

    // Apply >3 negative stats rule
    if (pCardCopy.currentValue > 3) { pDamage += 1; events.push(`你的异兽点数大于3，你额外受到1点反噬伤害`); }
    if (eCardCopy.currentValue > 3) { eDamage += 1; events.push(`敌方异兽点数大于3，敌方额外受到1点反噬伤害`); }

    // Capture history state before winner reduction
    const historyPCard = cloneCard(pCardCopy);
    const historyECard = cloneCard(eCardCopy);

    let resultText = '';
    if (pCardCopy.currentValue > eCardCopy.currentValue) {
      eDamage += 2;
      eCardDies = true;
      pCardReturns = true;
      resultText = `你赢了！`;
      if (!pDisableEffects && pCardCopy.id === 'chiyou') {
        pCardDies = true; pCardReturns = false; eDamage += 2; events.push(`你的【蚩尤】发动能力，胜利后额外造成2伤害并死亡`);
      }
      if (!pDisableEffects && pCardCopy.id === 'yu' && eCardCopy.currentValue > 5) {
        events.push(`你的【蜮】发动能力，因敌方大于5点，敌方异兽直接死亡，你的蜮回手`);
      }
      if (!eDisableEffects && eCardCopy.id === 'yu' && pCardCopy.currentValue > 5) {
        pCardDies = true; pCardReturns = false; eCardDies = false; eCardReturns = true; events.push(`敌方的【蜮】发动能力，因你大于5点，你的异兽直接死亡，敌方蜮回手`);
      }
      
      if (pCardReturns) {
        const oldVal = pCardCopy.currentValue;
        pCardCopy.currentValue -= eCardCopy.currentValue;
        events.push(`你的【${pCardCopy.name}】胜利，${oldVal}耗损为${pCardCopy.currentValue}`);
      }
    } else if (eCardCopy.currentValue > pCardCopy.currentValue) {
      pDamage += 2;
      pCardDies = true;
      eCardReturns = true;
      resultText = `你输了！`;
      if (!eDisableEffects && eCardCopy.id === 'chiyou') {
        eCardDies = true; eCardReturns = false; pDamage += 2; events.push(`敌方的【蚩尤】发动能力，胜利后额外造成2伤害并死亡`);
      }
      if (!eDisableEffects && eCardCopy.id === 'yu' && pCardCopy.currentValue > 5) {
        events.push(`敌方的【蜮】发动能力，因你大于5点，你的异兽直接死亡，敌方蜮回手`);
      }
      if (!pDisableEffects && pCardCopy.id === 'yu' && eCardCopy.currentValue > 5) {
        eCardDies = true; eCardReturns = false; pCardDies = false; pCardReturns = true; events.push(`你的【蜮】发动能力，因敌方大于5点，敌方异兽直接死亡，你的蜮回手`);
      }
      
      if (eCardReturns) {
        const oldVal = eCardCopy.currentValue;
        eCardCopy.currentValue -= pCardCopy.currentValue;
        events.push(`敌方的【${eCardCopy.name}】胜利，${oldVal}耗损为${eCardCopy.currentValue}`);
      }
    } else {
      pDamage += 1;
      eDamage += 1;
      pCardDies = true;
      eCardDies = true;
      resultText = `平局！`;
      if (!pDisableEffects && pCardCopy.id === 'yu' && eCardCopy.currentValue > 5) {
        eCardDies = true; pCardDies = false; pCardReturns = true; events.push(`你的【蜮】发动能力，因敌方大于5点，敌方异兽直接死亡，你的蜮回手`);
      }
      if (!eDisableEffects && eCardCopy.id === 'yu' && pCardCopy.currentValue > 5) {
        pCardDies = true; eCardDies = false; eCardReturns = true; events.push(`敌方的【蜮】发动能力，因你大于5点，你的异兽直接死亡，敌方蜮回手`);
      }
    }

    // Death/Return effects
    const handleDeathOrReturn = (card: Card, isPlayer: boolean, isDeath: boolean, isReturn: boolean, disabled: boolean) => {
      const prefix = isPlayer ? '你的' : '敌方的';
      if (disabled) return;
      if (isDeath) {
        if (card.id === 'bifang') {
          events.push(`${prefix}【毕方】死亡，双方手中所有异兽点数永久-1`);
          
          const processHand = (hand: Card[], discard: Card[], isPlayerHand: boolean) => {
            let remaining: Card[] = [];
            for (let c of hand) {
              if (c.id === 'dijiang') {
                remaining.push(c);
                continue;
              }
              c.currentValue -= 1;
              if (c.currentValue <= 0) {
                discard.push(c);
                events.push(`${isPlayerHand ? '你' : '敌方'}的【${c.name}】因点数降至0而死亡`);
              } else {
                remaining.push(c);
              }
            }
            return remaining;
          };
          
          newPHand = processHand(newPHand, currentPDiscard, true);
          newEHand = processHand(newEHand, currentEDiscard, false);
        }
        if (card.id === 'zhen') {
          if (isPlayer && newEHand.length > 0) {
            const min = newEHand.reduce((min, c) => c.currentValue < min.currentValue ? c : min, newEHand[0]);
            newEHand = newEHand.filter(c => c.instanceId !== min.instanceId);
            currentEDiscard.push(min);
            events.push(`${prefix}【鸩】死亡，敌方弃置了最小点数牌 ${min.name}`);
          } else if (!isPlayer && newPHand.length > 0) {
            const min = newPHand.reduce((min, c) => c.currentValue < min.currentValue ? c : min, newPHand[0]);
            newPHand = newPHand.filter(c => c.instanceId !== min.instanceId);
            currentPDiscard.push(min);
            events.push(`${prefix}【鸩】死亡，你弃置了最小点数牌 ${min.name}`);
          }
        }
        if (card.id === 'xiangliu' && card.currentValue !== 9) {
          if (isPlayer) { pCardDies = false; pCardReturns = true; pCardCopy.currentValue += 2; }
          else { eCardDies = false; eCardReturns = true; eCardCopy.currentValue += 2; }
          events.push(`${prefix}【相柳】死亡，因点数不为9，回手并+2点数`);
        }
        if (card.id === 'henggongyu') {
          let oppValue = isPlayer ? historyECard.currentValue : historyPCard.currentValue;
          if (oppValue > 5) {
            if (isPlayer) { 
              pCardDies = false; pCardReturns = true; 
              pHeal += 1; eDamage += 1; 
            } else { 
              eCardDies = false; eCardReturns = true; 
              eHeal += 1; pDamage += 1; 
            }
            events.push(`${prefix}【横公鱼】死亡，因对手大于5点，成功回手并偷取1点生命`);
          }
        }
        if (card.id === 'chenghuang') {
          if (isPlayer) pHeal += 3; else eHeal += 3;
          events.push(`${prefix}【乘黄】死亡，恢复3生命`);
        }
        if (card.id === 'boyi') {
          if (isPlayer) pNoDamage = true; else eNoDamage = true;
          events.push(`${prefix}【猼訑】死亡，本回合免受伤害`);
        }
        if (card.id === 'fei') {
          pDamage += 2; eDamage += 2;
          events.push(`${prefix}【蜚】死亡，双方各失去2生命`);
        }
        if (card.id === 'jiuweihu' && card.currentValue !== 1) {
          if (isPlayer) { pCardDies = false; pCardReturns = true; pCardCopy.currentValue -= 4; }
          else { eCardDies = false; eCardReturns = true; eCardCopy.currentValue -= 4; }
          events.push(`${prefix}【九尾狐】死亡，因点数不为1，回手并-4点数`);
        }
        if (card.id === 'jingwei') {
          if (isPlayer && jingweiTarget && currentPDiscard.some(c => c.instanceId === jingweiTarget.instanceId)) {
            const idx = currentPDiscard.findIndex(c => c.instanceId === jingweiTarget.instanceId);
            if (idx !== -1) {
              const recovered = currentPDiscard.splice(idx, 1)[0];
              newPHand.push(recovered);
              events.push(`${prefix}【精卫】死亡，从弃牌区收回了 ${recovered.name}`);
            }
          } else if (!isPlayer && eJingweiTarget && currentEDiscard.some(c => c.instanceId === eJingweiTarget.instanceId)) {
            const idx = currentEDiscard.findIndex(c => c.instanceId === eJingweiTarget.instanceId);
            if (idx !== -1) {
              const recovered = currentEDiscard.splice(idx, 1)[0];
              newEHand.push(recovered);
              events.push(`${prefix}【精卫】死亡，从弃牌区收回了 ${recovered.name}`);
            }
          }
        }
      }
      if (isDeath || isReturn) {
        if (card.id === 'taotie') {
          if (isPlayer) { eCardRemoved = true; }
          else { pCardRemoved = true; }
          events.push(`${prefix}【饕餮】发动能力，将对手异兽移出游戏`);
        }
        if (card.id === 'fenghuang') {
          if (isPlayer) pHeal += 1; else eHeal += 1;
          events.push(`${prefix}【凤凰】发动能力，恢复1生命`);
        }
        if (card.id === 'yongyan') {
          if (isPlayer) eDamage += 1; else pDamage += 1;
          events.push(`${prefix}【永焰】发动能力，对手失去1生命`);
        }
      }
      if (isReturn) {
        if (card.id === 'zhujian') {
          if (isPlayer && newEHand.length > 0) {
            const min = newEHand.reduce((min, c) => c.currentValue < min.currentValue ? c : min, newEHand[0]);
            events.push(`你的【诸犍】回手，查看到敌方最小点数牌是【${min.name}(${min.currentValue})】`);
          } else if (!isPlayer && newPHand.length > 0) {
            const min = newPHand.reduce((min, c) => c.currentValue < min.currentValue ? c : min, newPHand[0]);
            events.push(`敌方的【诸犍】回手，查看到你最小点数牌是【${min.name}(${min.currentValue})】`);
          }
        }
      }
    };

    handleDeathOrReturn(pCardCopy, true, pCardDies, pCardReturns, pDisableEffects);
    handleDeathOrReturn(eCardCopy, false, eCardDies, eCardReturns, eDisableEffects);

    if (pNoDamage) pDamage = 0;
    if (eNoDamage) eDamage = 0;

    pCardCopy.playedOnce = true;
    eCardCopy.playedOnce = true;

    // Revert Bibi's temporary +2 buff so it doesn't stay at 4 points permanently
    if (pCardCopy.id === 'bibi' && !pCard.playedOnce) pCardCopy.currentValue = Math.max(1, pCardCopy.currentValue - 2);
    if (eCardCopy.id === 'bibi' && !eCard.playedOnce) eCardCopy.currentValue = Math.max(1, eCardCopy.currentValue - 2);

    if (pCardRemoved) { pCardDies = true; pCardReturns = false; }
    if (eCardRemoved) { eCardDies = true; eCardReturns = false; }

    // Rule: Any card with <= 0 points dies
    if (pCardCopy.currentValue <= 0 && pCardReturns) {
      pCardDies = true;
      pCardReturns = false;
      events.push(`你的【${pCardCopy.name}】点数降至0或以下，直接死亡`);
    }
    if (eCardCopy.currentValue <= 0 && eCardReturns) {
      eCardDies = true;
      eCardReturns = false;
      events.push(`敌方的【${eCardCopy.name}】点数降至0或以下，直接死亡`);
    }

    if (pCardReturns && !pCardRemoved) newPHand.push(pCardCopy);
    if (pCardDies && !pCardRemoved) currentPDiscard.push(pCardCopy);
    
    if (eCardReturns && !eCardRemoved) newEHand.push(eCardCopy);
    if (eCardDies && !eCardRemoved) currentEDiscard.push(eCardCopy);

    setRevealState({ pCard: historyPCard, eCard: historyECard, result: resultText, events });
    setPHand(pHand.filter(c => c.instanceId !== pCard.instanceId));
    setEHand(eHand.filter(c => c.instanceId !== eCard.instanceId));
    setIsAiThinking(false);

    setTimeout(() => {
      setRevealState(null);
      setPHP(prev => Math.min(15, Math.max(0, prev - pDamage + pHeal)));
      setEHP(prev => Math.min(15, Math.max(0, prev - eDamage + eHeal)));
      setPHand(newPHand);
      setEHand(newEHand);
      setPDiscard(currentPDiscard);
      setEDiscard(currentEDiscard);
      setHistory(prev => [...prev, {
        turn: turnCount,
        pCard: historyPCard,
        eCard: historyECard,
        result: resultText,
        events,
        pHP: Math.min(15, Math.max(0, pHP - pDamage + pHeal)),
        eHP: Math.min(15, Math.max(0, eHP - eDamage + eHeal))
      }]);
      setTurnCount(c => c + 1);

      if (pHP - pDamage + pHeal <= 0 || eHP - eDamage + eHeal <= 0 || newPHand.length === 0 || newEHand.length === 0) {
        setTimeout(() => setPhase('GAMEOVER'), 500);
      }
      
      isProcessingRef.current = false;
    }, 2500);
    } catch (error) {
      console.error("Error in resolvePlayCard:", error);
      isProcessingRef.current = false;
      setIsAiThinking(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100 font-sans p-4 flex flex-col items-center">
      <div className="w-full max-w-7xl flex-1 flex flex-col">
        
        {/* Header */}
        <header className="flex justify-between items-center mb-6 border-b border-stone-700 pb-4">
          <div className="flex items-center gap-4">
            <button onClick={onExit} className="p-2 hover:bg-stone-800 rounded-full transition-colors">
              <ArrowLeft className="w-6 h-6 text-stone-400" />
            </button>
            <h1 className="text-2xl font-bold tracking-widest text-purple-500">对战模式</h1>
          </div>
          <div className="flex items-center gap-8 text-lg font-bold">
            <div className="flex items-center gap-2 text-red-400"><Heart /> 你: {pHP}</div>
            <div className="flex items-center gap-2 text-blue-400"><Heart /> 敌: {eHP}</div>
            <button 
              onClick={() => setShowTracker(true)}
              className="flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 rounded-lg text-stone-300 transition-colors text-sm"
            >
              <History className="w-4 h-4" /> 记牌器
            </button>
          </div>
        </header>

        <div className="flex-1 flex gap-6 relative">
          {/* Main Area */}
          <div className="flex-1 flex flex-col">
            
            {phase === 'DRAFT' && (
              <div className="flex-1 flex flex-col items-center justify-center space-y-6">
                <h2 className="text-2xl font-bold text-amber-500">
                  {draftTurn === 'PLAYER' ? '请选择你的异兽' : '敌方正在选择...'}
                </h2>
                <div className="grid grid-cols-4 gap-4 p-6 bg-stone-800 rounded-2xl border border-stone-700">
                  <AnimatePresence>
                    {pool.map(card => (
                      <motion.div
                        key={card.instanceId}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        whileHover={draftTurn === 'PLAYER' ? { y: -5, scale: 1.05 } : {}}
                        onClick={() => handleDraft(card)}
                        className={`cursor-pointer ${draftTurn !== 'PLAYER' ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        <MiniCard card={card} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {phase === 'BATTLE' && (
              <div className="flex-1 flex flex-row items-stretch justify-between gap-6 py-4">
                
                {/* Player Area (Left) */}
                <div className="w-2/5 flex flex-col items-center justify-start gap-6 bg-stone-800/30 rounded-3xl p-6 border border-stone-700/50 overflow-y-auto">
                  <span className="text-stone-300 font-bold text-lg border-b border-stone-700 pb-2 w-full text-center">你的手牌</span>
                  <div className="flex flex-wrap gap-4 justify-center w-full">
                    <AnimatePresence>
                      {pHand.map(card => (
                        <motion.div
                          key={card.instanceId}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          whileHover={{ scale: 1.05, y: -5 }}
                          onClick={() => playCard(card)}
                          className="cursor-pointer"
                        >
                          <MiniCard card={card} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Center Arena (Middle) */}
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  <AnimatePresence mode="wait">
                    {baizePendingCard ? (
                      <motion.div
                        key="baize"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="flex flex-col items-center gap-4 w-full"
                      >
                        <div className="text-center">
                          <h3 className="text-xl font-bold text-amber-500 mb-2">白泽的预知</h3>
                          <p className="text-stone-300 text-sm">请猜测敌方本回合打出的异兽点数。</p>
                          <p className="text-stone-400 text-xs mt-1">（猜中点数+2，猜错点数-2）</p>
                        </div>
                        <div className="flex gap-4 w-full max-w-xs mt-4">
                          <button 
                            onClick={() => {
                              const card = baizePendingCard;
                              setBaizePendingCard(null);
                              resolvePlayCard(card, 'GT5');
                            }}
                            className="flex-1 py-3 bg-red-900/50 hover:bg-red-800/50 border border-red-700/50 rounded-xl text-red-200 font-bold transition-colors"
                          >
                            大于 5
                          </button>
                          <button 
                            onClick={() => {
                              const card = baizePendingCard;
                              setBaizePendingCard(null);
                              resolvePlayCard(card, 'LTE5');
                            }}
                            className="flex-1 py-3 bg-blue-900/50 hover:bg-blue-800/50 border border-blue-700/50 rounded-xl text-blue-200 font-bold transition-colors"
                          >
                            小于等于 5
                          </button>
                        </div>
                        <button 
                          onClick={() => setBaizePendingCard(null)}
                          className="px-6 py-2 bg-stone-700/50 hover:bg-stone-600/50 border border-stone-600/50 rounded-lg text-stone-400 text-sm transition-colors mt-4"
                        >
                          取消打出
                        </button>
                      </motion.div>
                    ) : jingweiPendingCard ? (
                      <motion.div
                        key="jingwei"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="flex flex-col items-center gap-4 w-full"
                      >
                        <div className="text-center">
                          <h3 className="text-xl font-bold text-amber-500 mb-2">精卫的执念</h3>
                          <p className="text-stone-300 text-sm">请选择一张弃牌区中的异兽。</p>
                          <p className="text-stone-400 text-xs mt-1">（若精卫本回合死亡，该牌将回手）</p>
                        </div>
                        <div className="grid grid-cols-4 gap-4 p-6 bg-stone-800 rounded-2xl border border-stone-700 w-full max-h-60 overflow-y-auto">
                          {pDiscard.map((card) => (
                            <motion.div 
                              key={card.instanceId}
                              whileHover={{ scale: 1.05, y: -5 }}
                              onClick={() => {
                                const jCard = jingweiPendingCard;
                                setJingweiPendingCard(null);
                                resolvePlayCard(jCard, null, card);
                              }}
                              className="cursor-pointer"
                            >
                              <MiniCard card={card} />
                            </motion.div>
                          ))}
                        </div>
                        <button 
                          onClick={() => setJingweiPendingCard(null)}
                          className="px-6 py-2 bg-stone-700/50 hover:bg-stone-600/50 border border-stone-600/50 rounded-lg text-stone-400 text-sm transition-colors mt-2"
                        >
                          取消打出
                        </button>
                      </motion.div>
                    ) : revealState ? (
                      <motion.div 
                        key="reveal"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="flex flex-col items-center gap-4 w-full"
                      >
                        <div className="text-red-400 font-bold text-sm">敌方出牌</div>
                        <MiniCard card={revealState.eCard} />
                        <div className="text-amber-500 font-bold text-xl my-2">{revealState.result}</div>
                        <MiniCard card={revealState.pCard} />
                        <div className="text-blue-400 font-bold text-sm">你出牌</div>
                      </motion.div>
                    ) : (
                      <motion.div 
                        key="idle"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col items-center gap-8 w-full"
                      >
                        <div className="text-6xl font-black text-stone-700 italic">VS</div>
                        <div className="h-32 flex items-center justify-center text-center px-4 w-full bg-stone-800/80 rounded-2xl border border-stone-700 shadow-lg">
                          <div className="text-amber-500 text-lg font-bold animate-pulse flex items-center justify-center gap-2">
                            {isAiThinking ? (
                              <>
                                <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                                敌方正在思考...
                              </>
                            ) : (
                              '请选择出战异兽'
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Enemy Area (Right) */}
                <div className="w-2/5 flex flex-col items-center justify-start gap-6 bg-stone-800/30 rounded-3xl p-6 border border-stone-700/50 overflow-y-auto">
                  <span className="text-stone-500 font-bold text-lg border-b border-stone-700 pb-2 w-full text-center">敌方手牌 ({eHand.length})</span>
                  <div className="flex flex-wrap gap-4 justify-center w-full">
                    {eHand.map(c => (
                      <div key={c.instanceId} className="w-24 h-36 bg-stone-800 border-2 border-stone-700 rounded-xl flex items-center justify-center shadow-inner">
                        <span className="text-stone-600 text-3xl font-bold">?</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {phase === 'GAMEOVER' && (
              <div className="flex-1 flex flex-col items-center justify-center space-y-6">
                <h2 className="text-4xl font-bold text-amber-500">
                  {(() => {
                    const pLost = pHP <= 0 || pHand.length === 0;
                    const eLost = eHP <= 0 || eHand.length === 0;
                    if (pLost && eLost) return '平局！';
                    if (eLost) return '你赢了！';
                    if (pLost) return '你输了！';
                    return pHP > eHP ? '你赢了！' : pHP < eHP ? '你输了！' : '平局！';
                  })()}
                </h2>
                <button onClick={onExit} className="px-6 py-3 bg-stone-700 hover:bg-stone-600 rounded-lg">
                  返回主菜单
                </button>
              </div>
            )}

          </div>
        </div>

      </div>

      {/* Modals are removed or moved */}

      {/* Tracker Modal */}
      <AnimatePresence>
        {showTracker && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowTracker(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-stone-800 rounded-2xl border border-stone-700 flex flex-col overflow-hidden max-h-[80vh]"
            >
              <div className="p-4 bg-stone-900 border-b border-stone-700 flex justify-between items-center font-bold text-stone-300">
                <div className="flex items-center gap-2"><History className="w-5 h-5" /> 记牌器 & 对战记录</div>
                <div className="flex items-center gap-2">
                  <button onClick={exportLog} className="flex items-center gap-1 px-3 py-1 bg-stone-800 hover:bg-stone-700 rounded-md text-stone-300 text-xs transition-colors">
                    <Download className="w-3 h-3" /> 导出
                  </button>
                  <button onClick={() => setShowTracker(false)} className="p-1 hover:bg-stone-800 rounded-full text-stone-400">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <div className="p-4 border-b border-stone-700 bg-stone-800/80 text-xs space-y-2">
                <div>
                  <span className="text-blue-400 font-bold">你的手牌：</span>
                  <span className="text-stone-300">{pHand.map(c => `${c.name}(${c.currentValue})`).join(', ') || '无'}</span>
                </div>
                <div>
                  <span className="text-red-400 font-bold">敌方手牌：</span>
                  <span className="text-stone-300">{eHand.map(c => `${c.name}(${c.currentValue})`).join(', ') || '无'}</span>
                </div>
                <div>
                  <span className="text-blue-400 font-bold">你的弃牌：</span>
                  <span className="text-stone-500">{pDiscard.map(c => `${c.name}(${c.currentValue})`).join(', ') || '无'}</span>
                </div>
                <div>
                  <span className="text-red-400 font-bold">敌方弃牌：</span>
                  <span className="text-stone-500">{eDiscard.map(c => `${c.name}(${c.currentValue})`).join(', ') || '无'}</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {history.length === 0 ? (
                  <div className="text-stone-500 text-center mt-10">暂无记录</div>
                ) : (
                  history.map(record => (
                    <div key={record.turn} className="bg-stone-900 p-3 rounded-lg border border-stone-700 text-sm">
                      <div className="text-stone-500 mb-2 font-bold flex justify-between">
                        <span>第 {record.turn} 回合</span>
                        <span className="text-stone-400">{record.result}</span>
                      </div>
                      <div className="flex justify-between items-center mb-2 bg-stone-800 p-2 rounded">
                        <div className="text-blue-400 font-bold">{record.pCard.name}({record.pCard.currentValue})</div>
                        <div className="text-stone-500 italic">VS</div>
                        <div className="text-red-400 font-bold">{record.eCard.name}({record.eCard.currentValue})</div>
                      </div>
                      <div className="flex justify-between items-center text-xs text-stone-500 mb-2 px-1">
                        <span>你: <Heart className="w-3 h-3 inline text-red-500/70" /> {record.pHP}</span>
                        <span>敌: <Heart className="w-3 h-3 inline text-blue-500/70" /> {record.eHP}</span>
                      </div>
                      {record.events.length > 0 && (
                        <div className="text-stone-400 text-xs space-y-1 mt-2">
                          {record.events.map((e, i) => (
                            <div key={i} className="flex items-start gap-1">
                              <span className="text-stone-600 mt-[2px]">▸</span>
                              <span>{e}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MiniCard({ card }: { card: Card }) {
  return (
    <div className="w-24 h-36 bg-stone-900 border border-stone-600 rounded-xl p-2 flex flex-col shadow-lg relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-red-500" />
      <div className="flex justify-between items-start mb-1">
        <span className="font-bold text-xs text-stone-200 truncate">{card.name}</span>
        <span className="w-5 h-5 rounded-full bg-stone-700 flex items-center justify-center text-[10px] font-bold text-amber-400 border border-stone-600">
          {card.currentValue}
        </span>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full bg-stone-800 flex items-center justify-center text-lg">
          🐉
        </div>
      </div>
      <div className="h-10 text-[8px] leading-tight text-stone-400 overflow-hidden line-clamp-3">
        {card.description}
      </div>
    </div>
  );
}
