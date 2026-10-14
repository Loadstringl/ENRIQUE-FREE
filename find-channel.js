require('dotenv').config();
const { Client, GatewayIntentBits, Events, ChannelType } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  for (const guild of client.guilds.cache.values()) {
    console.log(`\n[服务器] ${guild.name}`);
    const channels = await guild.channels.fetch();
    for (const ch of channels.values()) {
      if (!ch || ch.type !== ChannelType.GuildText) continue;
      const match = ch.name.includes('最佳') || ch.name.includes('设置');
      console.log(`  ${match ? '>>> 匹配:' : '      '} #${ch.name}  (${ch.id})`);
    }
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
