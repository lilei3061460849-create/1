/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Card, Player, Enemy } from './types';
import { ALL_CARDS, ALIEN_BEASTS, BASIC_BEASTS } from './cards';
import { cloneCard, getMinCard, getMaxCard } from './utils';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Sword, Heart, Skull, RefreshCw, Smartphone, Maximize, Minimize } from 'lucide-react';
import VersusMode from './VersusMode';

type Phase = 'MENU' | 'ENCOUNTER' | 'BATTLE' | 'GUESS' | 'REVEAL' | 'RESULT' | 'GAMEOVER' | 'VICTORY' | 'EVENT' | 'VERSUS';

export default function App() {
  const [phase, setPhase] = useState<Phase>('MENU');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [player, setPlayer] = useState<Player>({
    hp: 12, maxHp: 12, hand: [], discard: [], pool: []
  });
  const [enemy, setEnemy] = useState<Enemy | null>(null);
  const [playerCard, setPlayerCard] = useState<Card | null>(null);
  const [enemyCard, setEnemyCard] = useState<Card | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [baizeGuess, setBaizeGuess] = useState<boolean | null>(null);
  const [encounterCount, setEncounterCount] = useState(0);
  const [currentEvent, setCurrentEvent] = useState<{title: string, description: string, action: () => void, actionText: string} | null>(null);

  const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const startGame = () => {
    const initialHand = BASIC_BEASTS.map(cloneCard);
    setPlayer({
      hp: 12, maxHp: 12, hand: initialHand, discard: [], pool: initialHand
    });
    setEncounterCount(0);
    setLogs(['游戏开始！你拥有四只基础魂兽。']);
    startEncounter(initialHand);
  };

  const startEncounter = (currentPool: Card[]) => {
    // Pick a random alien beast not in pool
    let available = ALIEN_BEASTS.filter(a => !currentPool.some(p => p.id === a.id));
    if (available.length === 0) {
      setPhase('VICTORY');
      return;
    }
    
    let filtered = available;
    if (encounterCount === 0) filtered = available.filter(a => a.baseValue <= 3);
    else if (encounterCount === 1) filtered = available.filter(a => a.baseValue <= 4);
    else if (encounterCount === 2) filtered = available.filter(a => a.baseValue <= 5);
    else if (encounterCount === 3) filtered = available.filter(a => a.baseValue <= 6);
    
    if (filtered.length > 0) {
      available = filtered;
    }

    const beast = cloneCard(available[Math.floor(Math.random() * available.length)]);
    setEnemy({
      name: beast.name,
      hp: beast.baseValue,
      maxHp: beast.baseValue,
      hand: [beast],
      discard: []
    });
    setPlayerCard(null);
    setEnemyCard(null);
    setBaizeGuess(null);
    setPhase('ENCOUNTER');
    addLog(`遭遇野生异兽：${beast.name} (HP: ${beast.baseValue})`);
  };

  const selectCard = (card: Card) => {
    if (phase !== 'BATTLE') return;
    setPlayerCard(card);
    if (card.id === 'baize') {
      setPhase('GUESS');
    } else {
      resolveTurn(card, null);
    }
  };

  const handleGuess = (guess: boolean) => {
    setBaizeGuess(guess);
    resolveTurn(playerCard!, guess);
  };

  const resolveTurn = (pCard: Card, guess: boolean | null) => {
    if (!enemy) return;
    const eCard = cloneCard(enemy.hand[0]); // Wild beast always plays its only card
    setEnemyCard(eCard);
    setPhase('REVEAL');

    let newPlayer = { ...player };
    let newEnemy = { ...enemy };
    let pCardCopy = cloneCard(pCard);
    let eCardCopy = cloneCard(eCard);

    // Remove played cards from hand
    newPlayer.hand = newPlayer.hand.filter(c => c.id !== pCard.id);
    newEnemy.hand = [];

    let pDamage = 0;
    let eDamage = 0;
    let pHeal = 0;
    let eHeal = 0;
    let pCardDies = false;
    let eCardDies = false;
    let pCardReturns = false;
    let eCardReturns = false;

    let pEffectsDisabled = eCardCopy.id === 'qilin';
    let eEffectsDisabled = pCardCopy.id === 'qilin';

    if (pEffectsDisabled) addLog(`${eCardCopy.name} 的效果：你的异兽效果被封印！`);
    if (eEffectsDisabled) addLog(`${pCardCopy.name} 的效果：敌方异兽效果被封印！`);

    // onPlay / beforeReveal
    if (!pEffectsDisabled) {
      if (pCardCopy.id === 'zhuyan') {
        addLog(`朱厌效果：所有人弃一张最大点数牌`);
        const pMax = getMaxCard(newPlayer.hand);
        if (pMax) newPlayer.hand = newPlayer.hand.filter(c => c.id !== pMax.id);
        // Enemy has no other cards
      }
      if (pCardCopy.id === 'kuafu') {
        addLog(`夸父效果：你失去1点生命`);
        pDamage += 1;
      }
      if (pCardCopy.id === 'dijiang') {
        pCardCopy.currentValue = Math.floor(Math.random() * 9) + 1;
        addLog(`帝江随机变化点数为 ${pCardCopy.currentValue}`);
      }
      if (pCardCopy.id === 'bian') {
        pCardCopy.currentValue += 1;
        addLog(`狴犴点数+1`);
      }
      if (pCardCopy.id === 'bibi' && !pCardCopy.playedOnce) {
        pCardCopy.currentValue += 2;
        addLog(`獙獙首次打出，点数+2`);
      }
      if (pCardCopy.id === 'baize' && guess !== null) {
        const isHigher = eCardCopy.currentValue > 5;
        if (guess === isHigher) {
          pCardCopy.currentValue += 2;
          addLog(`白泽猜对了！点数+2`);
        } else {
          pCardCopy.currentValue -= 2;
          addLog(`白泽猜错了！点数-2`);
        }
      }
    }

    if (!eEffectsDisabled) {
      if (eCardCopy.id === 'kuafu') eDamage += 1;
      if (eCardCopy.id === 'dijiang') eCardCopy.currentValue = Math.floor(Math.random() * 9) + 1;
      if (eCardCopy.id === 'bian') eCardCopy.currentValue += 1;
      if (eCardCopy.id === 'bibi' && !eCardCopy.playedOnce) eCardCopy.currentValue += 2;
    }

    // onCompare
    if (!pEffectsDisabled && pCardCopy.id === 'changyou') {
      pCardCopy.currentValue = eCardCopy.currentValue;
      addLog(`长右复制了敌方点数：${pCardCopy.currentValue}`);
    }
    if (!eEffectsDisabled && eCardCopy.id === 'changyou') {
      eCardCopy.currentValue = pCardCopy.currentValue;
    }

    // Compare
    let pWins = pCardCopy.currentValue > eCardCopy.currentValue;
    let eWins = eCardCopy.currentValue > pCardCopy.currentValue;
    let draw = pCardCopy.currentValue === eCardCopy.currentValue;

    if (!pEffectsDisabled && pCardCopy.id === 'yu' && eCardCopy.currentValue > 5) {
      addLog(`蜮效果触发：敌方大于5点，直接秒杀！`);
      pWins = true; eWins = false; draw = false;
    }
    if (!eEffectsDisabled && eCardCopy.id === 'yu' && pCardCopy.currentValue > 5) {
      eWins = true; pWins = false; draw = false;
    }

    if (pWins) {
      addLog(`比拼结果：你赢了！`);
      pCardReturns = true;
      eCardDies = true;
      eDamage += 2;
      if (!pEffectsDisabled && pCardCopy.id === 'chiyou') {
        addLog(`蚩尤效果：胜利直接死亡，敌人额外失去2生命`);
        pCardDies = true;
        pCardReturns = false;
        eDamage += 2;
      }
    } else if (eWins) {
      addLog(`比拼结果：你输了！`);
      eCardReturns = true;
      pCardDies = true;
      pDamage += 2;
      if (!eEffectsDisabled && eCardCopy.id === 'chiyou') {
        eCardDies = true;
        eCardReturns = false;
        pDamage += 2;
      }
    } else {
      addLog(`比拼结果：平局！`);
      pCardDies = true;
      eCardDies = true;
      pDamage += 1;
      eDamage += 1;
    }

    // onDeath / onReturn
    let pNoDamage = false;
    let eNoDamage = false;

    const handleDeathOrReturn = (card: Card, isPlayer: boolean, isDeath: boolean, isReturn: boolean) => {
      let disabled = isPlayer ? pEffectsDisabled : eEffectsDisabled;
      if (disabled) return;

      if (isDeath) {
        if (card.id === 'zhen') {
          addLog(`鸩死亡：对手弃一张最小点数牌`);
          if (isPlayer) {
            // enemy has no hand
          } else {
            const min = getMinCard(newPlayer.hand);
            if (min) newPlayer.hand = newPlayer.hand.filter(c => c.id !== min.id);
          }
        }
        if (card.id === 'jingwei') {
          addLog(`精卫死亡：将弃牌区一张牌回手`);
          if (isPlayer && newPlayer.discard.length > 0) {
            newPlayer.hand.push(newPlayer.discard.pop()!);
          }
        }
        if (card.id === 'xiangliu' && card.currentValue !== 9) {
          addLog(`相柳死亡：点数不为9，回手并+2点数`);
          if (isPlayer) { pCardDies = false; pCardReturns = true; pCardCopy.currentValue += 2; }
          else { eCardDies = false; eCardReturns = true; eCardCopy.currentValue += 2; }
        }
        if (card.id === 'henggongyu') {
          let oppValue = isPlayer ? eCardCopy.currentValue : pCardCopy.currentValue;
          if (oppValue > 5) {
            addLog(`横公鱼死亡：敌方大于5点，回手`);
            if (isPlayer) { pCardDies = false; pCardReturns = true; }
            else { eCardDies = false; eCardReturns = true; }
          }
        }
        if (card.id === 'chenghuang') {
          addLog(`乘黄死亡：恢复3生命`);
          if (isPlayer) pHeal += 3; else eHeal += 3;
        }
        if (card.id === 'boyi') {
          addLog(`猼訑死亡：本回合不失去生命值`);
          if (isPlayer) pNoDamage = true; else eNoDamage = true;
        }
        if (card.id === 'fei') {
          addLog(`蜚死亡：所有人失去2生命`);
          pDamage += 2; eDamage += 2;
        }
        if (card.id === 'bifang') {
          addLog(`毕方死亡：所有异兽点数永久减1`);
          newPlayer.hand.forEach(c => c.currentValue = Math.max(0, c.currentValue - 1));
          newPlayer.pool.forEach(c => c.currentValue = Math.max(0, c.currentValue - 1));
          newPlayer.hand = newPlayer.hand.filter(c => c.currentValue > 0);
        }
        if (card.id === 'jiuweihu' && card.currentValue !== 1) {
          addLog(`九尾狐死亡：点数不为1，回手并-4点数`);
          if (isPlayer) { pCardDies = false; pCardReturns = true; pCardCopy.currentValue -= 4; }
          else { eCardDies = false; eCardReturns = true; eCardCopy.currentValue -= 4; }
        }
      }

      if (isDeath || isReturn) {
        if (card.id === 'taotie') {
          addLog(`饕餮效果：将敌方异兽移出游戏`);
          // For wild beast, it just dies
        }
        if (card.id === 'fenghuang') {
          addLog(`凤凰效果：恢复1生命值`);
          if (isPlayer) pHeal += 1; else eHeal += 1;
        }
        if (card.id === 'yongyan') {
          addLog(`永焰效果：敌方失去1生命值`);
          if (isPlayer) eDamage += 1; else pDamage += 1;
        }
      }
    };

    handleDeathOrReturn(pCardCopy, true, pCardDies, pCardReturns);
    handleDeathOrReturn(eCardCopy, false, eCardDies, eCardReturns);

    if (pNoDamage) pDamage = 0;
    if (eNoDamage) eDamage = 0;

    pCardCopy.playedOnce = true;
    eCardCopy.playedOnce = true;

    newPlayer.hp = Math.min(newPlayer.maxHp, newPlayer.hp - pDamage + pHeal);
    newEnemy.hp = Math.min(newEnemy.maxHp, newEnemy.hp - eDamage + eHeal);

    if (pCardReturns) newPlayer.hand.push(pCardCopy);
    if (pCardDies) newPlayer.discard.push(pCardCopy);
    
    if (eCardReturns) newEnemy.hand.push(eCardCopy);
    if (eCardDies) newEnemy.discard.push(eCardCopy);

    setPlayer(newPlayer);
    setEnemy(newEnemy);

    setTimeout(() => {
      if (newPlayer.hp <= 0 || newPlayer.hand.length === 0) {
        setPhase('GAMEOVER');
      } else if (newEnemy.hp <= 0) {
        // Win encounter
        addLog(`击败了 ${newEnemy.name}！将其加入异兽池，恢复所有生命。`);
        const newBeast = ALIEN_BEASTS.find(b => b.name === newEnemy.name)!;
        newPlayer.pool.push(cloneCard(newBeast));
        newPlayer.hp = newPlayer.maxHp;
        // Reset hand to pool (up to 4 cards + basic)
        // Actually, player chooses up to 4 beasts. For simplicity, hand is refilled from pool.
        newPlayer.hand = newPlayer.pool.map(cloneCard);
        newPlayer.discard = [];
        setPlayer(newPlayer);
        setEncounterCount(c => c + 1);
        setPhase('RESULT');
      } else {
        // Next turn
        newEnemy.hand = [cloneCard(ALIEN_BEASTS.find(b => b.name === newEnemy.name)!)];
        setEnemy(newEnemy);
        setPhase('BATTLE');
      }
    }, 3000);
  };

  const triggerEvent = () => {
    const events = [
      {
        title: '发现灵泉',
        description: '你发现了一口散发着浓郁灵气的泉水，饮用后恢复了5点生命值。',
        actionText: '饮用泉水',
        action: () => {
          setPlayer(p => ({ ...p, hp: Math.min(p.maxHp, p.hp + 5) }));
          addLog('饮用灵泉，恢复5点生命值。');
          startEncounter(player.pool);
        }
      },
      {
        title: '神秘遗迹',
        description: '你误入了一处上古遗迹，虽然受了些轻伤，但感觉体质得到了增强。',
        actionText: '探索遗迹',
        action: () => {
          setPlayer(p => ({ ...p, hp: p.hp - 2, maxHp: p.maxHp + 2 }));
          addLog('探索遗迹，失去2点生命值，最大生命值+2。');
          startEncounter(player.pool);
        }
      },
      {
        title: '异兽幼崽',
        description: '你发现了一只迷路的异兽幼崽，它似乎愿意跟随你。',
        actionText: '收留幼崽',
        action: () => {
          let newPool = [...player.pool];
          const available = ALIEN_BEASTS.filter(a => !player.pool.some(p => p.id === a.id) && a.baseValue <= 4);
          if (available.length > 0) {
            const beast = cloneCard(available[Math.floor(Math.random() * available.length)]);
            newPool.push(beast);
            setPlayer(p => ({ ...p, pool: newPool }));
            addLog(`收留了幼崽：${beast.name}！`);
          } else {
            addLog(`幼崽似乎找不到了...`);
          }
          startEncounter(newPool);
        }
      }
    ];
    
    const ev = events[Math.floor(Math.random() * events.length)];
    setCurrentEvent(ev);
    setPhase('EVENT');
  };

  const nextEncounter = () => {
    if (Math.random() < 0.3 && encounterCount > 0) {
      triggerEvent();
    } else {
      startEncounter(player.pool);
    }
  };

  const renderContent = () => {
    if (phase === 'VERSUS') {
      return <VersusMode onExit={() => setPhase('MENU')} />;
    }

    return (
      <div className="min-h-screen bg-stone-900 text-stone-100 font-sans p-4 md:p-8 flex flex-col items-center">
      <div className="w-full max-w-7xl flex-1 flex flex-col">
        
        {/* Header */}
        <header className="flex justify-between items-center mb-8 border-b border-stone-700 pb-4">
          <h1 className="text-2xl font-bold tracking-widest text-amber-500">山海异兽录</h1>
          <div className="flex items-center gap-6">
            {phase !== 'MENU' && (
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-1"><Heart className="w-4 h-4 text-red-500" /> {player.hp}/{player.maxHp}</div>
                <div className="flex items-center gap-1"><Sword className="w-4 h-4 text-blue-400" /> 手牌: {player.hand.length}</div>
                <div className="flex items-center gap-1"><Shield className="w-4 h-4 text-stone-400" /> 击败: {encounterCount}</div>
              </div>
            )}
            <button onClick={toggleFullscreen} className="p-2 bg-stone-800 hover:bg-stone-700 rounded-full text-stone-400 transition-colors" title="切换全屏">
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex flex-col relative">
          
          {phase === 'MENU' && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-8">
              <div className="text-center space-y-4">
                <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-amber-400 to-red-600">
                  山海异兽录
                </h2>
                <p className="text-stone-400 max-w-md mx-auto">
                  收集异兽，签订契约。合理出牌，击败强敌。
                </p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={startGame}
                  className="px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl shadow-lg shadow-amber-900/50 transition-all active:scale-95"
                >
                  开始游历
                </button>
                <button 
                  onClick={() => setPhase('VERSUS')}
                  className="px-8 py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg shadow-purple-900/50 transition-all active:scale-95"
                >
                  对战模式
                </button>
              </div>
            </div>
          )}

          {phase === 'EVENT' && currentEvent && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-8">
              <h2 className="text-3xl font-bold text-purple-400">{currentEvent.title}</h2>
              <div className="p-8 bg-stone-800 rounded-2xl border border-stone-700 max-w-md text-center">
                <p className="text-stone-300 text-lg leading-relaxed">{currentEvent.description}</p>
              </div>
              <button 
                onClick={currentEvent.action}
                className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors shadow-lg shadow-purple-900/50"
              >
                {currentEvent.actionText}
              </button>
            </div>
          )}

          {(phase === 'ENCOUNTER' || phase === 'RESULT') && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-8">
              <h2 className="text-3xl font-bold text-amber-500">
                {phase === 'ENCOUNTER' ? '遭遇异兽' : '战斗胜利'}
              </h2>
              {enemy && (
                <div className="p-8 bg-stone-800 rounded-2xl border border-stone-700 flex flex-col items-center gap-4">
                  <div className="w-24 h-24 rounded-full bg-stone-700 flex items-center justify-center text-4xl">
                    🐉
                  </div>
                  <div className="text-center">
                    <h3 className="text-2xl font-bold">{enemy.name}</h3>
                    <p className="text-stone-400">生命值: {enemy.maxHp}</p>
                  </div>
                </div>
              )}
              <button 
                onClick={() => phase === 'ENCOUNTER' ? setPhase('BATTLE') : nextEncounter()}
                className="px-8 py-3 bg-stone-700 hover:bg-stone-600 rounded-lg transition-colors"
              >
                {phase === 'ENCOUNTER' ? '进入战斗' : '继续前行'}
              </button>
            </div>
          )}

          {(phase === 'BATTLE' || phase === 'GUESS' || phase === 'REVEAL') && enemy && (
            <div className="flex-1 flex flex-row items-stretch justify-between gap-6 py-4">
              
              {/* Player Area (Left) */}
              <div className="w-1/3 flex flex-col items-center justify-start gap-6 bg-stone-800/30 rounded-3xl p-6 border border-stone-700/50 overflow-y-auto">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-xl mb-2">
                  <Heart className="w-6 h-6 text-red-500" /> 你: {player.hp} / {player.maxHp}
                </div>
                <span className="text-stone-300 font-bold text-lg border-b border-stone-700 pb-2 w-full text-center">你的手牌</span>
                <div className="flex flex-wrap gap-4 justify-center w-full">
                  <AnimatePresence>
                    {player.hand.map(card => (
                      <motion.div
                        key={card.id}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        whileHover={{ scale: 1.05, y: -5 }}
                        onClick={() => selectCard(card)}
                        className={`cursor-pointer ${phase !== 'BATTLE' ? 'pointer-events-none opacity-50' : ''}`}
                      >
                        <CardView card={card} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              {/* Center Arena (Middle) */}
              <div className="w-1/3 flex flex-col items-center justify-center gap-8">
                <div className="flex items-center justify-center gap-8 w-full">
                  {/* Player Played Card */}
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-stone-500 font-bold">出战</span>
                    <div className="h-40 flex items-center justify-center">
                      {phase === 'REVEAL' && playerCard ? (
                        <motion.div initial={{ x: -50, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
                          <CardView card={playerCard} />
                        </motion.div>
                      ) : (
                        <div className="w-28 h-40 border-2 border-dashed border-stone-600 rounded-xl flex items-center justify-center text-stone-500 bg-stone-800/50">
                          等待出牌
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-4xl font-black text-stone-700 italic">VS</div>

                  {/* Enemy Played Card */}
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-stone-500 font-bold">迎战</span>
                    <div className="h-40 flex items-center justify-center">
                      {phase === 'REVEAL' && enemyCard ? (
                        <motion.div initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
                          <CardView card={enemyCard} />
                        </motion.div>
                      ) : (
                        <div className="w-28 h-40 bg-stone-800 border-2 border-stone-700 rounded-xl flex items-center justify-center shadow-inner">
                          <span className="text-stone-600 text-2xl font-bold">?</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Logs / Guessing */}
                <div className="h-32 flex items-center justify-center text-center px-4 w-full bg-stone-800/80 rounded-2xl border border-stone-700 shadow-lg">
                  {phase === 'GUESS' ? (
                    <div className="space-y-4">
                      <p className="text-amber-400 font-bold text-lg">白泽效果：猜测敌方点数是否大于5？</p>
                      <div className="flex gap-4 justify-center">
                        <button onClick={() => handleGuess(true)} className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-transform active:scale-95">大于 5</button>
                        <button onClick={() => handleGuess(false)} className="px-6 py-2 bg-stone-600 hover:bg-stone-500 text-white font-bold rounded-lg transition-transform active:scale-95">小于等于 5</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-amber-500 text-lg font-bold animate-pulse">
                      {logs[logs.length - 1] || '请选择你要出战的异兽'}
                    </p>
                  )}
                </div>
              </div>

              {/* Enemy Area (Right) */}
              <div className="w-1/3 flex flex-col items-center justify-start gap-6 bg-stone-800/30 rounded-3xl p-6 border border-stone-700/50 overflow-y-auto">
                <div className="flex items-center gap-2 text-red-400 font-bold text-xl mb-2">
                  <Heart className="w-6 h-6 text-red-500" /> 敌: {enemy.hp} / {enemy.maxHp}
                </div>
                <div className="text-2xl font-black text-stone-300 mb-4 tracking-widest">{enemy.name}</div>
                <div className="w-32 h-32 rounded-full bg-stone-800 border-4 border-stone-700 flex items-center justify-center text-6xl shadow-2xl">
                  🐉
                </div>
                <div className="mt-4 text-stone-500 font-bold">
                  剩余手牌: {enemy.hand.length}
                </div>
              </div>

            </div>
          )}

          {phase === 'GAMEOVER' && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-8">
              <Skull className="w-24 h-24 text-red-500" />
              <div className="text-center space-y-2">
                <h2 className="text-4xl font-bold text-red-500">身死道消</h2>
                <p className="text-stone-400">你共击败了 {encounterCount} 只异兽</p>
              </div>
              <button 
                onClick={startGame}
                className="flex items-center gap-2 px-6 py-3 bg-stone-700 hover:bg-stone-600 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> 重新开始
              </button>
            </div>
          )}

          {phase === 'VICTORY' && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-8">
              <div className="text-6xl">🏆</div>
              <div className="text-center space-y-2">
                <h2 className="text-4xl font-bold text-amber-500">天下无敌</h2>
                <p className="text-stone-400">你已收服所有异兽！</p>
              </div>
              <button 
                onClick={startGame}
                className="flex items-center gap-2 px-6 py-3 bg-stone-700 hover:bg-stone-600 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> 重新开始
              </button>
            </div>
          )}

        </main>
      </div>
    </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-stone-900 flex-col items-center justify-center text-stone-100 hidden portrait:flex">
        <Smartphone className="w-20 h-20 mb-6 text-amber-500 animate-bounce" />
        <h2 className="text-2xl font-bold text-amber-500 mb-2">请旋转手机至横屏</h2>
        <p className="text-stone-400 text-center px-6 mt-2">本游戏专为宽屏/横屏对战设计<br/>请关闭手机方向锁定并横向握持设备</p>
      </div>
      <div className="portrait:hidden min-h-screen bg-stone-900">
        {renderContent()}
      </div>
    </>
  );
}

function CardView({ card }: { card: Card }) {
  return (
    <div className="w-28 h-40 bg-stone-800 border border-stone-600 rounded-xl p-2 flex flex-col shadow-lg relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-red-500" />
      <div className="flex justify-between items-start mb-1">
        <span className="font-bold text-sm text-stone-200 truncate">{card.name}</span>
        <span className="w-6 h-6 rounded-full bg-stone-700 flex items-center justify-center text-xs font-bold text-amber-400 border border-stone-600">
          {card.currentValue}
        </span>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-stone-700/50 flex items-center justify-center text-xl">
          {card.isBasic ? '👻' : '🐉'}
        </div>
      </div>
      <div className="h-12 text-[10px] leading-tight text-stone-400 overflow-hidden line-clamp-3">
        {card.description}
      </div>
    </div>
  );
}

