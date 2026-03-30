import { Card } from './types';

export const ALL_CARDS: Card[] = [
  { id: 'basic1', instanceId: '', name: '魂兽一', baseValue: 1, currentValue: 1, description: '普通魂兽', isBasic: true },
  { id: 'basic2', instanceId: '', name: '魂兽二', baseValue: 2, currentValue: 2, description: '普通魂兽', isBasic: true },
  { id: 'basic3', instanceId: '', name: '魂兽三', baseValue: 3, currentValue: 3, description: '普通魂兽', isBasic: true },
  { id: 'basic4', instanceId: '', name: '魂兽四', baseValue: 4, currentValue: 4, description: '普通魂兽', isBasic: true },
  { id: 'changyou', instanceId: '', name: '长右', baseValue: 1, currentValue: 1, description: '点数等同于敌方异兽的当前点数' },
  { id: 'yu', instanceId: '', name: '蜮', baseValue: 1, currentValue: 1, description: '若敌方＞5点，则其死亡，蜮回手' },
  { id: 'zhen', instanceId: '', name: '鸩', baseValue: 1, currentValue: 1, description: '死亡时，对手弃一张最小点数牌' },
  { id: 'jingwei', instanceId: '', name: '精卫', baseValue: 2, currentValue: 2, description: '死亡时，选择弃牌区中另一张牌回手' },
  { id: 'xiangliu', instanceId: '', name: '相柳', baseValue: 1, currentValue: 1, description: '本牌点数不为9时，死亡时回手，本牌点数+2' },
  { id: 'henggongyu', instanceId: '', name: '横公鱼', baseValue: 2, currentValue: 2, description: '死亡时，若敌方＞5点，则回手并偷取敌方1生命' },
  { id: 'chenghuang', instanceId: '', name: '乘黄', baseValue: 2, currentValue: 2, description: '死亡时，指定对方一只异兽，下回合对方不能打出该异兽' },
  { id: 'bian', instanceId: '', name: '狴犴', baseValue: 2, currentValue: 2, description: '展示前，本牌的点数+敌方人数' },
  { id: 'bibi', instanceId: '', name: '獙獙', baseValue: 2, currentValue: 2, description: '打出时，使己方一只异兽恢复为初始点数' },
  { id: 'zhujian', instanceId: '', name: '诸犍', baseValue: 3, currentValue: 3, description: '回手时，查看敌方一张随机牌，并其点数-2' },
  { id: 'boyi', instanceId: '', name: '猼訑', baseValue: 3, currentValue: 3, description: '死亡时，本回合拥有者不失去生命值' },
  { id: 'taotie', instanceId: '', name: '饕餮', baseValue: 3, currentValue: 3, description: '死亡时，将敌方异兽移出游戏' },
  { id: 'fenghuang', instanceId: '', name: '凤凰', baseValue: 3, currentValue: 3, description: '回手/死亡时，拥有者恢复2生命值' },
  { id: 'yongyan', instanceId: '', name: '永焰', baseValue: 3, currentValue: 3, description: '回手时，敌方每回合失去1生命' },
  { id: 'qilin', instanceId: '', name: '麒麟', baseValue: 4, currentValue: 4, description: '敌方本回合不能触发任何效果' },
  { id: 'zhuyan', instanceId: '', name: '朱厌', baseValue: 4, currentValue: 4, description: '打出时，所有人弃一张最大点数牌' },
  { id: 'dijiang', instanceId: '', name: '帝江', baseValue: 4, currentValue: 4, description: '展示前，本牌点数从1-9随机变化' },
  { id: 'fei', instanceId: '', name: '蜚', baseValue: 4, currentValue: 4, description: '死亡时，所有人失去2生命' },
  { id: 'baize', instanceId: '', name: '白泽', baseValue: 5, currentValue: 5, description: '展示前，你可以猜测对方本回合点数是否高于5。若猜对，本回合+3点数；若猜错，本回合-1点数' },
  { id: 'bifang', instanceId: '', name: '毕方', baseValue: 5, currentValue: 5, description: '死亡时，所有人手中所有异兽点数-1' },
  { id: 'chiyou', instanceId: '', name: '蚩尤', baseValue: 6, currentValue: 6, description: '若胜利，直接死亡，敌人额外失去2生命' },
  { id: 'kuafu', instanceId: '', name: '夸父', baseValue: 7, currentValue: 7, description: '打出后，拥有者失去1生命值' },
  { id: 'biyi', instanceId: '', name: '比翼', baseValue: 8, currentValue: 8, description: '选择本异兽后，下次可选异兽次数-1' },
  { id: 'jiuweihu', instanceId: '', name: '九尾狐', baseValue: 9, currentValue: 9, description: '死亡时回手，回手后本牌点数-4' },
];

export const ALIEN_BEASTS = ALL_CARDS.filter(c => !c.isBasic);
export const BASIC_BEASTS = ALL_CARDS.filter(c => c.isBasic);
