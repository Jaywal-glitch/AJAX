import Parser from 'rss-parser';
import { randomUUID } from 'node:crypto';

const parser = new Parser({ timeout: 8000, maxRedirects: 3 });
const refreshIntervalMs = 10 * 60 * 1000;
const requestTimeoutMs = 9000;

export const categories = [
  'AI',
  'ML',
  'Cybersecurity',
  'Big Tech',
  'Startups',
  'Hardware',
  'Semiconductors',
  'Robotics',
  'Cloud',
  'Developer Tools',
  'Software',
  'Science',
  'Research',
  'Open Source',
  'Gadgets',
  'Enterprise Tech',
];

export const sourceRegistry = [
  { id: 'mit-technology-review', name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', category: 'Research', priority: 0.95 },
  { id: 'ars-technica', name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', category: 'Software', priority: 0.92 },
  { id: 'techcrunch', name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'Startups', priority: 0.88 },
  { id: 'the-verge', name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'Big Tech', priority: 0.86 },
  { id: 'venturebeat-ai', name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/', category: 'AI', priority: 0.90 },
  { id: 'wired', name: 'WIRED', url: 'https://www.wired.com/feed/rss', category: 'Science', priority: 0.84 },
  { id: 'github-blog', name: 'GitHub Blog', url: 'https://github.blog/feed/', category: 'Open Source', priority: 0.92 },
  { id: 'huggingface-blog', name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', category: 'AI', priority: 0.94 },
  { id: 'the-register', name: 'The Register', url: 'https://www.theregister.com/headlines.atom', category: 'Enterprise Tech', priority: 0.84 },
  { id: 'engadget', name: 'Engadget', url: 'https://www.engadget.com/rss.xml', category: 'Gadgets', priority: 0.78 },
  { id: 'arxiv-ai', name: 'arXiv AI', url: 'https://export.arxiv.org/api/query?search_query=cat:cs.AI&start=0&max_results=30&sortBy=submittedDate&sortOrder=descending', category: 'AI', priority: 0.96 },
].map((source) => ({
  ...source,
  enabled: true,
  lastSuccessfulFetch: null,
  lastAttempt: null,
  error: null,
}));

let cachedItems = [];
let lastUpdated = null;
let refreshPromise = null;

export function canonicalizeUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    url.hash = '';
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid']) {
      url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function normalizeText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeHeadline(text) {
  const stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
    'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
    'will', 'with', 'what', 'how', 'why', 'who', 'this', 'after', 'new', 'over',
  ]);
  return new Set(
    normalizeText(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word))
  );
}

function calculateHeadlineSimilarity(tokensA, tokensB) {
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function inferCategory(item, sourceCategory) {
  const text = ` ${item.title} ${item.contentSnippet || ''} ${item.content || ''} `.toLowerCase();
  const rules = [
    ['Cybersecurity', ['security', 'cyber', 'malware', 'ransomware', 'vulnerability', 'zero-day', 'exploit', 'breach']],
    ['Semiconductors', ['chip', 'semiconductor', 'gpu', 'nvidia', 'tsmc', 'processor', 'qualcomm', 'intel', 'amd', 'blackwell']],
    ['Robotics', ['robot', 'humanoid', 'autonomous vehicle', 'boston dynamics', 'figure ai', 'drone', 'waymo']],
    ['AI', ['artificial intelligence', ' ai ', 'openai', 'llm', 'generative', 'chatgpt', 'claude', 'gemini', 'anthropic', 'deepseek', 'copilot', 'mistral', 'reasoning model']],
    ['ML', ['machine learning', 'deep learning', 'neural network', 'model training', 'fine-tuning', 'transformer', 'diffusion', 'weights', 'inference']],
    ['Cloud', ['cloud', 'kubernetes', 'serverless', 'aws', 'azure', 'gcp', 'datacenters', 'infrastructure']],
    ['Developer Tools', ['developer', 'github', 'programming', 'software development', 'api', 'framework', 'sdk', 'ide', 'compiler', 'rust', 'python']],
    ['Open Source', ['open source', 'opensource', 'linux', 'github', 'hugging face', 'apache', 'permissive license']],
    ['Hardware', ['hardware', 'device', 'laptop', 'phone', 'wearable', 'vision pro', 'headset', 'macbook', 'pixel', 'iphone']],
  ];
  return rules.find(([, terms]) => terms.some((term) => text.includes(term)))?.[0] || sourceCategory;
}

export function toIntelligenceItem(item, source) {
  const url = canonicalizeUrl(item.link || item.guid);
  const title = normalizeText(item.title);
  if (!url || !title) return null;

  const publishedAt = item.isoDate || item.pubDate || null;
  const description = normalizeText(item.contentSnippet || item.content || item.summary).slice(0, 380);
  const ageHours = publishedAt ? Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / 3600000) : 48;
  const freshness = Math.round(Math.max(0, 100 - Math.min(100, ageHours * 2.2)));
  const category = inferCategory(item, source.category);
  const importance = Math.round(
    Math.min(100, source.priority * 58 + freshness * 0.28 + (category === 'AI' || category === 'Cybersecurity' ? 14 : 0))
  );

  return {
    id: randomUUID(),
    title,
    description,
    summary: description || 'No description was provided by the source.',
    url,
    canonicalUrl: url,
    source: source.name,
    sourceId: source.id,
    publishedAt,
    fetchedAt: new Date().toISOString(),
    category,
    tags: [category.toLowerCase().replace(/\s+/g, '-')],
    importance,
    relevance: Math.round(source.priority * 100),
    freshness,
    relatedSources: [],
    tokens: tokenizeHeadline(title),
  };
}

export function deduplicateAndCorroborate(items) {
  const uniqueItems = [];

  for (const item of items) {
    // Check if an existing item has the same URL
    const existingUrl = uniqueItems.find((u) => u.canonicalUrl === item.canonicalUrl);
    if (existingUrl) {
      if (existingUrl.sourceId !== item.sourceId && !existingUrl.relatedSources.some((s) => s.name === item.source)) {
        existingUrl.relatedSources.push({
          name: item.source,
          url: item.url,
          title: item.title,
          publishedAt: item.publishedAt,
        });
        existingUrl.importance = Math.min(100, existingUrl.importance + 6);
      }
      continue;
    }

    // Check for multi-source headline corroboration (Jaccard similarity >= 0.42)
    const corroboratedMatch = uniqueItems.find((u) => {
      if (u.sourceId === item.sourceId) return false;
      const similarity = calculateHeadlineSimilarity(u.tokens, item.tokens);
      return similarity >= 0.42;
    });

    if (corroboratedMatch) {
      if (!corroboratedMatch.relatedSources.some((s) => s.name === item.source)) {
        corroboratedMatch.relatedSources.push({
          name: item.source,
          url: item.url,
          title: item.title,
          publishedAt: item.publishedAt,
        });
        corroboratedMatch.importance = Math.min(100, corroboratedMatch.importance + 10);
      }
      continue;
    }

    uniqueItems.push(item);
  }

  // Remove internal tokens field before returning
  return uniqueItems.map(({ tokens, ...item }) => item);
}

export function rankItems(items) {
  return [...items].sort((a, b) => {
    const score = (item) =>
      item.freshness * 0.35 +
      item.importance * 0.45 +
      item.relevance * 0.2 +
      (item.relatedSources?.length || 0) * 12;
    return score(b) - score(a);
  });
}

export function diverseTop(items, limit = 10) {
  const result = [];
  const sourceCounts = new Map();
  for (const item of items) {
    const count = sourceCounts.get(item.sourceId) || 0;
    if (count >= 3 && items.length > limit) continue;
    result.push(item);
    sourceCounts.set(item.sourceId, count + 1);
    if (result.length === limit) break;
  }
  return result;
}

async function fetchSource(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  source.lastAttempt = new Date().toISOString();
  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'AJAX-Technology-Intelligence/2.0 (+local)' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const feed = await parser.parseString(await response.text());
    source.lastSuccessfulFetch = new Date().toISOString();
    source.error = null;
    return feed.items.slice(0, 30).map((item) => toIntelligenceItem(item, source)).filter(Boolean);
  } catch (error) {
    source.error = error instanceof Error ? error.message : 'Source fetch failed.';
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function refreshIntelligence() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = Promise.all(sourceRegistry.filter((source) => source.enabled).map(fetchSource))
    .then((groups) => {
      const freshItems = rankItems(deduplicateAndCorroborate(groups.flat()));
      if (freshItems.length > 0) cachedItems = freshItems;
      lastUpdated = new Date().toISOString();
      return { itemCount: cachedItems.length, fetchedCount: freshItems.length };
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export function getCachedItems() {
  return cachedItems;
}

export function getLastUpdated() {
  return lastUpdated;
}

export function filterItems(items, query) {
  const { search = '', category = '', source = '', time = '', offset = '0', limit = '50' } = query;
  const searchText = String(search).toLowerCase().trim();
  const start =
    time === 'hour'
      ? Date.now() - 3600000
      : time === 'week'
      ? Date.now() - 7 * 86400000
      : time === 'today'
      ? Date.now() - 86400000
      : null;

  const filtered = items.filter((item) => {
    const haystack = `${item.title} ${item.description} ${item.source} ${item.category}`.toLowerCase();
    return (
      (!searchText || haystack.includes(searchText)) &&
      (!category || item.category === category) &&
      (!source || item.sourceId === source) &&
      (!start || (item.publishedAt && new Date(item.publishedAt).getTime() >= start))
    );
  });

  const startIndex = Math.max(0, Number(offset) || 0);
  return filtered.slice(startIndex, startIndex + Math.min(100, Number(limit) || 50));
}

export function intelligencePayload(items) {
  const healthy = sourceRegistry.some((source) => source.lastSuccessfulFetch);
  const status = !healthy ? 'OFFLINE' : lastUpdated && Date.now() - new Date(lastUpdated).getTime() < refreshIntervalMs ? 'LIVE' : 'CACHED';
  return {
    ok: true,
    status,
    lastUpdated,
    categories,
    sources: sourceRegistry.map(({ id, name, url, category, priority, enabled, lastSuccessfulFetch, lastAttempt, error }) => ({
      id,
      name,
      url,
      category,
      priority,
      enabled,
      lastSuccessfulFetch,
      lastAttempt,
      error,
    })),
    items,
  };
}

export function getRelevantNewsForQuery(items, question) {
  const query = String(question || '').toLowerCase();
  if (!Array.isArray(items) || items.length === 0) return [];

  const tokens = query
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(
      (t) =>
        t.length > 2 &&
        !['what', 'when', 'where', 'whats', 'today', 'latest', 'news', 'tell', 'show', 'about', 'is', 'in'].includes(t)
    );

  const isAiQuery = /ai|artificial intelligence|machine learning|llm|deep learning|neural|openai|anthropic|chatgpt|claude|gemini|deepseek|model/i.test(
    query
  );

  const scored = items.map((item) => {
    let score = item.freshness * 0.35 + item.importance * 0.45;
    const haystack = `${item.title} ${item.description} ${item.summary} ${item.category} ${item.source}`.toLowerCase();

    if (
      isAiQuery &&
      (item.category === 'AI' ||
        item.category === 'ML' ||
        haystack.includes('ai ') ||
        haystack.includes('artificial intelligence') ||
        haystack.includes('llm'))
    ) {
      score += 50;
    }

    for (const token of tokens) {
      if (haystack.includes(token)) {
        score += 25;
      }
    }

    if (item.relatedSources && item.relatedSources.length > 0) {
      score += item.relatedSources.length * 15;
    }

    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 6).map((s) => s.item);
}
