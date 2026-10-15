'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../uno/engine');
const ai = require('../uno/ai');
const render = require('../uno/render');
const uno = require('../uno/uno');

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Build a game with a fully controlled table state.
function setup({ playerCount = 2, hands, top = { color: 'blue', value: '5' }, color, direction = 1, currentIndex = 0 }) {
  const players = Array.from({ length: playerCount }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  const game = engine.createGame(players, { rng: seeded(42) });
  hands.forEach((hand, i) => {
    game.players[i].hand = hand.slice();
  });
  game.discard = [top];
  game.currentColor = color || top.color;
  game.direction = direction;
  game.currentIndex = currentIndex;
  game.drawnThisTurn = null;
  game.status = 'playing';
  game.winnerId = null;
  return game;
}

test('deck has the standard 108 cards', () => {
  const deck = engine.createDeck();
  assert.equal(deck.length, 108);

  const byColor = (color) => deck.filter((c) => c.color === color);
  for (const color of engine.COLORS) {
    const cards = byColor(color);
    assert.equal(cards.filter((c) => c.value === '0').length, 1, `${color} 0`);
    for (let n = 1; n <= 9; n += 1) {
      assert.equal(cards.filter((c) => c.value === String(n)).length, 2, `${color} ${n}`);
    }
    assert.equal(cards.filter((c) => c.value === 'skip').length, 2);
    assert.equal(cards.filter((c) => c.value === 'reverse').length, 2);
    assert.equal(cards.filter((c) => c.value === 'draw2').length, 2);
  }
  assert.equal(byColor('wild').filter((c) => c.value === 'wild').length, 4);
  assert.equal(byColor('wild').filter((c) => c.value === 'wild4').length, 4);
});

test('createGame deals 7 cards each and flips a number starter', () => {
  const game = engine.createGame([{ id: 'a' }, { id: 'b' }, { id: 'c' }], { rng: seeded(7) });
  for (const player of game.players) assert.equal(player.hand.length, 7);
  const top = engine.topCard(game);
  assert.ok(!engine.isWild(top) && !engine.isAction(top), 'starter should be a number card');
  assert.equal(game.currentColor, top.color);
  assert.equal(game.deck.length, 108 - 21 - 1);
});

test('createGame rejects bad player counts and duplicates', () => {
  assert.throws(() => engine.createGame([{ id: 'a' }]), engine.GameError);
  assert.throws(() => engine.createGame([{ id: 'a' }, { id: 'a' }]), engine.GameError);
  assert.throws(
    () => engine.createGame(Array.from({ length: 11 }, (_, i) => ({ id: `p${i}` }))),
    engine.GameError,
  );
});

test('canPlay matches by color, by number, and always allows wilds', () => {
  const game = setup({ playerCount: 2, hands: [[], []], top: { color: 'blue', value: '5' } });
  assert.equal(engine.canPlay(game, { color: 'blue', value: '9' }), true, 'same color');
  assert.equal(engine.canPlay(game, { color: 'red', value: '5' }), true, 'same number');
  assert.equal(engine.canPlay(game, { color: 'red', value: '9' }), false, 'no match');
  assert.equal(engine.canPlay(game, { color: 'wild', value: 'wild' }), true, 'wild always');
  assert.equal(engine.canPlay(game, { color: 'wild', value: 'wild4' }), true, 'wild4 default lenient');
});

test('active color follows a played wild', () => {
  const game = setup({
    playerCount: 2,
    hands: [[{ color: 'wild', value: 'wild' }, { color: 'green', value: '3' }], [{ color: 'green', value: '1' }]],
    top: { color: 'blue', value: '5' },
  });
  engine.playCard(game, 'p0', 0, 'green');
  assert.equal(game.currentColor, 'green');
  assert.equal(engine.canPlay(game, { color: 'green', value: '1' }), true);
});

test('wild needs a valid color', () => {
  const game = setup({ playerCount: 2, hands: [[{ color: 'wild', value: 'wild' }], []], top: { color: 'blue', value: '5' } });
  assert.throws(() => engine.playCard(game, 'p0', 0, 'purple'), engine.GameError);
  assert.throws(() => engine.playCard(game, 'p0', 0), engine.GameError);
  assert.equal(engine.normalizeColor('R'), 'red');
  assert.equal(engine.normalizeColor(' blue '), 'blue');
});

test('wild4 enforcement blocks players holding the active color', () => {
  const game = setup({
    playerCount: 2,
    hands: [[{ color: 'wild', value: 'wild4' }, { color: 'blue', value: '2' }], []],
    top: { color: 'blue', value: '5' },
  });
  game.enforceWild4 = true;
  assert.equal(engine.canPlay(game, game.players[0].hand[0], 'p0'), false);
  game.players[0].hand = [{ color: 'wild', value: 'wild4' }];
  assert.equal(engine.canPlay(game, game.players[0].hand[0], 'p0'), true);
});

test('skip makes the following player lose their turn', () => {
  const game = setup({
    playerCount: 4,
    hands: [[{ color: 'blue', value: 'skip' }, { color: 'red', value: '1' }], [], [], []],
    top: { color: 'blue', value: '5' },
  });
  const result = engine.playCard(game, 'p0', 0);
  assert.equal(game.currentIndex, 2, 'p1 is skipped');
  assert.deepEqual(result.effects[0], { type: 'skip', playerId: 'p1' });
});

test('reverse flips direction, and acts like a skip with two players', () => {
  const four = setup({
    playerCount: 4,
    hands: [[{ color: 'blue', value: 'reverse' }, { color: 'red', value: '1' }], [], [], []],
    top: { color: 'blue', value: '5' },
  });
  engine.playCard(four, 'p0', 0);
  assert.equal(four.direction, -1);
  assert.equal(four.currentIndex, 3, 'turn goes the other way');

  const two = setup({
    playerCount: 2,
    hands: [[{ color: 'blue', value: 'reverse' }, { color: 'red', value: '1' }], []],
    top: { color: 'blue', value: '5' },
  });
  engine.playCard(two, 'p0', 0);
  assert.equal(two.currentIndex, 0, 'p0 plays again');
});

test('draw two gives the next player two cards and skips them', () => {
  const game = setup({
    playerCount: 3,
    hands: [[{ color: 'blue', value: 'draw2' }, { color: 'red', value: '1' }], [], []],
    top: { color: 'blue', value: '5' },
  });
  engine.playCard(game, 'p0', 0);
  assert.equal(game.players[1].hand.length, 2);
  assert.equal(game.currentIndex, 2);
});

test('wild draw four gives four cards and skips', () => {
  const game = setup({
    playerCount: 2,
    hands: [[{ color: 'wild', value: 'wild4' }, { color: 'red', value: '1' }], []],
    top: { color: 'blue', value: '5' },
  });
  engine.playCard(game, 'p0', 0, 'red');
  assert.equal(game.players[1].hand.length, 4);
  assert.equal(game.currentColor, 'red');
  assert.equal(game.currentIndex, 0);
});

test('emptying your hand ends the game', () => {
  const game = setup({
    playerCount: 2,
    hands: [[{ color: 'blue', value: '9' }], [{ color: 'blue', value: '1' }]],
    top: { color: 'blue', value: '5' },
  });
  const result = engine.playCard(game, 'p0', 0);
  assert.equal(result.winner, true);
  assert.equal(game.status, 'finished');
  assert.equal(game.winnerId, 'p0');
});

test('turns are enforced and out-of-turn moves are rejected', () => {
  const game = setup({ playerCount: 2, hands: [[{ color: 'blue', value: '9' }], [{ color: 'blue', value: '1' }]] });
  assert.throws(() => engine.playCard(game, 'p1', 0), /not your turn/);
  assert.throws(() => engine.drawCard(game, 'p1'), /not your turn/);
});

test('you draw once, then may pass, and cannot draw twice', () => {
  const game = setup({ playerCount: 2, hands: [[], [{ color: 'blue', value: '1' }]] });
  engine.drawCard(game, 'p0');
  assert.equal(game.players[0].hand.length, 1);
  assert.equal(game.drawnThisTurn, 'p0');
  assert.throws(() => engine.drawCard(game, 'p0'), /already drew/);
  engine.pass(game, 'p0');
  assert.equal(game.currentIndex, 1);
});

test('passing is only allowed after drawing', () => {
  const game = setup({ playerCount: 2, hands: [[], []] });
  assert.throws(() => engine.pass(game, 'p0'), /only pass after drawing/);
});

test('the discard pile is reshuffled when the deck runs out', () => {
  const game = setup({ playerCount: 2, hands: [[], []], top: { color: 'blue', value: '5' } });
  game.deck = [];
  game.discard = [
    { color: 'red', value: '1' },
    { color: 'green', value: '2' },
    { color: 'blue', value: '5' },
  ];
  const { card } = engine.drawCard(game, 'p0');
  assert.ok(card, 'a card was drawn after reshuffle');
  assert.equal(game.discard.length, 1, 'only the top card stays on the discard pile');
  assert.equal(engine.topCard(game).value, '5');
});

test('ai plays when it can, otherwise draws and passes', () => {
  const rng = seeded(3);

  const playable = setup({ playerCount: 2, hands: [[{ color: 'blue', value: '9' }], []], top: { color: 'blue', value: '5' } });
  const move = ai.chooseMove(playable, 'p0', { rng });
  assert.equal(move.action, 'play');
  assert.equal(move.index, 0);

  const blocked = setup({ playerCount: 2, hands: [[{ color: 'red', value: '1' }], []], top: { color: 'blue', value: '5' } });
  assert.equal(ai.chooseMove(blocked, 'p0', { rng }).action, 'draw');

  blocked.drawnThisTurn = 'p0';
  assert.equal(ai.chooseMove(blocked, 'p0', { rng }).action, 'pass');
});

test('ai picks the dominant color for a wild and avoids wasting wilds', () => {
  const rng = seeded(11);
  const game = setup({
    playerCount: 2,
    hands: [
      [
        { color: 'wild', value: 'wild' },
        { color: 'red', value: '1' },
        { color: 'blue', value: '2' },
      ],
      [],
    ],
    top: { color: 'wild', value: 'wild' },
    color: 'blue',
  });
  // Active color is blue, so only the blue card and the wild are playable -> keep the wild.
  const move = ai.chooseMove(game, 'p0', { rng });
  assert.equal(move.action, 'play');
  assert.equal(move.index, 2, 'plays the matching color instead of the wild');

  const wildOnly = setup({
    playerCount: 2,
    hands: [[{ color: 'wild', value: 'wild' }, { color: 'red', value: '1' }, { color: 'red', value: '2' }], []],
    top: { color: 'blue', value: '5' },
  });
  const wildMove = ai.chooseMove(wildOnly, 'p0', { rng });
  assert.equal(wildOnly.players[0].hand[wildMove.index].value, 'wild');
  assert.ok(engine.COLORS.includes(wildMove.color), 'wild move carries a color');
  assert.equal(wildMove.color, 'red', 'picks the color it holds most of');
});

test('a full simulated game always terminates with a winner', () => {
  const rng = seeded(2026);
  for (let i = 0; i < 50; i += 1) {
    const game = engine.createGame(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      { rng },
    );
    let guard = 0;
    while (game.status === 'playing' && guard < 5000) {
      guard += 1;
      const pid = engine.currentPlayer(game).id;
      const move = ai.chooseMove(game, pid, { rng });
      if (move.action === 'play') engine.playCard(game, pid, move.index, move.color);
      else if (move.action === 'draw') engine.drawCard(game, pid);
      else engine.pass(game, pid);
    }
    assert.equal(game.status, 'finished', `game ${i} should finish`);
    assert.ok(game.winnerId, 'there is a winner');
  }
});

test('summary exposes the public state without mutating hands', () => {
  const game = setup({ playerCount: 2, hands: [[{ color: 'blue', value: '9' }], []] });
  const state = engine.summary(game);
  assert.equal(state.currentPlayerId, 'p0');
  assert.equal(state.players[0].handSize, 1);
  state.players[0].hand.push('x');
  assert.equal(game.players[0].hand.length, 1, 'summary returns copies');
});

test('render helpers describe cards and build valid components', () => {
  assert.match(render.cardFace({ color: 'red', value: '7' }), /7/);
  assert.match(render.cardFace({ color: 'wild', value: 'wild4' }), /\+4/);

  const game = setup({
    playerCount: 3,
    hands: [
      [{ color: 'blue', value: '9' }, { color: 'wild', value: 'wild' }],
      [{ color: 'red', value: '1' }],
      [],
    ],
    top: { color: 'blue', value: '5' },
  });
  const session = { game, players: game.players, hostId: 'p0', hostName: 'P0', status: 'playing' };

  const board = render.boardEmbed(session).toJSON();
  assert.ok(board.fields.some((f) => /Top card/.test(f.name)));

  const rows = render.handComponents(session, 'p0');
  const menu = rows[0].toJSON().components[0];
  assert.equal(menu.options.length, 2, 'only playable cards are offered');

  const other = render.handComponents(session, 'p1');
  assert.equal(other.length, 1, 'non-current players only get a refresh button');

  const colors = render.colorComponents(0)[0].toJSON().components;
  assert.equal(colors.length, 4);
});

test('isUnoCommand recognises the command without swallowing other words', () => {
  assert.equal(uno.isUnoCommand('!uno'), true);
  assert.equal(uno.isUnoCommand('!uno play 3'), true);
  assert.equal(uno.isUnoCommand('!UNO help'), true);
  assert.equal(uno.isUnoCommand('!unocorn'), false);
  assert.equal(uno.isUnoCommand('hello !uno'), false);
});
