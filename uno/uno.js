'use strict';

const { Events, MessageFlags, ChannelType } = require('discord.js');

const engine = require('./engine');
const { chooseMove } = require('./ai');
const {
  COLOR_NAME,
  cardFace,
  playerLabel,
  lobbyEmbed,
  boardEmbed,
  handEmbed,
  lobbyComponents,
  boardComponents,
  handComponents,
  colorComponents,
  panelData,
  helpEmbed,
} = require('./render');

const PREFIX = (process.env.COMMAND_PREFIX || '!').toLowerCase();
const BOT_DELAY_MS = Number(process.env.UNO_BOT_DELAY_MS || 1200);
const MAX_PLAYERS = engine.MAX_PLAYERS;
const UNO_CHANNEL_NAMES = (process.env.UNO_CHANNEL_NAMES || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const sessions = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getSession(channelId) {
  return sessions.get(channelId) || null;
}

function dropSession(session) {
  if (session.botTimer) clearTimeout(session.botTimer);
  session.botTimer = null;
  sessions.delete(session.channelId);
}

function channelAllowed(channel) {
  if (!channel) return false;
  if (channel.type !== ChannelType.GuildText) return false;
  if (!UNO_CHANNEL_NAMES.length) return true;
  return UNO_CHANNEL_NAMES.includes(channel.name.toLowerCase());
}

function isUnoCommand(content) {
  const lower = content.toLowerCase();
  if (!lower.startsWith(`${PREFIX}uno`)) return false;
  const rest = content.slice(PREFIX.length + 3);
  return rest === '' || /^\s/.test(rest);
}

function isPanel(interaction) {
  return Boolean(interaction.message?.flags?.has?.(MessageFlags.Ephemeral));
}

function findRosterPlayer(session, userId) {
  return session.players.find((p) => p.id === userId) || null;
}

function addPlayer(session, raw) {
  if (session.players.length >= MAX_PLAYERS) throw new engine.GameError(`UNO supports at most ${MAX_PLAYERS} players`);
  if (session.players.some((p) => p.id === raw.id)) throw new engine.GameError('you are already in this lobby');
  session.players.push({ id: raw.id, name: raw.name, isBot: Boolean(raw.isBot) });
}

function nextBotName(session) {
  let n = 1;
  const used = new Set(session.players.map((p) => p.name));
  while (used.has(`Bot ${n}`)) n += 1;
  return `Bot ${n}`;
}

async function refreshLobby(session, note) {
  if (!session.message) return;
  await session.message
    .edit({ embeds: [lobbyEmbed(session, note)], components: lobbyComponents() })
    .catch(() => {});
}

async function updateBoard(session, channel, note) {
  const payload = { embeds: [boardEmbed(session, note)], components: boardComponents() };
  if (session.message) {
    try {
      await session.message.edit(payload);
      return;
    } catch {
      /* fall through and post a new board */
    }
  }
  try {
    session.message = await channel.send(payload);
  } catch (error) {
    console.error('[uno] failed to post board:', error.message);
  }
}

function describePlay(game, result) {
  const { player, card, color, effects, winner } = result;
  const parts = [`${playerLabel(player)} played **${cardFace(card)}**`];
  if (engine.isWild(card)) parts[0] += ` and chose ${COLOR_NAME[color]}`;

  for (const effect of effects) {
    if (effect.type === 'skip') {
      const skipped = engine.findPlayer(game, effect.playerId);
      parts.push(`🚫 ${skipped ? playerLabel(skipped) : 'the next player'} is skipped!`);
    } else if (effect.type === 'reverse') {
      parts.push('🔄 the play order reversed!');
    } else if (effect.type === 'draw') {
      parts.push(`😬 <@${effect.playerId}> draws ${effect.count}!`);
    }
  }
  if (winner) parts.push(`🏆 ${playerLabel(player)} wins!`);
  return parts.join(' — ');
}

function applyMove(session, playerId, move) {
  const game = session.game;
  if (move.type === 'play') {
    const result = engine.playCard(game, playerId, move.index, move.color);
    return { text: describePlay(game, result), private: null, result };
  }
  if (move.type === 'draw') {
    const { player, card } = engine.drawCard(game, playerId);
    const playable = engine.canPlay(game, card, player.id);
    return {
      text: `${playerLabel(player)} drew a card.`,
      private: `You drew **${cardFace(card)}**${playable ? ' — you can play it now or pass.' : ' — nothing to play, press **Pass**.'}`,
    };
  }
  if (move.type === 'pass') {
    const { player } = engine.pass(game, playerId);
    return { text: `${playerLabel(player)} passed.`, private: null };
  }
  throw new engine.GameError('unknown move');
}

function scheduleBot(session, channel) {
  if (session.botTimer) return;
  const game = session.game;
  if (!game || game.status !== 'playing') return;
  const turn = engine.currentPlayer(game);
  if (!turn.isBot) return;

  session.botTimer = setTimeout(() => {
    session.botTimer = null;
    runBotTurn(session, channel).catch((error) => console.error('[uno] bot turn failed:', error));
  }, BOT_DELAY_MS);
}

async function runBotTurn(session, channel) {
  const game = session.game;
  if (!game || game.status !== 'playing') return;
  const bot = engine.currentPlayer(game);
  if (!bot.isBot) return;

  const lines = [];
  let guard = 0;
  while (game.status === 'playing' && engine.currentPlayer(game).id === bot.id && guard < 8) {
    guard += 1;
    const move = chooseMove(game, bot.id);
    if (move.action === 'play') {
      lines.push(applyMove(session, bot.id, { type: 'play', index: move.index, color: move.color }).text);
      break;
    }
    if (move.action === 'draw') {
      lines.push(applyMove(session, bot.id, { type: 'draw' }).text);
      await sleep(450);
      continue;
    }
    lines.push(applyMove(session, bot.id, { type: 'pass' }).text);
    break;
  }

  await channel.send(lines.join('\n')).catch(() => {});
  await updateBoard(session, channel);
  scheduleBot(session, channel);
}

async function finishIfWon(session, channel) {
  if (session.game.status !== 'finished') return;
  const winner = session.game.players.find((p) => p.id === session.game.winnerId);
  await updateBoard(session, channel, `🏆 ${winner.name} wins!`);
}

async function afterHumanMove(session, channel, text, note) {
  if (text) await channel.send(text).catch(() => {});
  await updateBoard(session, channel, note);
  scheduleBot(session, channel);
}

// --- commands ---------------------------------------------------------------

async function createLobby(message) {
  const existing = getSession(message.channelId);
  if (existing) {
    await message.reply(
      existing.status === 'playing'
        ? '⚠️ A game is already running here. Finish it with `!uno end` first.'
        : '⚠️ A lobby is already open here. Join it or wait for it to start.',
    );
    return;
  }

  const session = {
    channelId: message.channelId,
    guildId: message.guildId,
    hostId: message.author.id,
    hostName: message.author.username,
    status: 'lobby',
    players: [],
    game: null,
    message: null,
    botTimer: null,
  };
  sessions.set(session.channelId, session);
  addPlayer(session, { id: message.author.id, name: message.author.username });

  session.message = await message.channel.send({
    embeds: [lobbyEmbed(session)],
    components: lobbyComponents(),
  });
}

async function joinLobby(message, session) {
  if (!session || session.status !== 'lobby') {
    await message.reply('⚠️ There is no open lobby here. Start one with `!uno`.');
    return;
  }
  try {
    addPlayer(session, { id: message.author.id, name: message.author.username });
  } catch (error) {
    await message.reply(`⚠️ ${error.message}`);
    return;
  }
  await refreshLobby(session, `${message.author.username} joined`);
}

async function leaveLobby(message, session) {
  if (!session || session.status !== 'lobby') {
    await message.reply('⚠️ There is no open lobby here.');
    return;
  }
  const index = session.players.findIndex((p) => p.id === message.author.id);
  if (index === -1) {
    await message.reply('⚠️ You are not in this lobby.');
    return;
  }
  session.players.splice(index, 1);

  if (session.hostId === message.author.id) {
    if (!session.players.length) {
      dropSession(session);
      if (session.message) await session.message.edit({ embeds: [lobbyEmbed(session, 'Lobby closed')], components: [] }).catch(() => {});
      return;
    }
    session.hostId = session.players[0].id;
    session.hostName = session.players[0].name;
  }
  await refreshLobby(session, `${message.author.username} left`);
}

async function addBot(message, session) {
  if (!session || session.status !== 'lobby') {
    await message.reply('⚠️ You can only add bots in a lobby.');
    return;
  }
  try {
    addPlayer(session, { id: `bot-${message.channelId}-${Date.now()}`, name: nextBotName(session), isBot: true });
  } catch (error) {
    await message.reply(`⚠️ ${error.message}`);
    return;
  }
  await refreshLobby(session, 'A bot joined');
}

async function startGame(message, session) {
  if (!session || session.status !== 'lobby') {
    await message.reply('⚠️ There is no lobby to start.');
    return;
  }
  if (message.author.id !== session.hostId) {
    await message.reply('⚠️ Only the host can start the game.');
    return;
  }
  if (session.players.length < engine.MIN_PLAYERS) {
    await message.reply(`⚠️ You need at least ${engine.MIN_PLAYERS} players. Invite someone or add a bot with \`!uno bot\`.`);
    return;
  }

  session.game = engine.createGame(
    session.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot })),
  );
  session.status = 'playing';
  await message.channel.send('🎉 **Game on!** Click **🃏 My Hand** to see your cards.').catch(() => {});
  await updateBoard(session, message.channel);
  scheduleBot(session, message.channel);
}

