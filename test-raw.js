require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.ws.on('GUILD_CREATE', (d) => {
  console.log(`GUILD_CREATE 收到原始包: ${d.name}`);
  console.log('  包含 members 字段:', Object.prototype.hasOwnProperty.call(d, 'members'));
  console.log('  members 数量:', Array.isArray(d.members) ? d.members.length : 'N/A');
  console.log('  member_count:', d.member_count);
  console.log('  presences 字段存在:', Object.prototype.hasOwnProperty.call(d, 'presences'));
});

client.once(Events.ClientReady, () => {
  console.log('\nREADY:', client.user.tag);
  setTimeout(() => { client.destroy(); process.exit(0); }, 6000);
});

client.login(process.env.DISCORD_TOKEN);
