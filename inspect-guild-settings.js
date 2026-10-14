require('dotenv').config();
const { Client, GatewayIntentBits, Events, ChannelType } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  for (const guild of client.guilds.cache.values()) {
    console.log(`\n=== ${guild.name} (${guild.id}) ===`);
    console.log('  系统频道:', guild.systemChannel ? `#${guild.systemChannel.name} (${guild.systemChannel.id})` : '未设置');
    console.log('  成员数:', guild.memberCount);
    const flags = guild.systemChannelFlags?.toArray?.() ?? [];
    console.log('  系统频道标识:', flags.length ? flags.join(', ') : '(无)');
    console.log('  -> Discord 自带入群消息:', flags.includes('SuppressJoinNotifications') ? '已关闭' : '仍然是开启的');

    const wc = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name.toLowerCase() === 'welcome');
    console.log('  #welcome:', wc ? `${wc.id}` : '不存在');
    if (wc) {
      const perms = wc.permissionsFor(guild.members.me);
      console.log('    机器人权限: SendMessages=' + perms.has('SendMessages') + ' EmbedLinks=' + perms.has('EmbedLinks') + ' MentionEveryone=' + perms.has('MentionEveryone'));
    }
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