async function playCommand(message, session, args) {
  requireGame(message, session);
  const index = Number.parseInt(args[0], 10) - 1;
  if (!Number.isInteger(index) || index < 0) {
    await message.reply('⚠️ Usage: `!uno play <card number> [color]` — e.g. `!uno play 3 red`.');
    return;
  }
  const out = applyMove(session, message.author.id, { type: 'play', index, color: args[1] });
  await afterHumanMove(session, message.channel, out.text);
  await finishIfWon(session, message.channel);
}

async function drawCommand(message, session) {
  requireGame(message, session);
  applyMove(session, message.author.id, { type: 'draw' });
  await message.reply('🎴 You drew a card — check `!uno hand`, then `!uno play` or `!uno pass`.').catch(() => {});
  await updateBoard(session, message.channel);
}

async function passCommand(message, session) {
  requireGame(message, session);
  const out = applyMove(session, message.author.id, { type: 'pass' });
  await afterHumanMove(session, message.channel, out.text);
}

async function handCommand(message, session) {
  requireGame(message, session);
  const player = session.game.players.find((p) => p.id === message.author.id);
  if (!player) {
    await message.reply('⚠️ You are not in this game.');
    return;
  }
  try {
    await message.author.send({
      embeds: [handEmbed(session, player.id)],
      content: `Your UNO hand (${message.guild?.name || 'game'}):`,
    });
    await message.react('📬').catch(() => {});
  } catch {
    await message.reply('⚠️ I could not DM you. Open your DMs, or press **🃏 My Hand** on the board instead.');
  }
}

