'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');

const { COLORS, topCard, currentPlayer, playableIndices, isWild } = require('./engine');

const COLOR_EMOJI = { red: '🔴', yellow: '🟡', green: '🟢', blue: '🔵', wild: '🌈' };
const COLOR_NAME = { red: 'Red', yellow: 'Yellow', green: 'Green', blue: 'Blue' };
const FACE = {
  skip: 'Skip 🚫',
  reverse: 'Reverse 🔄',
  draw2: 'Draw Two +2',
  wild: 'Wild 🎨',
  wild4: 'Wild Draw Four +4',
};

const MAX_HAND_LINES = 28;
const MAX_SELECT = 25;

function cardFace(card) {
  if (!card) return '—';
  const emoji = COLOR_EMOJI[card.color] || '🌈';
  const value = FACE[card.value] || card.value;
  return `${emoji} ${value}`;
}

function playerLabel(player) {
  if (!player) return 'someone';
  return player.isBot ? `🤖 ${player.name}` : `<@${player.id}>`;
}

function handList(hand) {
  if (!hand.length) return '_empty_';
  const shown = hand.slice(0, MAX_HAND_LINES);
  const lines = shown.map((card, index) => `\`${index + 1}\` ${cardFace(card)}`);
  if (hand.length > MAX_HAND_LINES) lines.push(`…and ${hand.length - MAX_HAND_LINES} more`);
  return lines.join('\n');
}

function activeColorLabel(game) {
  return `${COLOR_EMOJI[game.currentColor]} ${COLOR_NAME[game.currentColor] || game.currentColor}`;
}

function lobbyEmbed(session, note) {
  const roster = session.players.length
    ? session.players.map((p) => `• ${playerLabel(p)}`).join('\n')
    : '_nobody yet — be the first to join!_';

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🃏 UNO — Lobby')
    .setDescription('Press **Join** to take a seat. The host presses **Start** once at least 2 players are ready.')
    .addFields({ name: `Players (${session.players.length})`, value: roster });

  if (note) embed.setFooter({ text: note });
  else embed.setFooter({ text: `Host: ${session.hostName}` });
  return embed;
}

