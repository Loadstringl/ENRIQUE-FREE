require('dotenv').config();
const { Client, GatewayIntentBits, Events, ChannelType } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once(Events.ClientReady, async () => {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    console.log(`\n=== ${guild.name} (成员 ${guild.memberCount}) ===`);
    const members = await guild.members.fetch({ limit: 1000 }).catch(() => null);
    if (!members) { console.log('  fetch 失败'); continue; }
    const recent = [...members.values()]
      .filter((m) => now - m.joinedTimestamp < 1000 * 60 * 60 * 24 * 14)
      .sort((a, b) => b.joinedTimestamp - a.joinedTimestamp)
      .slice(0, 10);
    console.log('  最近 14 天加入:');
    for (const m of recent) {
      console.log(`    ${new Date(m.joinedTimestamp).toISOString()}  ${m.user.username} (${m.user.bot ? 'BOT' : 'user'})`);
    }

    const wc = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name.toLowerCase() === 'welcome');
    console.log('  #welcome: ' + (wc ? wc.id : '不存在'));
    if (wc) {
      const msgs = await wc.messages.fetch({ limit: 6 }).catch(() => null);
      if (msgs?.size) {
        console.log('  频道最近消息:');
        for (const m of [...msgs.values()].reverse()) {
          console.log(`    ${new Date(m.createdTimestamp).toISOString()} <${m.author.bot ? '[BOT] ' : ''}${m.author.username}> ${(m.content || '(embed)').replace(/\n/g,' ').slice(0,80)}`);
        }
      }
    }
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
