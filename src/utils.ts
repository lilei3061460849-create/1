import { Card } from './types';

export function cloneCard(card: Card): Card {
  return { ...card, instanceId: Math.random().toString(36).substring(2, 11) + Date.now().toString(36) };
}

export function getMinCard(cards: Card[]): Card | null {
  if (cards.length === 0) return null;
  return cards.reduce((min, c) => c.currentValue < min.currentValue ? c : min, cards[0]);
}

export function getMaxCard(cards: Card[]): Card | null {
  if (cards.length === 0) return null;
  return cards.reduce((max, c) => c.currentValue > max.currentValue ? c : max, cards[0]);
}
