const { searchScripts } = require('./scriptSearch');

(async () => {
  const query = 'blade ball';
  const results = await searchScripts(query, { limit: 3 });
  for (const [i, s] of results.entries()) {
    console.log(`\n----- 将发送的消息 ${i * 2 + 1} -----`);
    console.log(`📱 **Script ${i + 1} (Mobile):**\n\`${s.loadstring}\``);
    console.log(`\n----- 将发送的消息 ${i * 2 + 2} -----`);
    console.log(`💻 **Script ${i + 1} (PC):**\n\`\`\`lua\n${s.loadstring}\n\`\`\``);
  }
})();
