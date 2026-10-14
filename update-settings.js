require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');

const CHANNEL_ID = '1548481245682466826';
const OLD_MESSAGE_ID = '1555226493997682699';
const MESSAGE = [
  '@everyone',
  '```NEW BEST SETTINGS',
  'AUTO PARRY SETTINGS:21',
  'AUTO SPAM SETTINGS:2',
  'MANUAL SPAM:ON```',
].join('\n');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  const channel = await client.channels.fetch(CHANNEL_ID);
  console.log('频道:', channel.guild.name, '/', '#' + channel.name);

  try {
    const old = await channel.messages.fetch(OLD_MESSAGE_ID);
    await old.delete();
    console.log('已删除旧消息:', OLD_MESSAGE_ID);
  } catch (error) {
    console.warn('删除旧消息失败:', error.message);
  }

  const sent = await channel.send(MESSAGE);
  console.log('新消息已发送 -> 消息ID:', sent.id);

  client.destroy();
  process.exit(0);
});

client.on(Events.Error, (e) => { console.error('错误:', e.message); process.exit(1); });

client.login(process.env.DISCORD_TOKEN);