function boardEmbed(session, note) {
  const game = session.game;
  const top = topCard(game);
  const turn = game.status === 'playing' ? currentPlayer(game) : null;
  const arrow = game.direction === 1 ? '↻ clockwise' : '↺ counter-clockwise';

  const roster = game.players
    .map((p) => `${turn && turn.id === p.id ? '▶️' : '•'} ${playerLabel(p)} — **${p.hand.length}**`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor(game.status === 'finished' ? 0xfee75c : 0x57f287)
    .setTitle('🃏 UNO')
    .addFields(
      { name: 'Top card', value: `${cardFace(top)}\nActive color: ${activeColorLabel(game)}`, inline: true },
      { name: 'Order', value: `${arrow}\nDeck: **${game.deck.length}** left`, inline: true },
      { name: `Players (${game.players.length})`, value: roster },
    );

  if (game.status === 'finished') {
    const winner = game.players.find((p) => p.id === game.winnerId);
    embed.addFields({ name: '🏆 Winner', value: playerLabel(winner) });
    embed.setDescription('Game over! Type `!uno` to start a new lobby.');
  } else {
    embed.setDescription(
      game.drawnThisTurn === turn.id
        ? `**${turn.name}** drew a card — play it or press **Pass**.`
        : `It is ${playerLabel(turn)}'s turn.`,
    );
  }

  embed.setFooter({ text: note || 'Use !uno hand for a private view, or the buttons below.' });
  return embed;
}

function handEmbed(session, playerId, note) {
  const game = session.game;
  const player = game.players.find((p) => p.id === playerId);
  const top = topCard(game);
  const isTurn = game.status === 'playing' && currentPlayer(game).id === playerId;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🃏 Your hand — ${player.hand.length} card${player.hand.length === 1 ? '' : 's'}`)
    .setDescription(handList(player.hand))
    .addFields(
      { name: 'Top card', value: cardFace(top), inline: true },
      { name: 'Active color', value: activeColorLabel(game), inline: true },
    );

  if (game.status !== 'playing') embed.setFooter({ text: 'The game has ended.' });
  else if (!isTurn) embed.setFooter({ text: note || 'Waiting for your turn…' });
  else embed.setFooter({ text: note || 'Pick a card below to play it.' });
  return embed;
}

function colorComponents(index) {
  const row = new ActionRowBuilder();
  for (const color of COLORS) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`uno:color:${index}:${color}`)
        .setLabel(COLOR_NAME[color])
        .setEmoji(COLOR_EMOJI[color])
        .setStyle(ButtonStyle.Primary),
    );
  }
  return [row];
}

function handComponents(session, playerId) {
  const game = session.game;
  const player = game.players.find((p) => p.id === playerId);
  const rows = [];

  const isTurn = game.status === 'playing' && currentPlayer(game).id === playerId;
  if (isTurn) {
    const playable = playableIndices(game, playerId).slice(0, MAX_SELECT);
    if (playable.length) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId('uno:select')
        .setPlaceholder('Play a card…')
        .addOptions(
          playable.map((i) => {
            const card = player.hand[i];
            const option = new StringSelectMenuOptionBuilder()
              .setLabel(`${i + 1}. ${cardFace(card).replace(/[`*_|]/g, '')}`.slice(0, 100))
              .setValue(String(i));
            if (isWild(card)) option.setDescription('You will pick a color');
            return option;
          }),
        );
      rows.push(new ActionRowBuilder().addComponents(menu));
    }

    const controls = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('uno:draw')
        .setLabel('Draw')
        .setEmoji('🎴')
        .setStyle(ButtonStyle.Success)
        .setDisabled(game.drawnThisTurn === playerId),
    );
    if (game.drawnThisTurn === playerId) {
      controls.addComponents(
        new ButtonBuilder().setCustomId('uno:pass').setLabel('Pass').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
      );
    }
    controls.addComponents(
      new ButtonBuilder().setCustomId('uno:refresh').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    );
    rows.push(controls);
  } else {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('uno:refresh').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      ),
    );
  }

  return rows;
}

function lobbyComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('uno:join').setLabel('Join').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('uno:leave').setLabel('Leave').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('uno:start').setLabel('Start').setEmoji('▶️').setStyle(ButtonStyle.Primary),
    ),
  ];
}

function boardComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('uno:hand').setLabel('My Hand').setEmoji('🃏').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('uno:draw').setLabel('Draw').setEmoji('🎴').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('uno:pass').setLabel('Pass').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('uno:endgame').setLabel('End').setEmoji('🏁').setStyle(ButtonStyle.Danger),
    ),
  ];
}

function panelData(session, playerId, note) {
  return {
    embeds: [handEmbed(session, playerId, note)],
    components: handComponents(session, playerId),
  };
}

function helpEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🃏 How to play UNO')
    .setDescription('Match the top card by **color** or **number**, or play a Wild. First to empty their hand wins!')
    .addFields(
      {
        name: 'Commands',
        value: [
          '`!uno` — open a lobby',
          '`!uno join` / `!uno leave` — join or leave the lobby',
          '`!uno bot` — add a bot opponent',
          '`!uno start` — host starts the game',
          '`!uno play <n> [color]` — play the nth card (color needed for Wild)',
          '`!uno draw` — draw a card, then play it or `!uno pass`',
          '`!uno hand` — privately view your hand (DM)',
          '`!uno end` — host ends the game',
        ].join('\n'),
      },
      {
        name: 'Cards',
        value: '🚫 Skip · 🔄 Reverse · +2 Draw Two · 🎨 Wild · +4 Wild Draw Four',
      },
      { name: 'Tip', value: 'Prefer buttons? On the board press **🃏 My Hand** to open a private panel.' },
    );
}

module.exports = {
  COLOR_EMOJI,
  COLOR_NAME,
  cardFace,
  playerLabel,
  handList,
  lobbyEmbed,
  boardEmbed,
  handEmbed,
  lobbyComponents,
  boardComponents,
  handComponents,
  colorComponents,
  panelData,
  helpEmbed,
};