async function endGame(message, session) {
  if (!session) {
    await message.reply('⚠️ There is no game here.');
    return;
  }
  if (message.author.id !== session.hostId) {
    await message.reply('⚠️ Only the host can end the game.');
    return;
  }
  const channel = message.channel;
  dropSession(session);
  if (session.message) {
    await session.message.edit({ embeds: [boardEmbed(session, 'Game ended by the host.')], components: [] }).catch(() => {});
  }
  await channel.send('🏁 The UNO game was ended by the host.').catch(() => {});
}

function requireGame(message, session) {
  if (!session || session.status !== 'playing' || !session.game) {
    throw new engine.GameError('there is no game running here — start one with `!uno`');
  }
}

async function routeCommand(client, message, sub, args, session) {
  switch (sub) {
    case 'create':
    case 'new':
    case 'lobby':
    case 'host':
      return createLobby(message);
    case 'join':
      return joinLobby(message, session);
    case 'leave':
    case 'quit':
      return leaveLobby(message, session);
    case 'bot':
    case 'addbot':
    case 'cpu':
      return addBot(message, session);
    case 'start':
    case 'begin':
      return startGame(message, session);
    case 'play':
    case 'p':
      return playCommand(message, session, args);
    case 'draw':
    case 'd':
      return drawCommand(message, session);
    case 'pass':
    case 'skip':
      return passCommand(message, session);
    case 'hand':
    case 'cards':
      return handCommand(message, session);
    case 'board':
    case 'status': {
      if (!session) return message.reply('⚠️ There is no game here. Start one with `!uno`.');
      if (session.game) return updateBoard(session, message.channel);
      return refreshLobby(session, 'Board refreshed');
    }
    case 'end':
    case 'stop':
      return endGame(message, session);
    case 'help':
    case 'rules':
      return message.channel.send({ embeds: [helpEmbed()] });
    default:
      return message.reply(`⚠️ Unknown option \`${sub}\`. Try \`!uno help\`.`);
  }
}

