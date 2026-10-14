require('dotenv').config();
const { Client, GatewayIntentBits, Events, ChannelType } = require('discord.js');

const GUILD_ID = '1515349136197550212'; // ENRIQUE HUB
const NAME = 'script-ai';
const DRY_RUN = process.env.DRY_RUN === '1';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  const guild = await client.guilds.fetch(GUILD_ID);
  console.log('服务器:', guild.name);

  const existing = guild.channels.cache.find((c) => c.name === NAME);
  if (existing) {
    console.log(`已存在同名频道 #${existing.name} (${existing.id})，跳过创建。`);
    client.destroy();
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log(`[DRY RUN] 将创建文本频道 #${NAME}`);
    client.destroy();
    process.exit(0);
  }

  const channel = await guild.channels.create({
    name: NAME,
    type: ChannelType.GuildText,
    reason: 'Recreate script-ai channel',
  });

  console.log(`创建成功 -> #${channel.name} (${channel.id})`);
  console.log('频道链接: https://discord.com/channels/' + GUILD_ID + '/' + channel.id);

  client.destroy();
  process.exit(0);
});

client.on(Events.Error, (e) => { console.error('错误:', e.message); process.exit(1); });

client.login(process.env.DISCORD_TOKEN);
