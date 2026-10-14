const SEARCH_API = 'https://scriptblox.com/api/script/search';
const DETAIL_API = 'https://scriptblox.com/api/script/';
const RAW_BASE = 'https://rawscripts.net/raw/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function loadstringFor(slug) {
  return `loadstring(game:HttpGet("${RAW_BASE}${slug}"))()`;
}

async function fetchJson(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        Referer: 'https://scriptblox.com/',
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ScriptBlox returned HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function mapSummary(s) {
  return {
    title: s.title ?? '(untitled)',
    slug: s.slug,
    game: s.game?.name ?? null,
    key: Boolean(s.key && !s.keyless),
    keyless: Boolean(s.keyless),
    patched: Boolean(s.isPatched),
    verified: Boolean(s.verified),
    views: s.views ?? 0,
    likes: s.likeCount ?? 0,
    executes: s.executes ?? 0,
    updatedAt: s.lastBump ?? s.createdAt ?? null,
    loadstring: loadstringFor(s.slug),
  };
}

async function searchScripts(query, { page = 1 } = {}) {
  const url = `${SEARCH_API}?q=${encodeURIComponent(query)}&page=${page}`;
  const data = await fetchJson(url);
  const scripts = data?.result?.scripts;
  if (!Array.isArray(scripts)) throw new Error('Unexpected ScriptBlox search response');
  return {
    totalPages: data.result.totalPages ?? 1,
    scripts: scripts.map(mapSummary),
  };
}

const detailCache = new Map();

async function fetchScriptDetail(slug) {
  if (detailCache.has(slug)) return detailCache.get(slug);

  const promise = (async () => {
    const data = await fetchJson(`${DETAIL_API}${slug}`);
    const s = data?.script ?? data?.result ?? {};
    return {
      description: typeof s.features === 'string' ? s.features.trim() : '',
      tags: Array.isArray(s.tags) ? s.tags : [],
      owner: s.owner?.username ?? null,
      keyLink: s.keyLink ?? null,
    };
  })();

  detailCache.set(slug, promise);
  try {
    return await promise;
  } catch (error) {
    detailCache.delete(slug);
    throw error;
  }
}

module.exports = { searchScripts, fetchScriptDetail, loadstringFor, RAW_BASE };
