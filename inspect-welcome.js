require('dotenv').config();
const { Client, GatewayIntentBits, Events, ChannelType } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once(Events.ClientReady, async () => {
  for (const guild of client.guilds.cache.values()) {
    console.log(`\n=== ${guild.name} ===`);
    console.log('  成员数:', guild.memberCount, '| 系统频道:', guild.systemChannel?.name ?? '无');
    const welcome = guild.channels.cache.find((c) => c.name === 'welcome' && c.type === ChannelType.GuildText);
    if (!welcome) { console.log('  未找到 #welcome 文本频道'); continue; }
    console.log(`  #welcome (${welcome.id}) topic: ${welcome.topic ?? '(无)'}`);
    const msgs = await welcome.messages.fetch({ limit: 5 }).catch(() => null);
    if (!msgs) { console.log('    无法读取消息'); continue; }
    if (!msgs.size) console.log('    (无消息)');
    for (const m of [...msgs.values()].reverse()) {
      console.log(`    ${new Date(m.createdTimestamp).toISOString()} <${m.author.bot ? '[BOT] ' : ''}${m.author.username}> ${(m.content || '(embed)').replace(/\n/g,' ').slice(0,120)}`);
    }
    console.log('    可发送消息:', welcome.permissionsFor(guild.members.me)?.has('SendMessages'));
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
