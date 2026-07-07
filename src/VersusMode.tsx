import React, { useState, useEffect, useRef } from 'react';
import { Card } from './types';
import { ALIEN_BEASTS } from './cards';
import { cloneCard } from './utils';
import { Shield, Sword, Heart, History, ArrowLeft, Loader2, X, Download, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getAiDraftChoice, getAiChoice } from './aiLogic';

export interface CardStats {
  id: string;
  name: string;
  draftRound: number;
  owner: 'P1' | 'P2';
  playCount: number;
  winCount: number;
  survivalRounds: number;
  damageDealt: number;
  healingDone: number;
  wasPlayed: boolean;
}

export interface TurnRecord {
  round: number;
  p1Card: Card;
  p2Card: Card;
  p1DamageTaken: number;
  p2DamageTaken: number;
  p1Healing: number;
  p2Healing: number;
  events: string[];
}

export interface GameReport {
  timestamp: string;
  p1Type: PlayerType;
  p2Type: PlayerType;
  winner: 'P1' | 'P2' | 'DRAW' | null;
  p1Stats: Record<string, CardStats>;
  p2Stats: Record<string, CardStats>;
  turns: TurnRecord[];
  errors?: string[];
}

type VersusPhase = 'SETUP' | 'DRAFT' | 'BATTLE' | 'GAMEOVER';
type PlayerType = 'HUMAN' | 'AI_LOCAL' | 'AI_GEMINI';

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
  const [phase, setPhase] = useState<VersusPhase>('SETUP');
  const [pType, setPType] = useState<PlayerType>('HUMAN');
  const [eType, setEType] = useState<PlayerType>('AI_GEMINI');
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
  const [pPoison, setPPoison] = useState(0);
  const [ePoison, setEPoison] = useState(0);
  const [pDisabledCardId, setPDisabledCardId] = useState<string | null>(null);
  const [eDisabledCardId, setEDisabledCardId] = useState<string | null>(null);
  const [targetSelection, setTargetSelection] = useState<{
    sourceCard: Card;
    validTargets: string[];
    message: string;
    onSelect: (id: string) => void;
  } | null>(null);

  const gameReportRef = useRef<GameReport>({
    timestamp: new Date().toISOString(),
    p1Type: 'HUMAN',
    p2Type: 'AI_GEMINI',
    winner: null,
    p1Stats: {},
    p2Stats: {},
    turns: []
  });

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
    if (phase === 'DRAFT' && pool.length > 0 && !isAiThinking) {
      const currentType = draftTurn === 'PLAYER' ? pType : eType;
      if (currentType === 'HUMAN') return;

      const doAiDraft = async () => {
        setIsAiThinking(true);
        
        const myHand = draftTurn === 'PLAYER' ? pHand : eHand;
        const oppHand = draftTurn === 'PLAYER' ? eHand : pHand;
        
        const bestCard = await getAiDraftChoice(pool, myHand, oppHand, currentType as 'AI_LOCAL' | 'AI_GEMINI', gameReportRef.current);
        
        if (draftedCardsRef.current.has(bestCard.instanceId)) {
          setIsAiThinking(false);
          return;
        }
        draftedCardsRef.current.add(bestCard.instanceId);

        if (draftTurn === 'PLAYER') {
          setPHand(prev => [...prev, bestCard]);
          gameReportRef.current.p1Stats[bestCard.instanceId] = {
            id: bestCard.id, name: bestCard.name, draftRound: 12 - draftSequence.length + 1,
            owner: 'P1', playCount: 0, winCount: 0, survivalRounds: 0, damageDealt: 0, healingDone: 0, wasPlayed: false
          };
        } else {
          setEHand(prev => [...prev, bestCard]);
          gameReportRef.current.p2Stats[bestCard.instanceId] = {
            id: bestCard.id, name: bestCard.name, draftRound: 12 - draftSequence.length + 1,
            owner: 'P2', playCount: 0, winCount: 0, survivalRounds: 0, damageDealt: 0, healingDone: 0, wasPlayed: false
          };
        }
        
        const newPool = pool.filter(c => c.instanceId !== bestCard.instanceId);
        setPool(newPool);

        let newSeq = [...draftSequence].slice(1);

        if (bestCard.id === 'biyi') {
          const nextIdx = newSeq.indexOf(draftTurn === 'PLAYER' ? 'PLAYER' : 'ENEMY');
          if (nextIdx !== -1) {
            newSeq.splice(nextIdx, 1);
          }
        }

        setDraftSequence(newSeq);

        if (newPool.length === 0 || newSeq.length === 0) {
          setPhase('BATTLE');
        }
        setIsAiThinking(false);
      };
      
      doAiDraft();
    }
  }, [draftTurn, phase, pool, eHand, pHand, isAiThinking, draftSequence, pType, eType]);

  const handleDraft = (card: Card) => {
    if (draftTurn !== 'PLAYER' || isAiThinking || isProcessingRef.current) return;
    
    if (draftedCardsRef.current.has(card.instanceId)) return;
    draftedCardsRef.current.add(card.instanceId);

    isProcessingRef.current = true;
    
    setPHand(prev => [...prev, card]);
    gameReportRef.current.p1Stats[card.instanceId] = {
      id: card.id, name: card.name, draftRound: 12 - draftSequence.length + 1,
      owner: 'P1', playCount: 0, winCount: 0, survivalRounds: 0, damageDealt: 0, healingDone: 0, wasPlayed: false
    };
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

  // AI Battle Logic
  useEffect(() => {
    if (phase === 'BATTLE' && pType !== 'HUMAN' && !isAiThinking && !revealState && !isProcessingRef.current) {
      resolvePlayCard(null, null, null);
    }
  }, [phase, pType, isAiThinking, revealState, pHand, eHand]);

  // Download report on GAMEOVER
  useEffect(() => {
    if (phase === 'GAMEOVER') {
      const p1FinalHP = pHP;
      const p2FinalHP = eHP;
      
      if (p1FinalHP <= 0 && p2FinalHP <= 0) gameReportRef.current.winner = 'DRAW';
      else if (p1FinalHP <= 0) gameReportRef.current.winner = 'P2';
      else if (p2FinalHP <= 0) gameReportRef.current.winner = 'P1';
      else if (pHand.length === 0 || eHand.length === 0) {
        if (p1FinalHP > p2FinalHP) gameReportRef.current.winner = 'P1';
        else if (p2FinalHP > p1FinalHP) gameReportRef.current.winner = 'P2';
        else gameReportRef.current.winner = 'DRAW';
      }

      const reportJson = JSON.stringify(gameReportRef.current, null, 2);
      const blob = new Blob([reportJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shanhai-report-${new Date().getTime()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [phase]);

  const playCard = (pCard: Card) => {
    if (phase !== 'BATTLE' || isAiThinking || revealState || baizePendingCard || jingweiPendingCard || isProcessingRef.current) return;
    if (pCard.instanceId === pDisabledCardId) return;
    
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

  const resolvePlayCard = async (pCard: Card | null = null, baizeGuess: 'GT5' | 'LTE5' | null = null, jingweiTarget: Card | null = null) => {
    if (phase !== 'BATTLE' || isAiThinking || revealState || isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsAiThinking(true);

    try {
      let finalPCard = pCard;
      let finalBaizeGuess = baizeGuess;
      let finalJingweiTarget = jingweiTarget;

      if (!finalPCard) {
        const pChoice = await getAiChoice(pHand, eHand, pHP, eHP, pDiscard, pDisabledCardId, pType as 'AI_LOCAL' | 'AI_GEMINI', gameReportRef.current);
        finalPCard = pChoice.card;
        finalBaizeGuess = pChoice.baizeGuess;
        finalJingweiTarget = pChoice.jingweiTarget;
      }

      const eChoice = await getAiChoice(eHand, pHand, eHP, pHP, eDiscard, eDisabledCardId, eType as 'AI_LOCAL' | 'AI_GEMINI', gameReportRef.current);
      let eCard = eChoice.card;
      let eBaizeGuess = eChoice.baizeGuess;
      let eJingweiTarget = eChoice.jingweiTarget;

      setPDisabledCardId(null);
      setEDisabledCardId(null);

      // Remove from hands
      let newPHand = pHand.filter(c => c.instanceId !== finalPCard!.instanceId);
      let newEHand = eHand.filter(c => c.instanceId !== eCard.instanceId);

      let pCardCopy = cloneCard(finalPCard!);
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
    let nextPDisabledCardId: string | null = null;
    let nextEDisabledCardId: string | null = null;

    // Determine Priority
    const pPriority = pCardCopy.currentValue !== eCardCopy.currentValue 
      ? pCardCopy.currentValue < eCardCopy.currentValue 
      : (newPHand.length !== newEHand.length 
        ? newPHand.length < newEHand.length 
        : pHP <= eHP);

    if (pPoison > 0) { pDamage += pPoison; events.push(`你因中毒失去${pPoison}生命`); }
    if (ePoison > 0) { eDamage += ePoison; events.push(`敌方因中毒失去${ePoison}生命`); }

    // Phase 1: 打出时 (On Play)
    const execOnPlayP = () => {
      if (pCardCopy.id === 'qilin') { eDisableEffects = true; events.push(`你的【麒麟】发动能力，封印了敌方异兽能力！`); }
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
    };
    const execOnPlayE = () => {
      if (eCardCopy.id === 'qilin') { pDisableEffects = true; events.push(`敌方的【麒麟】发动能力，封印了你的异兽能力！`); }
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
    };
    if (pPriority) { execOnPlayP(); execOnPlayE(); } else { execOnPlayE(); execOnPlayP(); }

    // Phase 2: 展示前 (Pre-reveal modifications)
    const execPreRevealP = async () => {
      if (!pDisableEffects) {
        if (pCardCopy.id === 'changyou') { pCardCopy.currentValue = eCardCopy.currentValue; events.push(`你的【长右】发动能力，点数变为敌方点数(${eCardCopy.currentValue})`); }
        if (pCardCopy.id === 'bian') { pCardCopy.currentValue += 1; events.push(`你的【狴犴】发动能力，点数+1`); }
        if (pCardCopy.id === 'bibi') {
          const validTargets = [...newPHand, ...newEHand].filter(c => c.currentValue < c.baseValue);
          if (validTargets.length > 0) {
            let targetId = '';
            if (pType === 'HUMAN') {
              targetId = await new Promise<string>((resolve) => {
                setTargetSelection({
                  sourceCard: pCardCopy,
                  validTargets: validTargets.map(c => c.instanceId),
                  message: `【獙獙】触发能力，请选择目标使其恢复初始点数`,
                  onSelect: (id) => {
                    setTargetSelection(null);
                    resolve(id);
                  }
                });
              });
            } else {
              const bestTarget = validTargets.reduce((best, c) => (c.baseValue - c.currentValue > best.baseValue - best.currentValue) ? c : best, validTargets[0]);
              targetId = bestTarget.instanceId;
            }
            const target = [...newPHand, ...newEHand].find(c => c.instanceId === targetId);
            if (target) {
              target.currentValue = target.baseValue;
              events.push(`你的【獙獙】发动能力，使【${target.name}】恢复为初始点数`);
            }
          }
        }
        if (pCardCopy.id === 'dijiang') { pCardCopy.currentValue = Math.floor(Math.random() * 9) + 1; events.push(`你的【帝江】发动能力，点数随机变为${pCardCopy.currentValue}`); }
        if (pCardCopy.id === 'kuafu') { pDamage += 1; events.push(`你的【夸父】发动能力，你失去1生命`); }
        if (pCardCopy.id === 'baize') {
          if (finalBaizeGuess === 'GT5') {
            if (eCardCopy.currentValue > 5) { pCardCopy.currentValue += 3; events.push(`你的【白泽】猜测成功(敌方>5)，点数+3`); }
            else { pCardCopy.currentValue -= 1; events.push(`你的【白泽】猜测失败(敌方<=5)，点数-1`); }
          } else if (finalBaizeGuess === 'LTE5') {
            if (eCardCopy.currentValue <= 5) { pCardCopy.currentValue += 3; events.push(`你的【白泽】猜测成功(敌方<=5)，点数+3`); }
            else { pCardCopy.currentValue -= 1; events.push(`你的【白泽】猜测失败(敌方>5)，点数-1`); }
          }
        }
      }
    };
    const execPreRevealE = async () => {
      if (!eDisableEffects) {
        if (eCardCopy.id === 'changyou') { eCardCopy.currentValue = pCardCopy.currentValue; events.push(`敌方的【长右】发动能力，点数变为你的点数(${pCardCopy.currentValue})`); }
        if (eCardCopy.id === 'bian') { eCardCopy.currentValue += 1; events.push(`敌方的【狴犴】发动能力，点数+1`); }
        if (eCardCopy.id === 'bibi') {
          const validTargets = [...newEHand, ...newPHand].filter(c => c.currentValue < c.baseValue);
          if (validTargets.length > 0) {
            let targetId = '';
            if (eType === 'HUMAN') {
              targetId = await new Promise<string>((resolve) => {
                setTargetSelection({
                  sourceCard: eCardCopy,
                  validTargets: validTargets.map(c => c.instanceId),
                  message: `【獙獙】触发能力，请选择目标使其恢复初始点数`,
                  onSelect: (id) => {
                    setTargetSelection(null);
                    resolve(id);
                  }
                });
              });
            } else {
              const bestTarget = validTargets.reduce((best, c) => (c.baseValue - c.currentValue > best.baseValue - best.currentValue) ? c : best, validTargets[0]);
              targetId = bestTarget.instanceId;
            }
            const target = [...newPHand, ...newEHand].find(c => c.instanceId === targetId);
            if (target) {
              target.currentValue = target.baseValue;
              events.push(`敌方的【獙獙】发动能力，使【${target.name}】恢复为初始点数`);
            }
          }
        }
        if (eCardCopy.id === 'dijiang') { eCardCopy.currentValue = Math.floor(Math.random() * 9) + 1; events.push(`敌方的【帝江】发动能力，点数随机变为${eCardCopy.currentValue}`); }
        if (eCardCopy.id === 'kuafu') { eDamage += 1; events.push(`敌方的【夸父】发动能力，敌方失去1生命`); }
        if (eCardCopy.id === 'baize') {
          if (eBaizeGuess === 'GT5') {
            if (pCardCopy.currentValue > 5) { eCardCopy.currentValue += 3; events.push(`敌方的【白泽】猜测成功(你>5)，点数+3`); }
            else { eCardCopy.currentValue -= 1; events.push(`敌方的【白泽】猜测失败(你<=5)，点数-1`); }
          } else {
            if (pCardCopy.currentValue <= 5) { eCardCopy.currentValue += 3; events.push(`敌方的【白泽】猜测成功(你<=5)，点数+3`); }
            else { eCardCopy.currentValue -= 1; events.push(`敌方的【白泽】猜测失败(你>5)，点数-1`); }
          }
        }
      }
    };
    if (pPriority) { await execPreRevealP(); await execPreRevealE(); } else { await execPreRevealE(); await execPreRevealP(); }

    // Phase 3: 检测反噬 (Anti-backlash)
    const execBacklashP = () => { if (pCardCopy.currentValue >= 4) { pDamage += 1; events.push(`你的异兽点数≥4，你受到1点反噬伤害`); } };
    const execBacklashE = () => { if (eCardCopy.currentValue >= 4) { eDamage += 1; events.push(`敌方异兽点数≥4，敌方受到1点反噬伤害`); } };
    if (pPriority) { execBacklashP(); execBacklashE(); } else { execBacklashE(); execBacklashP(); }

    // Capture history state before winner reduction
    const historyPCard = cloneCard(pCardCopy);
    const historyECard = cloneCard(eCardCopy);

    // Phase 4: 确定胜负 (Win Check)
    let resultText = '';
    const execWinCheckP = () => {
      if (!pDisableEffects && pCardCopy.id === 'chiyou' && pCardCopy.currentValue > eCardCopy.currentValue) {
        pCardDies = true; pCardReturns = false; eDamage += 2; events.push(`你的【蚩尤】发动能力，胜利后额外造成2伤害并死亡`);
      }
      if (!pDisableEffects && pCardCopy.id === 'yu' && eCardCopy.currentValue > 5) {
        if (pCardCopy.currentValue > eCardCopy.currentValue) {
          events.push(`你的【蜮】发动能力，因敌方大于5点，敌方异兽直接死亡，你的蜮回手`);
        } else if (pCardCopy.currentValue < eCardCopy.currentValue) {
          eCardDies = true; eCardReturns = false; pCardDies = false; pCardReturns = true; events.push(`你的【蜮】发动能力，因敌方大于5点，敌方异兽直接死亡，你的蜮回手`);
        } else {
          eCardDies = true; pCardDies = false; pCardReturns = true; events.push(`你的【蜮】发动能力，因敌方大于5点，敌方异兽直接死亡，你的蜮回手`);
        }
      }
    };
    const execWinCheckE = () => {
      if (!eDisableEffects && eCardCopy.id === 'chiyou' && eCardCopy.currentValue > pCardCopy.currentValue) {
        eCardDies = true; eCardReturns = false; pDamage += 2; events.push(`敌方的【蚩尤】发动能力，胜利后额外造成2伤害并死亡`);
      }
      if (!eDisableEffects && eCardCopy.id === 'yu' && pCardCopy.currentValue > 5) {
        if (eCardCopy.currentValue > pCardCopy.currentValue) {
          events.push(`敌方的【蜮】发动能力，因你大于5点，你的异兽直接死亡，敌方蜮回手`);
        } else if (eCardCopy.currentValue < pCardCopy.currentValue) {
          pCardDies = true; pCardReturns = false; eCardDies = false; eCardReturns = true; events.push(`敌方的【蜮】发动能力，因你大于5点，你的异兽直接死亡，敌方蜮回手`);
        } else {
          pCardDies = true; eCardDies = false; eCardReturns = true; events.push(`敌方的【蜮】发动能力，因你大于5点，你的异兽直接死亡，敌方蜮回手`);
        }
      }
    };

    if (pCardCopy.currentValue > eCardCopy.currentValue) {
      eDamage += 2;
      eCardDies = true;
      pCardReturns = true;
      resultText = `你赢了！`;
      if (pPriority) { execWinCheckP(); execWinCheckE(); } else { execWinCheckE(); execWinCheckP(); }
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
      if (pPriority) { execWinCheckP(); execWinCheckE(); } else { execWinCheckE(); execWinCheckP(); }
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
      if (pPriority) { execWinCheckP(); execWinCheckE(); } else { execWinCheckE(); execWinCheckP(); }
    }

    // Death/Return effects
    const handleDeathOrReturn = async (card: Card, isPlayer: boolean, isDeath: boolean, isReturn: boolean, disabled: boolean) => {
      const prefix = isPlayer ? '你的' : '敌方的';
      if (disabled) return;
      if (isDeath) {
        if (card.id === 'bifang') {
          events.push(`${prefix}【毕方】死亡，双方手中所有异兽点数永久-1`);
          
          const processHand = (hand: Card[], discard: Card[], isPlayerHand: boolean) => {
            let remaining: Card[] = [];
            for (let c of hand) {
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
          if (isPlayer) {
            if (newEHand.length > 0) {
              let targetId = '';
              if (pType === 'HUMAN') {
                targetId = await new Promise<string>((resolve) => {
                  setTargetSelection({
                    sourceCard: card,
                    validTargets: newEHand.map(c => c.instanceId),
                    message: `【乘黄】触发能力，请选择敌方目标使其下回合无法打出`,
                    onSelect: (id) => {
                      setTargetSelection(null);
                      resolve(id);
                    }
                  });
                });
              } else {
                const target = newEHand.reduce((max, c) => c.currentValue > max.currentValue ? c : max, newEHand[0]);
                targetId = target.instanceId;
              }
              const target = newEHand.find(c => c.instanceId === targetId);
              if (target) {
                nextEDisabledCardId = target.instanceId;
                events.push(`${prefix}【乘黄】死亡，使敌方下回合无法打出【${target.name}】`);
              }
            } else {
              events.push(`${prefix}【乘黄】死亡，但敌方没有手牌`);
            }
          } else {
            if (newPHand.length > 0) {
              let targetId = '';
              if (eType === 'HUMAN') {
                targetId = await new Promise<string>((resolve) => {
                  setTargetSelection({
                    sourceCard: card,
                    validTargets: newPHand.map(c => c.instanceId),
                    message: `【乘黄】触发能力，请选择敌方目标使其下回合无法打出`,
                    onSelect: (id) => {
                      setTargetSelection(null);
                      resolve(id);
                    }
                  });
                });
              } else {
                const target = newPHand.reduce((max, c) => c.currentValue > max.currentValue ? c : max, newPHand[0]);
                targetId = target.instanceId;
              }
              const target = newPHand.find(c => c.instanceId === targetId);
              if (target) {
                nextPDisabledCardId = target.instanceId;
                events.push(`${prefix}【乘黄】死亡，使你下回合无法打出【${target.name}】`);
              }
            } else {
              events.push(`${prefix}【乘黄】死亡，但你没有手牌`);
            }
          }
        }
        if (card.id === 'boyi') {
          if (isPlayer) pNoDamage = true; else eNoDamage = true;
          events.push(`${prefix}【猼訑】死亡，本回合免受伤害`);
        }
        if (card.id === 'fei') {
          pDamage += 2; eDamage += 2;
          events.push(`${prefix}【蜚】死亡，双方各失去2生命`);
        }
        if (card.id === 'jiuweihu') {
          if (isPlayer) { pCardDies = false; pCardReturns = true; pCardCopy.currentValue -= 4; }
          else { eCardDies = false; eCardReturns = true; eCardCopy.currentValue -= 4; }
          events.push(`${prefix}【九尾狐】死亡，回手并-4点数`);
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
        if (card.id === 'taotie') {
          if (isPlayer) { eCardRemoved = true; }
          else { pCardRemoved = true; }
          events.push(`${prefix}【饕餮】死亡，将对手异兽移出游戏`);
        }
        if (card.id === 'fenghuang') {
          if (isPlayer) pHeal += 2; else eHeal += 2;
          events.push(`${prefix}【凤凰】死亡，恢复2生命`);
        }
      }
      if (isReturn) {
        if (card.id === 'fenghuang') {
          if (isPlayer) pHeal += 2; else eHeal += 2;
          events.push(`${prefix}【凤凰】回手，恢复2生命`);
        }
        if (card.id === 'yongyan') {
          if (isPlayer) {
            setEPoison(prev => prev + 1);
            events.push(`${prefix}【永焰】回手，敌方每回合将失去1生命`);
          } else {
            setPPoison(prev => prev + 1);
            events.push(`${prefix}【永焰】回手，你每回合将失去1生命`);
          }
        }
        if (card.id === 'zhujian') {
          if (isPlayer && newEHand.length > 0) {
            const target = newEHand[Math.floor(Math.random() * newEHand.length)];
            target.currentValue -= 2;
            events.push(`你的【诸犍】回手，查看到敌方随机牌是【${target.name}】，使其点数-2`);
            if (target.currentValue <= 0) {
              newEHand = newEHand.filter(c => c.instanceId !== target.instanceId);
              currentEDiscard.push(target);
              events.push(`敌方的【${target.name}】点数降至0而死亡`);
            }
          } else if (!isPlayer && newPHand.length > 0) {
            const target = newPHand[Math.floor(Math.random() * newPHand.length)];
            target.currentValue -= 2;
            events.push(`敌方的【诸犍】回手，查看到你随机牌是【${target.name}】，使其点数-2`);
            if (target.currentValue <= 0) {
              newPHand = newPHand.filter(c => c.instanceId !== target.instanceId);
              currentPDiscard.push(target);
              events.push(`你的【${target.name}】点数降至0而死亡`);
            }
          }
        }
      }
    };

    await handleDeathOrReturn(pCardCopy, true, pCardDies, pCardReturns, pDisableEffects);
    await handleDeathOrReturn(eCardCopy, false, eCardDies, eCardReturns, eDisableEffects);

    if (pNoDamage) pDamage = 0;
    if (eNoDamage) eDamage = 0;

    pCardCopy.playedOnce = true;
    eCardCopy.playedOnce = true;

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

    // Update Game Report Stats
    const p1Stat = gameReportRef.current.p1Stats[finalPCard!.instanceId];
    if (p1Stat) {
      p1Stat.playCount++;
      p1Stat.wasPlayed = true;
      if (pCardReturns) p1Stat.survivalRounds++;
      if (eDamage > 0) p1Stat.damageDealt += eDamage;
      if (pHeal > 0) p1Stat.healingDone += pHeal;
      if (resultText === '你赢了！') p1Stat.winCount++;
    }

    const p2Stat = gameReportRef.current.p2Stats[eCard.instanceId];
    if (p2Stat) {
      p2Stat.playCount++;
      p2Stat.wasPlayed = true;
      if (eCardReturns) p2Stat.survivalRounds++;
      if (pDamage > 0) p2Stat.damageDealt += pDamage;
      if (eHeal > 0) p2Stat.healingDone += eHeal;
      if (resultText === '你输了！') p2Stat.winCount++;
    }

    gameReportRef.current.turns.push({
      round: turnCount,
      p1Card: cloneCard(historyPCard),
      p2Card: cloneCard(historyECard),
      p1DamageTaken: pDamage,
      p2DamageTaken: eDamage,
      p1Healing: pHeal,
      p2Healing: eHeal,
      events: [...events]
    });

    setRevealState({ pCard: historyPCard, eCard: historyECard, result: resultText, events });
    setPHand(pHand.filter(c => c.instanceId !== finalPCard!.instanceId));
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
      setPDisabledCardId(nextPDisabledCardId);
      setEDisabledCardId(nextEDisabledCardId);
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
            <h1 className="text-2xl font-bold tracking-widest text-purple-500">公平模式</h1>
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
            
            {phase === 'SETUP' && (
              <div className="flex-1 flex flex-col items-center justify-center space-y-8">
                <h2 className="text-3xl font-bold text-stone-300 mb-8">选择公平模式</h2>
                
                <div className="flex gap-12 items-center">
                  <div className="flex flex-col items-center gap-4 bg-stone-800 p-6 rounded-2xl border border-stone-700 w-64">
                    <div className="text-xl font-bold text-blue-400">玩家 1</div>
                    <select 
                      value={pType} 
                      onChange={(e) => setPType(e.target.value as PlayerType)}
                      className="w-full bg-stone-900 border border-stone-600 rounded-lg p-3 text-stone-200 focus:outline-none focus:border-purple-500"
                    >
                      <option value="HUMAN">人类玩家</option>
                      <option value="AI_LOCAL">本地 AI (快速)</option>
                      <option value="AI_GEMINI">云端 AI (智能)</option>
                    </select>
                  </div>

                  <div className="text-2xl font-bold text-stone-500 italic">VS</div>

                  <div className="flex flex-col items-center gap-4 bg-stone-800 p-6 rounded-2xl border border-stone-700 w-64">
                    <div className="text-xl font-bold text-red-400">玩家 2</div>
                    <select 
                      value={eType} 
                      onChange={(e) => setEType(e.target.value as PlayerType)}
                      className="w-full bg-stone-900 border border-stone-600 rounded-lg p-3 text-stone-200 focus:outline-none focus:border-purple-500"
                    >
                      <option value="HUMAN">人类玩家</option>
                      <option value="AI_LOCAL">本地 AI (快速)</option>
                      <option value="AI_GEMINI">云端 AI (智能)</option>
                    </select>
                  </div>
                </div>

                <button 
                  onClick={() => setPhase('DRAFT')}
                  className="mt-12 px-12 py-4 bg-gradient-to-r from-purple-600 to-red-600 hover:from-purple-500 hover:to-red-500 rounded-xl font-bold text-xl shadow-lg shadow-purple-900/50 transition-all transform hover:scale-105"
                >
                  开始选牌
                </button>
              </div>
            )}

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
                          whileHover={
                            targetSelection?.validTargets.includes(card.instanceId) ? { scale: 1.05, y: -5 } :
                            (targetSelection || card.instanceId === pDisabledCardId) ? {} : { scale: 1.05, y: -5 }
                          }
                          onClick={() => {
                            if (targetSelection) {
                              if (targetSelection.validTargets.includes(card.instanceId)) {
                                targetSelection.onSelect(card.instanceId);
                              }
                            } else {
                              playCard(card);
                            }
                          }}
                          className={`
                            ${targetSelection ? (targetSelection.validTargets.includes(card.instanceId) ? 'cursor-pointer ring-4 ring-amber-500 rounded-xl' : 'opacity-50 grayscale cursor-not-allowed') : ''}
                            ${!targetSelection && card.instanceId === pDisabledCardId ? 'opacity-50 grayscale cursor-not-allowed' : ''}
                            ${!targetSelection && card.instanceId !== pDisabledCardId ? 'cursor-pointer' : ''}
                          `}
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
                          <p className="text-stone-400 text-xs mt-1">（猜中点数+3，猜错点数-1）</p>
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
                    ) : targetSelection ? (
                      <motion.div
                        key="target"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="flex flex-col items-center gap-4 w-full"
                      >
                        <div className="text-center">
                          <h3 className="text-xl font-bold text-amber-500 mb-2">选择目标</h3>
                          <p className="text-stone-300 text-sm">{targetSelection.message}</p>
                        </div>
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
                    <AnimatePresence>
                      {eHand.map(card => (
                        <motion.div
                          key={card.instanceId}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          whileHover={
                            targetSelection?.validTargets.includes(card.instanceId) ? { scale: 1.05, y: -5 } :
                            (targetSelection || card.instanceId === eDisabledCardId) ? {} : { scale: 1.05, y: -5 }
                          }
                          onClick={() => {
                            if (targetSelection && targetSelection.validTargets.includes(card.instanceId)) {
                              targetSelection.onSelect(card.instanceId);
                            }
                          }}
                          className={`
                            ${targetSelection ? (targetSelection.validTargets.includes(card.instanceId) ? 'cursor-pointer ring-4 ring-amber-500 rounded-xl' : 'opacity-50 grayscale cursor-not-allowed') : ''}
                            ${!targetSelection && card.instanceId === eDisabledCardId ? 'opacity-50 grayscale cursor-not-allowed' : ''}
                          `}
                        >
                          <MiniCard card={card} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
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
