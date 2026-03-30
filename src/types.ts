export interface Card {
  id: string;
  instanceId: string;
  name: string;
  baseValue: number;
  currentValue: number;
  description: string;
  isBasic?: boolean;
  playedOnce?: boolean;
}

export interface Player {
  hp: number;
  maxHp: number;
  hand: Card[];
  discard: Card[];
  pool: Card[];
}

export interface Enemy {
  name: string;
  hp: number;
  maxHp: number;
  hand: Card[];
  discard: Card[];
}
