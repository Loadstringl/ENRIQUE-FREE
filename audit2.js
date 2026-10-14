require('dotenv').config();
const { Client, GatewayIntentBits, Events, AuditLogEvent, PermissionFlagsBits } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  for (const guild of client.guilds.cache.values()) {
    const me = guild.members.me;
    const canView = me.permissions.has(PermissionFlagsBits.ViewAuditLog);
    console.log(`\n=== ${guild.name} ===`);
    console.log('  可查看审计日志:', canView, '| 可管理频道:', me.permissions.has(PermissionFlagsBits.ManageChannels));

    for (const action of [AuditLogEvent.ChannelDelete, AuditLogEvent.ChannelCreate]) {
      try {
        const logs = await guild.fetchAuditLogs({ limit: 50, type: action });
        for (const e of logs.entries.values()) {
          console.log(`  ${action === AuditLogEvent.ChannelDelete ? 'DELETE' : 'CREATE'} | ${new Date(e.createdTimestamp).toISOString()} | ${e.target?.name ?? '?'} (${e.targetId})`);
        }
      } catch (err) {
        console.log(`  查询失败: ${err.message}`);
      }
    }
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
