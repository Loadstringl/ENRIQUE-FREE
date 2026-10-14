require('dotenv').config();
const { Client, GatewayIntentBits, Events, ApplicationCommandType } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const SCRIPT_AI_CHANNELS = ['1559257064315027548', '1528071022786510968'];

client.once(Events.ClientReady, async () => {
  console.log('== 全局命令 ==');
  try {
    const global = await client.application.commands.fetch();
    if (!global.size) console.log('  (无)');
    for (const c of global.values()) console.log(`  /${c.name} | type=${c.type} | ${c.description ?? ''}`);
  } catch (e) { console.log('  读取失败:', e.message); }

  for (const guild of client.guilds.cache.values()) {
    console.log(`\n== ${guild.name} 服务器命令 ==`);
    try {
      const cmds = await guild.commands.fetch();
      if (!cmds.size) console.log('  (无)');
      for (const c of cmds.values()) console.log(`  /${c.name} | type=${c.type} | ${c.description ?? ''}`);
    } catch (e) { console.log('  读取失败:', e.message); }
  }

  console.log('\n== script-ai 频道最近消息 ==');
  for (const id of SCRIPT_AI_CHANNELS) {
    try {
      const ch = await client.channels.fetch(id);
      console.log(`\n--- #${ch.name} (${id}) | guild: ${ch.guild?.name} ---`);
      const msgs = await ch.messages.fetch({ limit: 20 });
      if (!msgs.size) console.log('  (无消息)');
      for (const m of [...msgs.values()].reverse()) {
        const author = m.author.bot ? `[BOT] ${m.author.username}` : m.author.username;
        const content = (m.content || '(无文本内容)').replace(/\n/g, ' | ').slice(0, 160);
        console.log(`  ${new Date(m.createdTimestamp).toISOString()} <${author}> ${content}`);
      }
    } catch (e) { console.log('  读取失败:', e.message); }
  }

  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
