require('dotenv').config();
const { Client, GatewayIntentBits, Events, PermissionFlagsBits } = require('discord.js');

const CHANNEL_ID = '1548481245682466826';
const MESSAGE = [
  '@everyone',
  '```NEW BEST SETTINGS',
  'Auto Parry Settings: 20',
  'Auto Spam Settings: 2.3',
  'Manual Spam: On```',
].join('\n');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  const channel = await client.channels.fetch(CHANNEL_ID);
  const me = channel.guild.members.me;

  console.log('频道:', channel.guild.name, '/', '#' + channel.name);
  console.log('机器人可 @everyone:', me.permissions.has(PermissionFlagsBits.MentionEveryone));

  const sent = await channel.send(MESSAGE);
  console.log('发送成功 -> 消息ID:', sent.id);

  client.destroy();
  process.exit(0);
});

client.on(Events.Error, (e) => { console.error('错误:', e.message); process.exit(1); });

client.login(process.env.DISCORD_TOKEN);
