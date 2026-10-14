const { EmbedBuilder, Events, ChannelType } = require('discord.js');

const DEFAULTS = {
  channelNames: ['welcome'],
  title: 'Welcome to {server}!',
  description: 'Hey {user}, glad to have you here!\n\nYou are our **#{memberCount}** member. Enjoy your stay!',
  color: 0x57f287,
  footer: '{server} • {memberCount} members',
};

function fill(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

function findWelcomeChannel(guild, names) {
  return guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildText && names.includes(channel.name.toLowerCase()),
  );
}

function buildWelcomeEmbed(member, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const { guild } = member;
  const createdAt = Math.floor(member.user.createdTimestamp / 1000);

  const vars = {
    user: `<@${member.id}>`,
    username: member.user.username,
    server: guild.name,
    memberCount: guild.memberCount,
    userTag: member.user.tag ?? member.user.username,
  };

  const embed = new EmbedBuilder()
    .setColor(cfg.color)
    .setTitle(fill(cfg.title, vars))
    .setDescription(fill(cfg.description, vars))
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'Account created', value: `<t:${createdAt}:R>`, inline: true },
      { name: 'Member count', value: String(guild.memberCount), inline: true },
    );

  const rulesChannel = guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildText && channel.name.toLowerCase() === 'rules',
  );
  if (rulesChannel) {
    embed.addFields({ name: 'Rules', value: `<#${rulesChannel.id}>`, inline: true });
  }

  const icon = guild.iconURL({ size: 256 });
  if (icon) embed.setAuthor({ name: guild.name, iconURL: icon });

  return embed
    .setFooter({ text: fill(cfg.footer, vars) })
    .setTimestamp();
}

async function sendWelcome(client, member, options = {}) {
  const names = (options.channelNames ?? DEFAULTS.channelNames).map((n) => n.toLowerCase());
  const channel = findWelcomeChannel(member.guild, names);
  if (!channel) {
    console.warn(`[welcome] no welcome channel found in ${member.guild.name}`);
    return null;
  }

  const embed = buildWelcomeEmbed(member, options);
  return channel.send({ content: `<@${member.id}>`, embeds: [embed] });
}

function registerWelcome(client, options = {}) {
  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      await sendWelcome(client, member, options);
    } catch (error) {
      console.error('[welcome] failed to send welcome message:', error.message);
    }
  });
}

module.exports = { registerWelcome, sendWelcome, buildWelcomeEmbed, findWelcomeChannel, DEFAULTS };
