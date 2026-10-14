const { EmbedBuilder } = require('discord.js');
const { fetchScriptDetail } = require('./scriptSearch');
const { pickResults } = require('./rotation');

const DESCRIPTION_LIMIT = 400;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function truncate(text, limit) {
  const clean = String(text).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit).trimEnd()}…`;
}

function statusLabel(script) {
  if (script.patched) return 'Patched';
  if (script.keyless) return 'Keyless';
  if (script.key) return 'Key required';
  return 'Free';
}

function buildEmbed(script, index, detail) {
  const embed = new EmbedBuilder()
    .setColor(script.patched ? 0xed4245 : script.key ? 0xfee75c : 0x57f287)
    .setTitle(`Script ${index} — ${truncate(script.title, 200)}`)
    .setURL(`https://scriptblox.com/script/${script.slug}`)
    .setDescription(detail?.description ? truncate(detail.description, DESCRIPTION_LIMIT) : 'No description provided.')
    .addFields(
      { name: 'Status', value: statusLabel(script), inline: true },
      { name: 'Views', value: script.views.toLocaleString('en-US'), inline: true },
      { name: 'Likes', value: script.likes.toLocaleString('en-US'), inline: true },
    );

  if (script.game) embed.addFields({ name: 'Game', value: script.game, inline: true });
  if (detail?.owner) embed.addFields({ name: 'Author', value: detail.owner, inline: true });
  if (script.verified) embed.addFields({ name: 'Verified', value: 'Yes', inline: true });
  if (script.executes) {
    embed.addFields({ name: 'Executions', value: script.executes.toLocaleString('en-US'), inline: true });
  }
  if (script.updatedAt) {
    const ts = Math.floor(new Date(script.updatedAt).getTime() / 1000);
    if (Number.isFinite(ts)) embed.addFields({ name: 'Updated', value: `<t:${ts}:R>`, inline: true });
  }

  return embed.setFooter({ text: 'Source: ScriptBlox' });
}

async function safeDetail(slug) {
  try {
    return await fetchScriptDetail(slug);
  } catch (error) {
    console.warn(`[script-ai] detail failed for ${slug}: ${error.message}`);
    return null;
  }
}

async function replyWithScripts(message, query, { limit = 3, collect } = {}) {
  const push = (sent) => { if (collect) collect.push(sent); return sent; };

  const status = push(await message.channel.send(`🔍 Searching for **${query}**...`));

  let picked;
  try {
    picked = await pickResults(query, limit);
  } catch (error) {
    console.error(`[script-ai] search failed (${query}):`, error.message);
    await status.edit(`⚠️ Search for **${query}** failed. Please try again later.`);
    return;
  }

  const results = picked.results;
  if (!results.length) {
    await status.edit(`❌ No scripts found for **${query}**.`);
    return;
  }

  const details = await Promise.all(results.map((s) => safeDetail(s.slug)));

  await status.edit(
    picked.exhausted
      ? `🔁 **${query}** — all cached scripts shown, restarting from the top (${results.length} results)`
      : `🔎 **${query}** — ${results.length} scripts (search #${picked.hits})`,
  );

  for (const [i, script] of results.entries()) {
    push(await message.channel.send({ embeds: [buildEmbed(script, i + 1, details[i])] }));
    await sleep(350);
    push(await message.channel.send(`📱 **Script ${i + 1} (Mobile):**\n\`${script.loadstring}\``));
    await sleep(350);
    push(await message.channel.send(`💻 **Script ${i + 1} (PC):**\n\`\`\`lua\n${script.loadstring}\n\`\`\``));
    await sleep(350);
  }
}

module.exports = { replyWithScripts, buildEmbed, truncate, statusLabel };
