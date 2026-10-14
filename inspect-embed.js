require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');

const CH = '1527573752127160443'; // SCRIPT #welcome

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once(Events.ClientReady, async () => {
  const channel = await client.channels.fetch(CH);
  const msgs = await channel.messages.fetch({ limit: 5 });
  for (const m of [...msgs.values()].reverse()) {
    console.log('='.repeat(70));
    console.log('author:', m.author.tag, '| id:', m.id, '|', new Date(m.createdTimestamp).toISOString());
    console.log('content:', JSON.stringify(m.content));
    for (const e of m.embeds) {
      console.log(JSON.stringify(e.toJSON(), null, 2));
    }
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
