const fs = require('fs');
const path = require('path');
const { searchScripts } = require('./scriptSearch');

const STATE_FILE = path.join(__dirname, '.script-ai-state.json');
const MAX_PAGES = 3;
const POOL_TTL_MS = 10 * 60 * 1000;

let state = { queries: {} };
try {
  if (fs.existsSync(STATE_FILE)) {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (parsed && typeof parsed === 'object') state = parsed;
  }
} catch (error) {
  console.warn('[rotation] 状态文件损坏，已重置:', error.message);
}
if (!state.queries) state.queries = {};

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), () => {});
  }, 200);
}

const poolCache = new Map();

async function getPage(query, page) {
  const key = `${query.toLowerCase()}::${page}`;
  const cached = poolCache.get(key);
  if (cached && Date.now() - cached.at < POOL_TTL_MS) return cached.scripts;

  const { scripts } = await searchScripts(query, { page });
  poolCache.set(key, { at: Date.now(), scripts });
  return scripts;
}

async function pickResults(query, count = 3) {
  const key = query.toLowerCase().trim();
  const entry = state.queries[key] ?? (state.queries[key] = { seen: [], hits: 0 });

  const unseen = [];
  for (let page = 1; page <= MAX_PAGES && unseen.length < count; page += 1) {
    const pageScripts = await getPage(query, page);
    if (!pageScripts.length) break;
    for (const script of pageScripts) {
      if (entry.seen.includes(script.slug)) continue;
      if (unseen.some((s) => s.slug === script.slug)) continue;
      unseen.push(script);
    }
  }

  if (unseen.length === 0) {
    const fresh = await getPage(query, 1);
    const picked = fresh.slice(0, count);
    entry.seen = picked.map((s) => s.slug);
    entry.hits += 1;
    save();
    return { results: picked, exhausted: true, hits: entry.hits };
  }

  const picked = unseen.slice(0, count);
  entry.seen.push(...picked.map((s) => s.slug));
  if (entry.seen.length > 300) entry.seen = entry.seen.slice(-300);
  entry.hits += 1;
  save();
  return { results: picked, exhausted: false, hits: entry.hits };
}

function resetQuery(query) {
  delete state.queries[query.toLowerCase().trim()];
  save();
}

module.exports = { pickResults, resetQuery, STATE_FILE };
