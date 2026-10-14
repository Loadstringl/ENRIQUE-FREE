require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { buildWelcomeEmbed, sendWelcome } = require('./welcome');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  const guild = [...client.guilds.cache.values()].find((g) => g.name === 'SCRIPT');
  const member = await guild.members.fetchMe();

  console.log('--- 生成的 embed (模拟新成员) ---');
  console.log(JSON.stringify(buildWelcomeEmbed(member).toJSON(), null, 2));

  console.log('\n--- 真实发送测试 (发送后删除) ---');
  const sent = await sendWelcome(client, member, { channelNames: ['welcome'] });
  if (sent) {
    console.log(`已发送到 #${sent.channel.name}:`, sent.id);
    await new Promise((r) => setTimeout(r, 2500));
    await sent.delete().catch(() => {});
    console.log('测试消息已删除');
  }

  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
