'use strict';

const COLORS = ['red', 'yellow', 'green', 'blue'];
const ACTION_VALUES = ['skip', 'reverse', 'draw2'];
const WILD_VALUES = ['wild', 'wild4'];
const VALUE_LABELS = {
  skip: 'skip',
  reverse: 'reverse',
  draw2: 'draw two',
  wild: 'wild',
  wild4: 'wild draw four',
};

const COLOR_ALIASES = {
  r: 'red',
  red: 'red',
  y: 'yellow',
  yellow: 'yellow',
  g: 'green',
  green: 'green',
  b: 'blue',
  blue: 'blue',
};

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const HAND_SIZE = 7;

class GameError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GameError';
  }
}

function isWild(card) {
  return Boolean(card) && card.color === 'wild';
}

function isAction(card) {
  return Boolean(card) && (ACTION_VALUES.includes(card.value) || WILD_VALUES.includes(card.value));
}

function normalizeColor(input) {
  if (typeof input !== 'string') return null;
  return COLOR_ALIASES[input.trim().toLowerCase()] || null;
}

function createDeck() {
  const deck = [];
  for (const color of COLORS) {
    deck.push({ color, value: '0' });
    for (let n = 1; n <= 9; n += 1) {
      deck.push({ color, value: String(n) });
      deck.push({ color, value: String(n) });
    }
    for (const value of ACTION_VALUES) {
      deck.push({ color, value });
      deck.push({ color, value });
    }
  }
  for (let i = 0; i < 4; i += 1) {
    deck.push({ color: 'wild', value: 'wild' });
    deck.push({ color: 'wild', value: 'wild4' });
  }
  return deck;
}

