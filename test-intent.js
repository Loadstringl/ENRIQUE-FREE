require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');

async function probe(label, intents) {
  return new Promise((resolve) => {
    const client = new Client({ intents });
    let done = false;
    const finish = (msg) => { if (done) return; done = true; console.log(`${label}: ${msg}`); client.destroy(); resolve(); };

    client.on(Events.Error, (e) => finish('ERROR -> ' + e.message.split('\n')[0]));
    client.on(Events.ShardError, (e) => finish('SHARD ERROR -> ' + (e.message || e)));
    client.once(Events.ClientReady, () => {
      const detail = [...client.guilds.cache.values()]
        .map((g) => `${g.name}: members.cache=${g.members.cache.size}/${g.memberCount}`)
        .join(' | ');
      finish('ready ✔  ' + detail);
    });
    client.login(process.env.DISCORD_TOKEN).catch((e) => finish('LOGIN FAILED -> ' + e.message.split('\n')[0]));
    setTimeout(() => finish('超时无响应'), 20000);
  });
}

(async () => {
  await probe('带 GuildMembers 意图', [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]);
  await probe('不带 GuildMembers 意图', [GatewayIntentBits.Guilds]);
})();
