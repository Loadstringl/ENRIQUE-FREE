require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { replyWithScripts } = require('./scriptAi');

const CHANNEL_ID = '1559257064315027548'; // ENRIQUE HUB #script-ai (empty)

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  const channel = await client.channels.fetch(CHANNEL_ID);
  const sent = [];

  try {
    // 直接走生产代码路径
    await replyWithScripts({ channel }, 'blade ball', { limit: 3, collect: sent });
    console.log(`生产代码路径发送 ${sent.length} 条消息，全部成功。`);
    console.log('消息类型: ' + sent.map((m) => (m.embeds.length ? 'embed' : 'text')).join(', '));
  } catch (e) {
    console.error('发送失败:', e.message);
  } finally {
    await new Promise((r) => setTimeout(r, 2000));
    for (const m of sent) await m.delete().catch(() => {});
    console.log(`已清理 ${sent.length} 条测试消息。`);
    client.destroy();
    process.exit(0);
  }
});

client.login(process.env.DISCORD_TOKEN);
