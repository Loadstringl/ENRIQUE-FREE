'use strict';

// Zero bot pacing so games resolve quickly; must be set before requiring the module.
process.env.UNO_BOT_DELAY_MS = '0';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags, ChannelType } = require('discord.js');

const engine = require('../uno/engine');
const uno = require('../uno/uno');

const client = {};
const settle = () => new Promise((resolve) => setTimeout(resolve, 15));

function makeChannel(id, name) {
  const channel = {
    id,
    name,
    type: ChannelType.GuildText,
    messages: [],
    async send(payload) {
      const sent = {
        payload,
        channel,
        async edit(next) {
          sent.payload = next;
          return sent;
        },
      };
      channel.messages.push(sent);
      return sent;
    },
  };
  return channel;
}

function makeUser(id, username) {
  return {
    id,
    username,
    bot: false,
    outbox: [],
    async send(payload) {
      this.outbox.push(payload);
    },
  };
}

function makeMessage(author, channel, content) {
  return {
    content,
    author,
    channel,
    guild: { id: 'guild-1', name: 'Test Guild' },
    guildId: 'guild-1',
    channelId: channel.id,
    inGuild: () => true,
    replies: [],
    async reply(payload) {
      this.replies.push(payload);
      return { payload };
    },
    async react() {},
  };
}

function makeInteraction({ customId, user, channel, values, ephemeral = false }) {
  const interaction = {
    customId,
    user,
    channel,
    channelId: channel.id,
    values,
    message: { flags: { has: (flag) => ephemeral && flag === MessageFlags.Ephemeral } },
    replied: false,
    deferred: false,
    inGuild: () => true,
    isButton: () => !values,
    isStringSelectMenu: () => Boolean(values),
    replies: [],
    updates: [],
    async reply(payload) {
      this.replies.push(payload);
      this.replied = true;
      return payload;
    },
    async followUp(payload) {
      this.replies.push(payload);
      return payload;
    },
    async update(payload) {
      this.updates.push(payload);
      return payload;
    },
  };
  return interaction;
}

async function takeTurn(channel, user, authorId) {
  const game = uno.getSession(channel.id).game;
  const current = engine.currentPlayer(game);
  if (current.id !== authorId) return false;

  let index = engine.playableIndices(game, authorId)[0];
  if (index === undefined) {
    await uno.handleUnoMessage(client, makeMessage(user, channel, '!uno draw'));
    index = engine.playableIndices(game, authorId)[0];
    if (index === undefined) {
      await uno.handleUnoMessage(client, makeMessage(user, channel, '!uno pass'));
      return true;
    }
  }
  const card = current.hand[index];
  const color = card.color === 'wild' ? ' red' : '';
  await uno.handleUnoMessage(client, makeMessage(user, channel, `!uno play ${index + 1}${color}`));
  return true;
}

test('lobby, join, start, hand panel and playing through commands', async () => {
  const channel = makeChannel('chan-flow', 'uno');
  const alice = makeUser('u1', 'Alice');
  const bob = makeUser('u2', 'Bob');

  // 1. Alice opens a lobby
  await uno.handleUnoMessage(client, makeMessage(alice, channel, '!uno'));
  let session = uno.getSession(channel.id);
  assert.ok(session, 'a session exists');
  assert.equal(session.status, 'lobby');
  assert.equal(session.players.length, 1);

  // 2. Bob joins with the button
  await uno.handleInteraction(client, makeInteraction({ customId: 'uno:join', user: bob, channel }));
  assert.equal(session.players.length, 2);
  assert.ok(session.players.some((p) => p.id === 'u2'));

  // 3. A non-host cannot start
  const blocked = makeInteraction({ customId: 'uno:start', user: bob, channel });
  await uno.handleInteraction(client, blocked);
  assert.match(blocked.replies[0].content, /host/i);
  assert.equal(session.status, 'lobby');

  // 4. Alice starts, and a bot is added for good measure
  await uno.handleUnoMessage(client, makeMessage(alice, channel, '!uno bot'));
  const start = makeInteraction({ customId: 'uno:start', user: alice, channel });
  await uno.handleInteraction(client, start);
  assert.equal(session.status, 'playing');
  assert.equal(session.game.players.length, 3);

  // 5. The "My Hand" button opens a private (ephemeral) panel
  const hand = makeInteraction({ customId: 'uno:hand', user: alice, channel });
  await uno.handleInteraction(client, hand);
  assert.ok(hand.replies[0].flags === MessageFlags.Ephemeral, 'hand reply is ephemeral');
  assert.ok(hand.replies[0].embeds.length === 1);

  // 6. Play the whole game out
  let guard = 0;
  while (session.game.status === 'playing' && guard < 400) {
    guard += 1;
    const current = engine.currentPlayer(session.game);
    if (current.isBot) {
      await settle();
      continue;
    }
    const user = current.id === 'u1' ? alice : bob;
    await takeTurn(channel, user, current.id);
    await settle();
  }

  assert.equal(session.game.status, 'finished', 'the game finishes');
  assert.ok(session.game.winnerId, 'there is a winner');
  assert.ok(channel.messages.length > 3, 'the bot posted board/action updates');
});

test('the private panel offers only playable cards and can play a wild', async () => {
  const channel = makeChannel('chan-panel', 'uno-2');
  const alice = makeUser('a1', 'Alice');
  const bob = makeUser('a2', 'Bob');

  await uno.handleUnoMessage(client, makeMessage(alice, channel, '!uno'));
  await uno.handleUnoMessage(client, makeMessage(bob, channel, '!uno join'));
  await uno.handleUnoMessage(client, makeMessage(alice, channel, '!uno start'));

  const session = uno.getSession(channel.id);
  // Force a known, controlled hand so the assertions are deterministic.
  session.game.players[0].hand = [
    { color: 'wild', value: 'wild' },
    { color: 'red', value: '1' },
  ];
  session.game.discard = [{ color: 'green', value: '5' }];
  session.game.currentColor = 'green';
  session.game.currentIndex = 0;

  const open = makeInteraction({ customId: 'uno:hand', user: alice, channel });
  await uno.handleInteraction(client, open);
  const menu = open.replies[0].components[0].toJSON().components[0];
  assert.deepEqual(
    menu.options.map((o) => o.value),
    ['0'],
    'only the wild is playable against green',
  );

  // Choosing the wild prompts for a color instead of playing immediately
  const select = makeInteraction({ customId: 'uno:select', user: alice, channel, values: ['0'], ephemeral: true });
  await uno.handleInteraction(client, select);
  const colorRow = select.updates[0].components[0].toJSON().components;
  assert.equal(colorRow.length, 4, 'four color choices shown');

  const pick = makeInteraction({ customId: 'uno:color:0:yellow', user: alice, channel, ephemeral: true });
  await uno.handleInteraction(client, pick);
  assert.equal(session.game.currentColor, 'yellow');
  assert.equal(session.game.players[0].hand.length, 1, 'the wild left the hand');

  // DM hand command delivers privately
  await uno.handleUnoMessage(client, makeMessage(bob, channel, '!uno hand'));
  assert.equal(bob.outbox.length, 1, 'hand was DM\'d');
});

test('a message that merely contains "uno" is not treated as a command', async () => {
  const channel = makeChannel('chan-noise', 'general');
  const alice = makeUser('n1', 'Alice');
  await uno.handleUnoMessage(client, makeMessage(alice, channel, 'I love playing unocorn games'));
  assert.equal(uno.getSession(channel.id), null, 'no session was created');
});
