'use strict';

const { COLORS, findPlayer, playableIndices, nextPlayer, isWild } = require('./engine');

function colorCounts(hand, skipIndex = -1) {
  const counts = {};
  for (const color of COLORS) counts[color] = 0;
  hand.forEach((card, index) => {
    if (index === skipIndex) return;
    if (card.color !== 'wild') counts[card.color] += 1;
  });
  return counts;
}

function bestColor(hand, skipIndex, rng) {
  const counts = colorCounts(hand, skipIndex);
  let best = null;
  let bestCount = -1;
  let tie = 0;
  for (const color of COLORS) {
    if (counts[color] > bestCount) {
      best = color;
      bestCount = counts[color];
      tie = 1;
    } else if (counts[color] === bestCount) {
      tie += 1;
      if (rng() < 1 / tie) best = color;
    }
  }
  return bestCount > 0 ? best : COLORS[Math.floor(rng() * COLORS.length)];
}

function scoreCard(game, player, index, opponent) {
  const card = player.hand[index];
  const counts = colorCounts(player.hand, index);
  const threatening = opponent && opponent.hand.length <= 2;
  let score = 0;

  if (card.color !== 'wild') score += counts[card.color] * 2;

  switch (card.value) {
    case 'draw2':
      score += threatening ? 120 : 4;
      break;
    case 'skip':
      score += threatening ? 100 : 3;
      break;
    case 'reverse':
      score += threatening ? 90 : 2;
      break;
    case 'wild':
      score -= threatening ? 10 : 20;
      break;
    case 'wild4':
      score -= threatening ? 0 : 18;
      break;
    default:
      score += 1;
  }
  return score;
}

function chooseMove(game, playerId, options = {}) {
  const rng = options.rng || game.rng || Math.random;
  const player = findPlayer(game, playerId);
  if (!player) return { action: 'pass' };

  const indices = playableIndices(game, playerId);
  if (indices.length === 0) {
    return { action: game.drawnThisTurn === player.id ? 'pass' : 'draw' };
  }

  const opponent = nextPlayer(game, 1);
  let bestIndex = indices[0];
  let bestScore = -Infinity;
  for (const index of indices) {
    const score = scoreCard(game, player, index, opponent);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  const card = player.hand[bestIndex];
  const move = { action: 'play', index: bestIndex, card: { color: card.color, value: card.value } };
  if (isWild(card)) move.color = bestColor(player.hand, bestIndex, rng);
  return move;
}

module.exports = { chooseMove, bestColor, colorCounts, scoreCard };
