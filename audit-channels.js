require('dotenv').config();
const { Client, GatewayIntentBits, Events, AuditLogEvent } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  for (const guild of client.guilds.cache.values()) {
    console.log(`\n=== ${guild.name} ===`);
    try {
      const logs = await guild.fetchAuditLogs({ limit: 25 });
      const entries = [...logs.entries.values()];
      if (!entries.length) { console.log('  (无审计日志)'); continue; }
      for (const e of entries) {
        const types = Object.fromEntries(Object.entries(AuditLogEvent).map(([k, v]) => [v, k]));
        console.log(`  ${new Date(e.createdTimestamp).toISOString()} | ${types[e.action] ?? e.action} | by ${e.executor?.tag ?? '?'} | target: ${e.target?.name ?? e.target?.id ?? '?'} (${e.targetId})`);
      }
    } catch (err) {
      console.log('  无法读取审计日志:', err.message);
    }
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
