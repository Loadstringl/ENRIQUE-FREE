require('dotenv').config();

const { Client, GatewayIntentBits, Events, ActivityType } = require('discord.js');
const { replyWithScripts } = require('./scriptAi');
const { registerWelcome } = require('./welcome');

const token = process.env.DISCORD_TOKEN;
const AI_CHANNEL_NAMES = (process.env.SCRIPT_AI_CHANNEL_NAMES || 'script-ai')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const RESULT_LIMIT = Number(process.env.SCRIPT_AI_RESULT_LIMIT || 3);
const MAX_QUERY_LENGTH = 100;

const WELCOME_CHANNEL_NAMES = (process.env.WELCOME_CHANNEL_NAMES || 'welcome')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);


if (!token) {
  console.error('Missing DISCORD_TOKEN, please configure .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const busyChannels = new Set();

registerWelcome(client, {
  channelNames: WELCOME_CHANNEL_NAMES,
  ...(process.env.WELCOME_TITLE ? { title: process.env.WELCOME_TITLE } : {}),
  ...(process.env.WELCOME_DESCRIPTION ? { description: process.env.WELCOME_DESCRIPTION } : {}),
  ...(process.env.WELCOME_FOOTER ? { footer: process.env.WELCOME_FOOTER } : {}),
});

function isAiChannel(channel) {
  return channel?.name && AI_CHANNEL_NAMES.includes(channel.name.toLowerCase());
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as: ${readyClient.user.tag} (${readyClient.user.id})`);
  console.log(`Auto-search channels: ${AI_CHANNEL_NAMES.map((n) => '#' + n).join(', ')}`);
  console.log(`Result limit: ${RESULT_LIMIT}`);
  console.log(`Welcome channels: ${WELCOME_CHANNEL_NAMES.map((n) => '#' + n).join(', ')}`);
  console.log(`Guilds (${readyClient.guilds.cache.size}):`);
  for (const guild of readyClient.guilds.cache.values()) {
    const hasAi = guild.channels.cache.some((c) => isAiChannel(c));
    console.log(`  - ${guild.name} [${guild.id}]${hasAi ? '  OK has search channel' : ''}`);
  }

  readyClient.user.setPresence({
    status: 'online',
    activities: [{ name: 'ENRIQUE BOT', type: ActivityType.Watching }],
  });
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.inGuild()) return;
  if (!isAiChannel(message.channel)) return;

  const query = message.content.trim();
  if (!query) return;
  if (query.length > MAX_QUERY_LENGTH) return;

  if (busyChannels.has(message.channelId)) {
    await message.reply('⏳ Another search is still running, please wait.').catch(() => {});
    return;
  }

  busyChannels.add(message.channelId);
  try {
    await replyWithScripts(message, query, { limit: RESULT_LIMIT });
  } catch (error) {
    console.error('[script-ai] handler error:', error);
  } finally {
    busyChannels.delete(message.channelId);
  }
});

client.on(Events.Error, (error) => console.error('Client error:', error.message));
client.on(Events.Disconnect, () => console.warn('Disconnected, reconnecting in 5s...'));
client.on(Events.Reconnecting, () => console.log('Reconnecting...'));

process.on('SIGINT', () => {
  console.log('\nLogging out...');
  client.destroy();
  process.exit(0);
});

console.log('Connecting to Discord...');
client.login(token).catch((error) => {
  console.error('Login failed:', error.message);
  process.exit(1);
});