async function handleUnoMessage(client, message) {
  if (!message.inGuild() || message.author.bot) return;
  if (!isUnoCommand(message.content)) return;
  if (!channelAllowed(message.channel)) return;

  const sub = (message.content.slice(PREFIX.length + 3).trim().split(/\s+/)[0] || 'create').toLowerCase();
  const args = message.content.slice(PREFIX.length + 3).trim().split(/\s+/).slice(1).filter(Boolean);
  const session = getSession(message.channelId);

  try {
    await routeCommand(client, message, sub, args, session);
  } catch (error) {
    if (error instanceof engine.GameError) {
      await message.reply(`⚠️ ${error.message}`).catch(() => {});
      return;
    }
    console.error('[uno] command error:', error);
    await message.reply('⚠️ Something went wrong with that UNO action.').catch(() => {});
  }
}

// --- interactions -----------------------------------------------------------

async function replyEphemeral(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral };
  if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
  else await interaction.reply(payload).catch(() => {});
}

function openPanelPayload(session, playerId, note) {
  const player = session.game.players.find((p) => p.id === playerId);
  if (!player) return null;
  return panelData(session, playerId, note);
}

async function handlePanelAction(interaction, session, run) {
  const playerId = interaction.user.id;
  const player = session.game?.players.find((p) => p.id === playerId);
  if (!player) {
    await replyEphemeral(interaction, '⚠️ You are not in this game.');
    return;
  }
  if (session.status !== 'playing') {
    await interaction.update({ embeds: [handEmbed(session, playerId, 'The game has ended.')], components: [] }).catch(() => {});
    return;
  }

  let note = null;
  try {
    note = await run(playerId);
  } catch (error) {
    if (error instanceof engine.GameError) note = `⚠️ ${error.message}`;
    else throw error;
  }

  const payload = openPanelPayload(session, playerId, note);
  await interaction.update(payload).catch(() => {});
  await updateBoard(session, interaction.channel);
  await finishIfWon(session, interaction.channel);
  scheduleBot(session, interaction.channel);
}