function shuffle(cards, rng = Math.random) {
  const result = cards.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

function makePlayer(raw, index) {
  if (!raw || raw.id === undefined || raw.id === null) {
    throw new GameError('every player needs an id');
  }
  return {
    id: String(raw.id),
    name: raw.name ? String(raw.name) : `Player ${index + 1}`,
    isBot: Boolean(raw.isBot),
    hand: [],
  };
}

function createGame(playerInputs, options = {}) {
  if (!Array.isArray(playerInputs)) throw new GameError('players must be an array');
  if (playerInputs.length < MIN_PLAYERS) throw new GameError(`UNO needs at least ${MIN_PLAYERS} players`);
  if (playerInputs.length > MAX_PLAYERS) throw new GameError(`UNO supports at most ${MAX_PLAYERS} players`);

  const players = playerInputs.map(makePlayer);
  const ids = new Set(players.map((p) => p.id));
  if (ids.size !== players.length) throw new GameError('players must be unique');

  const rng = options.rng || Math.random;
  const game = {
    players,
    deck: shuffle(createDeck(), rng),
    discard: [],
    currentIndex: 0,
    direction: 1,
    currentColor: null,
    status: 'playing',
    winnerId: null,
    drawnThisTurn: null,
    enforceWild4: Boolean(options.enforceWild4),
    rng,
    turnCount: 0,
  };

  for (const player of players) {
    player.hand.push(...drawCards(game, HAND_SIZE));
  }

  const starter = takeStarterCard(game);
  if (!starter) throw new GameError('could not find a starting card');
  game.discard.push(starter);
  game.currentColor = starter.color;

  return game;
}

function takeStarterCard(game) {
  const ready = [];
  while (game.deck.length) {
    const card = game.deck.pop();
    if (!isWild(card) && !isAction(card)) {
      game.deck.push(...ready);
      return card;
    }
    ready.push(card);
  }
  game.deck.push(...ready);
  return null;
}

function topCard(game) {
  return game.discard[game.discard.length - 1] || null;
}

function reshuffleDiscard(game) {
  if (game.discard.length <= 1) return false;
  const top = game.discard.pop();
  const recycled = game.discard;
  game.discard = [top];
  game.deck = shuffle(recycled, game.rng);
  return game.deck.length > 0;
}

function drawCards(game, count) {
  const drawn = [];
  for (let i = 0; i < count; i += 1) {
    if (!game.deck.length && !reshuffleDiscard(game)) break;
    drawn.push(game.deck.pop());
  }
  return drawn;
}

function currentPlayer(game) {
  return game.players[game.currentIndex];
}

function nextPlayer(game, steps = 1) {
  const count = game.players.length;
  const index = (((game.currentIndex + game.direction * steps) % count) + count) % count;
  return game.players[index];
}

function advance(game, steps = 1) {
  const count = game.players.length;
  game.currentIndex = (((game.currentIndex + game.direction * steps) % count) + count) % count;
  game.drawnThisTurn = null;
  game.turnCount += 1;
}

function colorMatchCount(hand, color) {
  return hand.filter((card) => card.color === color).length;
}

function canPlay(game, card, playerId = null) {
  if (!card) return false;
  if (isWild(card)) {
    if (card.value === 'wild4' && game.enforceWild4 && playerId) {
      const player = game.players.find((p) => p.id === String(playerId));
      if (player && colorMatchCount(player.hand, game.currentColor) > 0) return false;
    }
    return true;
  }
  if (game.currentColor && card.color === game.currentColor) return true;
  const top = topCard(game);
  if (top && !isWild(top) && card.value === top.value) return true;
  return false;
}

function playableIndices(game, playerId) {
  const player = findPlayer(game, playerId);
  if (!player) return [];
  const indices = [];
  for (let i = 0; i < player.hand.length; i += 1) {
    if (canPlay(game, player.hand[i], player.id)) indices.push(i);
  }
  return indices;
}

function findPlayer(game, playerId) {
  return game.players.find((p) => p.id === String(playerId)) || null;
}

function requireTurn(game, playerId) {
  if (game.status !== 'playing') throw new GameError('the game is not running');
  const player = currentPlayer(game);
  if (!player || player.id !== String(playerId)) throw new GameError('it is not your turn');
  return player;
}

function playCard(game, playerId, index, chosenColor) {
  const player = requireTurn(game, playerId);
  if (!Number.isInteger(index) || index < 0 || index >= player.hand.length) {
    throw new GameError('that is not a valid card number');
  }
  const card = player.hand[index];
  if (!canPlay(game, card, player.id)) throw new GameError('that card cannot be played right now');

  let color = card.color;
  if (isWild(card)) {
    color = normalizeColor(chosenColor);
    if (!color) throw new GameError('wild cards need a color: red, yellow, green or blue');
  }

  player.hand.splice(index, 1);
  game.discard.push(card);
  game.currentColor = color;
  game.drawnThisTurn = null;

  const effects = [];
  const playerCount = game.players.length;

  if (player.hand.length === 0) {
    game.status = 'finished';
    game.winnerId = player.id;
    return { player, card, color, effects, winner: true };
  }

  switch (card.value) {
    case 'skip': {
      const skipped = nextPlayer(game, 1);
      effects.push({ type: 'skip', playerId: skipped.id });
      advance(game, 2);
      break;
    }
    case 'reverse': {
      game.direction = -game.direction;
      effects.push({ type: 'reverse', direction: game.direction });
      advance(game, playerCount === 2 ? 2 : 1);
      break;
    }
    case 'draw2': {
      const victim = nextPlayer(game, 1);
      const drawn = drawCards(game, 2);
      victim.hand.push(...drawn);
      effects.push({ type: 'draw', playerId: victim.id, count: drawn.length });
      advance(game, 2);
      break;
    }
    case 'wild4': {
      const victim = nextPlayer(game, 1);
      const drawn = drawCards(game, 4);
      victim.hand.push(...drawn);
      effects.push({ type: 'draw', playerId: victim.id, count: drawn.length });
      advance(game, 2);
      break;
    }
    default:
      advance(game, 1);
  }

  return { player, card, color, effects, winner: false };
}

function drawCard(game, playerId) {
  const player = requireTurn(game, playerId);
  if (game.drawnThisTurn === player.id) {
    throw new GameError('you already drew this turn - play a card or pass');
  }
  const [card] = drawCards(game, 1);
  if (!card) throw new GameError('the draw pile is empty');
  player.hand.push(card);
  game.drawnThisTurn = player.id;
  return { player, card };
}

function pass(game, playerId) {
  const player = requireTurn(game, playerId);
  if (game.drawnThisTurn !== player.id) {
    throw new GameError('you can only pass after drawing a card');
  }
  advance(game, 1);
  return { player };
}

function summary(game) {
  return {
    status: game.status,
    winnerId: game.winnerId,
    direction: game.direction,
    currentColor: game.currentColor,
    currentPlayerId: game.status === 'playing' ? currentPlayer(game).id : null,
    discardTop: topCard(game),
    deckCount: game.deck.length,
    drawnThisTurn: game.drawnThisTurn,
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      handSize: p.hand.length,
      hand: p.hand.slice(),
    })),
  };
}

module.exports = {
  COLORS,
  COLOR_ALIASES,
  ACTION_VALUES,
  WILD_VALUES,
  VALUE_LABELS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  HAND_SIZE,
  GameError,
  isWild,
  isAction,
  normalizeColor,
  createDeck,
  shuffle,
  createGame,
  canPlay,
  playableIndices,
  findPlayer,
  currentPlayer,
  nextPlayer,
  topCard,
  drawCards,
  playCard,
  drawCard,
  pass,
  summary,
};
