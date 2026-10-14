require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { searchScripts } = require('./scriptSearch');

const CHANNEL_ID = '1559257064315027548';
const QUERY = 'blade ball';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  const channel = await client.channels.fetch(CHANNEL_ID);
  const sent = [];

  try {
    const status = await channel.send(`🔍 正在搜索 **${QUERY}** ...`);
    sent.push(status);

    const { scripts } = await searchScripts(QUERY, { page: 1 });
    const results = scripts.slice(0, 3);
    await status.edit(`🔎 **${QUERY}** — 找到 ${results.length} 个脚本`);

    for (const [i, s] of results.entries()) {
      sent.push(await channel.send(`📱 **Script ${i + 1} (Mobile):**\n\`${s.loadstring}\``));
      await new Promise((r) => setTimeout(r, 400));
      sent.push(await channel.send(`💻 **Script ${i + 1} (PC):**\n\`\`\`lua\n${s.loadstring}\n\`\`\``));
      await new Promise((r) => setTimeout(r, 400));
    }

    console.log(`发送成功 ${sent.length} 条消息`);
  } catch (e) {
    console.error('发送失败:', e.message);
  } finally {
    await new Promise((r) => setTimeout(r, 1500));
    for (const m of sent) { await m.delete().catch(() => {}); }
    console.log(`已清理 ${sent.length} 条测试消息`);
    client.destroy();
    process.exit(0);
  }
});

client.login(process.env.DISCORD_TOKEN);
