require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  for (const guild of client.guilds.cache.values()) {
    console.log(`\n=== ${guild.name} [${guild.id}] ===`);
    const channels = await guild.channels.fetch();
    for (const ch of channels.values()) {
      if (!ch) continue;
      console.log(`  [${ch.type}] #${ch.name}  (${ch.id})`);
    }
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