async function handleInteraction(client, interaction) {
  if (!interaction.inGuild()) return;
  const id = interaction.customId;
  if (!id.startsWith('uno:')) return;

  const session = getSession(interaction.channelId);
  if (!session) {
    await replyEphemeral(interaction, '⚠️ There is no UNO game in this channel.');
    return;
  }

  if (id === 'uno:join' || id === 'uno:leave' || id === 'uno:start') {
    if (session.status !== 'lobby') {
      await replyEphemeral(interaction, '⚠️ This lobby is already closed.');
      return;
    }
    if (id === 'uno:join') {
      try {
        addPlayer(session, { id: interaction.user.id, name: interaction.user.username });
      } catch (error) {
        await replyEphemeral(interaction, `⚠️ ${error.message}`);
        return;
      }
      await refreshLobby(session, `${interaction.user.username} joined`);
      await replyEphemeral(interaction, '✅ You joined the lobby!');
      return;
    }
    if (id === 'uno:leave') {
      const index = session.players.findIndex((p) => p.id === interaction.user.id);
      if (index === -1) {
        await replyEphemeral(interaction, '⚠️ You are not in this lobby.');
        return;
      }
      session.players.splice(index, 1);
      if (!session.players.length) {
        dropSession(session);
        await interaction.update({ embeds: [lobbyEmbed(session, 'Lobby closed')], components: [] }).catch(() => {});
        return;
      }
      if (session.hostId === interaction.user.id) {
        session.hostId = session.players[0].id;
        session.hostName = session.players[0].name;
      }
      await refreshLobby(session, `${interaction.user.username} left`);
      await replyEphemeral(interaction, '🚪 You left the lobby.');
      return;
    }
    // start
    if (interaction.user.id !== session.hostId) {
      await replyEphemeral(interaction, '⚠️ Only the host can start the game.');
      return;
    }
    if (session.players.length < engine.MIN_PLAYERS) {
      await replyEphemeral(interaction, `⚠️ You need at least ${engine.MIN_PLAYERS} players. Add a bot with \`!uno bot\`.`);
      return;
    }
    session.game = engine.createGame(session.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot })));
    session.status = 'playing';
    await replyEphemeral(interaction, '🎉 Game on! Use **🃏 My Hand** to play.');
    await updateBoard(session, interaction.channel);
    scheduleBot(session, interaction.channel);
    return;
  }

  if (!session.game) {
    await replyEphemeral(interaction, '⚠️ There is no game running here.');
    return;
  }

  switch (true) {
    case id === 'uno:hand': {
      const player = session.game.players.find((p) => p.id === interaction.user.id);
      if (!player) {
        await replyEphemeral(interaction, '⚠️ You are not in this game.');
        return;
      }
      await interaction.reply({ ...panelData(session, player.id), flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    case id === 'uno:refresh' && isPanel(interaction):
      await handlePanelAction(interaction, session, async () => null);
      return;
    case id === 'uno:draw' && isPanel(interaction):
      await handlePanelAction(interaction, session, async (playerId) => {
        const out = applyMove(session, playerId, { type: 'draw' });
        return out.private;
      });
      return;
    case id === 'uno:pass' && isPanel(interaction):
      await handlePanelAction(interaction, session, async (playerId) => {
        applyMove(session, playerId, { type: 'pass' });
        return 'You passed.';
      });
      return;
    case id === 'uno:draw':
      await handleBoardAction(interaction, session, () => applyMove(session, interaction.user.id, { type: 'draw' }));
      return;
    case id === 'uno:pass':
      await handleBoardAction(interaction, session, () => applyMove(session, interaction.user.id, { type: 'pass' }));
      return;
    case id === 'uno:endgame': {
      if (interaction.user.id !== session.hostId) {
        await replyEphemeral(interaction, '⚠️ Only the host can end the game.');
        return;
      }
      dropSession(session);
      await interaction.update({ embeds: [boardEmbed(session, 'Game ended by the host.')], components: [] }).catch(() => {});
      await interaction.channel.send('🏁 The UNO game was ended by the host.').catch(() => {});
      return;
    }
    case id === 'uno:select': {
      const index = Number.parseInt(interaction.values?.[0], 10);
      const playerId = interaction.user.id;
      const player = session.game.players.find((p) => p.id === playerId);
      const card = player?.hand[index];
      if (!card) {
        await replyEphemeral(interaction, '⚠️ That card is no longer in your hand.');
        return;
      }
      if (engine.isWild(card)) {
        const payload = { embeds: [handEmbed(session, playerId, `Choose a color for ${cardFace(card)}`)], components: colorComponents(index) };
        await interaction.update(payload).catch(() => {});
        return;
      }
      await handlePanelAction(interaction, session, async () => {
        applyMove(session, playerId, { type: 'play', index });
        return `You played ${cardFace(card)}.`;
      });
      return;
    }
    case id.startsWith('uno:color:'): {
      const [, , rawIndex, color] = id.split(':');
      const index = Number.parseInt(rawIndex, 10);
      const playerId = interaction.user.id;
      await handlePanelAction(interaction, session, async () => {
        applyMove(session, playerId, { type: 'play', index, color });
        return `You played a wild and chose ${COLOR_NAME[color] || color}.`;
      });
      return;
    }
    default:
      await replyEphemeral(interaction, '⚠️ That action is not available.');
  }
}

async function handleBoardAction(interaction, session, run) {
  if (session.status !== 'playing' || !session.game) {
    await replyEphemeral(interaction, '⚠️ There is no game running here.');
    return;
  }
  if (!session.game.players.some((p) => p.id === interaction.user.id)) {
    await replyEphemeral(interaction, '⚠️ You are not in this game.');
    return;
  }
  let out;
  try {
    out = run();
  } catch (error) {
    if (error instanceof engine.GameError) {
      await replyEphemeral(interaction, `⚠️ ${error.message}`);
      return;
    }
    throw error;
  }
  await replyEphemeral(interaction, out.private || out.text || 'Done.');
  await updateBoard(session, interaction.channel);
  await finishIfWon(session, interaction.channel);
  scheduleBot(session, interaction.channel);
}

function registerUno(client) {
  client.on(Events.MessageCreate, (message) => {
    handleUnoMessage(client, message).catch((error) => console.error('[uno] message handler:', error));
  });
  client.on(Events.InteractionCreate, (interaction) => {
    Promise.resolve()
      .then(() => handleInteraction(client, interaction))
      .catch((error) => {
        console.error('[uno] interaction handler:', error);
        replyEphemeral(interaction, '⚠️ Something went wrong with that action.').catch(() => {});
      });
  });
}

module.exports = {
  registerUno,
  handleUnoMessage,
  handleInteraction,
  sessions,
  getSession,
  isUnoCommand,
  helpEmbed,
};
