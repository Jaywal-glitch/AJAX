import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  categories,
  sourceRegistry,
  refreshIntelligence,
  getCachedItems,
  getLastUpdated,
  filterItems,
  intelligencePayload,
  diverseTop,
  getRelevantNewsForQuery,
} from './services/intelligence.mjs';
import { generateBritishAudio } from './services/tts.mjs';
import { getMemories, addMemory, removeMemory, getMemoryContextString } from './services/memory.mjs';

// Securely load environment configurations
dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);
const refreshIntervalMs = 10 * 60 * 1000;

const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin } : { origin: false }));
app.use(express.json({ limit: '1mb' }));

function sanitizeErrorMessage(msg) {
  return String(msg || '').replace(/key=[a-zA-Z0-9_-]+/gi, 'key=[REDACTED]');
}

// Neural British TTS endpoint
app.get('/api/tts', async (req, res) => {
  try {
    const text = String(req.query.text || '').trim();
    if (!text) {
      return res.status(400).json({ ok: false, error: 'Text query parameter is required.' });
    }
    const audioBuffer = await generateBritishAudio(text);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(audioBuffer);
  } catch (error) {
    res.status(500).json({ ok: false, error: sanitizeErrorMessage(error.message), fallback: 'speechSynthesis' });
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) {
      return res.status(400).json({ ok: false, error: 'Text is required in request body.' });
    }
    const audioBuffer = await generateBritishAudio(text);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(audioBuffer);
  } catch (error) {
    res.status(500).json({ ok: false, error: sanitizeErrorMessage(error.message), fallback: 'speechSynthesis' });
  }
});

// Personal memory endpoints
app.get('/api/memory', async (_, res) => {
  try {
    const memories = await getMemories();
    res.json({ ok: true, memories });
  } catch (error) {
    res.status(500).json({ ok: false, error: sanitizeErrorMessage(error.message) });
  }
});

app.post('/api/memory', async (req, res) => {
  try {
    const { content, category, tags } = req.body || {};
    if (!content) {
      return res.status(400).json({ ok: false, error: 'Memory content is required.' });
    }
    const item = await addMemory({ content, category, tags });
    res.json({ ok: true, memory: item });
  } catch (error) {
    res.status(500).json({ ok: false, error: sanitizeErrorMessage(error.message) });
  }
});

app.delete('/api/memory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await removeMemory(id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: sanitizeErrorMessage(error.message) });
  }
});

// Executive daily technology briefing endpoint
app.get('/api/briefing', async (_, res) => {
  try {
    if (!getLastUpdated()) await refreshIntelligence();
    const topItems = diverseTop(getCachedItems(), 6);
    const briefingPrompt = "Deliver a calm, articulate, highly informative daily technology briefing. Synthesize today's most important headlines and breakthroughs, highlight any multi-source corroborated stories, and provide an executive summary.";
    const newsContext = compactNewsContext(topItems);
    const result = await callGemini({
      newsContext,
      intent: 'current-news',
      message: briefingPrompt,
      history: [],
      clientContext: { mode: 'briefing' },
    });

    res.json({
      ok: true,
      briefing: result.answer,
      summary: result.summary,
      sources: topItems.map((item) => ({
        id: item.id,
        title: item.title,
        source: item.source,
        url: item.url,
      })),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: sanitizeErrorMessage(error.message) });
  }
});

// REST endpoints for intelligence
app.get('/api/intelligence', async (req, res) => {
  if (!getLastUpdated()) await refreshIntelligence();
  res.json(intelligencePayload(filterItems(getCachedItems(), req.query)));
});

app.get('/api/intelligence/top', async (req, res) => {
  if (!getLastUpdated()) await refreshIntelligence();
  res.json(intelligencePayload(diverseTop(filterItems(getCachedItems(), req.query), 10)));
});

app.get('/api/intelligence/latest', async (req, res) => {
  if (!getLastUpdated()) await refreshIntelligence();
  const latest = [...getCachedItems()].sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
  res.json(intelligencePayload(filterItems(latest, req.query)));
});

app.get('/api/intelligence/search', async (req, res) => {
  if (!getLastUpdated()) await refreshIntelligence();
  res.json(intelligencePayload(filterItems(getCachedItems(), req.query)));
});

app.get('/api/intelligence/categories', (_, res) => res.json({ ok: true, categories }));
app.get('/api/intelligence/sources', (_, res) => res.json({ ok: true, sources: sourceRegistry }));

app.post('/api/intelligence/refresh', async (_, res) => {
  const refresh = await refreshIntelligence();
  res.json({ ...intelligencePayload(diverseTop(getCachedItems(), 10)), refresh });
});

app.get('/api/intelligence/refresh', async (_, res) => {
  const refresh = await refreshIntelligence();
  res.json({ ...intelligencePayload(diverseTop(getCachedItems(), 10)), refresh });
});

export function classifyRequest(message) {
  const text = String(message || '').toLowerCase();
  if (!text.trim()) return 'casual-conversation';

  if (/^(hello|hi\b|hey\b|good morning|good evening|thanks|thank you|what can you do|who are you)/.test(text)) {
    return 'casual-conversation';
  }

  if (/compare|versus|\bvs\b|difference between|latest .* and .* news|openai and google|openai.*google/.test(text)) {
    return 'comparison';
  }

  if (/summarize|summary|tell me more about the (first|second|third|\w+) story|the (first|second|third) story|article context/.test(text)) {
    return 'article-summarization';
  }

  // Current news & live updates (reliably catches "What's new in AI?", "Latest AI news", etc.)
  if (/what'?s new|whats new|what is new|what happened|what'?s happening|whats happening|latest|top stories|today|news|happening in ai|what happened in ai today|what about|developments?|recent updates?|headlines?|pulse|briefing/.test(text)) {
    return 'current-news';
  }

  if (/\bstory\b/.test(text)) {
    return 'article-summarization';
  }

  if (/nvidia|openai|google|anthropic|microsoft|meta|xai|apple|techcrunch|the verge|ai news/.test(text)) {
    return 'specific-news-topic';
  }

  if (/error|bug|debug|python|typescript|lint|build|test|stack trace/.test(text)) {
    return 'assistant-command';
  }

  if (/learn|course|path|teach|explain|what is|how does|why does/.test(text)) {
    return 'general-knowledge';
  }

  return 'general-knowledge';
}

function compactNewsContext(items) {
  if (!items || items.length === 0) {
    return 'LIVE NEWS:\nNo currently verified news items are available for the requested topic.';
  }

  const selected = items.slice(0, 8);
  const lines = selected.map((item, index) => {
    const ts = item.publishedAt || item.fetchedAt || 'unknown time';
    const corroboration = item.relatedSources?.length
      ? ` [CORROBORATED by: ${item.relatedSources.map((s) => s.name).join(', ')}]`
      : '';
    return `${index + 1}. Source: ${item.source}${corroboration}\nHeadline: "${item.title}"\nPublished: ${ts}\nSummary: ${item.summary || item.description || 'No summary provided.'}\nLink: ${item.url}`;
  });

  return ['LIVE GROUNDED NEWS CONTEXT (Verified from RSS feeds):', ...lines].join('\n\n');
}

function extractConversationWindow(history = []) {
  return Array.isArray(history) ? history.slice(-5).map((entry) => ({
    role: String(entry.role || 'user'),
    content: String(entry.content || '').slice(0, 300),
  })) : [];
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientGeminiFailure(status, text) {
  const lower = String(text || '').toLowerCase();
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504 ||
    /temporar|overload|overloaded|high demand|resource exhaustion|rate limit|rate limiting|too many requests|quota|busy|try again later/i.test(lower);
}

async function callGemini({ newsContext, intent, message, history, clientContext }) {
  const geminiKey = process.env.GEMINI_API_KEY || '';
  if (!geminiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`;

  const system = [
    'You are AJAX, an advanced, calm, precise, and articulate personal technology intelligence assistant.',
    'When current live news context is provided, ground your response in the retrieved news and cite sources by name (e.g. "According to Ars Technica...", "MIT Technology Review reports..."). Explicitly mention when a story is corroborated across multiple sources.',
    'Only if current news was specifically requested and the live feed has no matching evidence, state clearly: "I cannot verify that event from the current live feed."',
    'For general knowledge, explanations (such as "Explain AI"), concepts, architectural overviews, learning paths, or code questions, provide thorough, complete, and insightful explanations drawing upon your knowledge. Do NOT claim a lack of evidence for general technical inquiries.',
    'Never invent sources, article titles, or events.',
    'Format responses cleanly using markdown headers, paragraphs, bullet points, or code blocks where appropriate.',
  ].join('\n');

  const memoryContext = await getMemoryContextString();
  const historyContents = extractConversationWindow(history).map((entry) => ({
    role: entry.role === 'assistant' || entry.role === 'model' ? 'model' : 'user',
    parts: [{ text: entry.content }],
  }));
  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [...historyContents, {
      role: 'user',
      parts: [{
        text: `INTENT: ${intent}\n\nUSER_MESSAGE: ${message}\n\nCONTEXT:\n${newsContext || 'No current live news context was needed.'}\n\nPERSONAL_MEMORY:\n${memoryContext}\n\nCLIENT_CONTEXT:\n${JSON.stringify(clientContext || {})}`,
      }],
    }],
    generationConfig: {
      temperature: 0.35,
      topP: 0.95,
      maxOutputTokens: 2048,
    },
  };

  const maxAttempts = 3;
  let lastTransientError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let text = await response.text().catch(() => 'Gemini response unavailable.');
        try {
          const parsed = JSON.parse(text);
          text = parsed?.error?.message || text;
        } catch {
          // Non-JSON response
        }

        if (isTransientGeminiFailure(response.status, text) && attempt < maxAttempts - 1) {
          lastTransientError = new Error(sanitizeErrorMessage(text));
          await sleep(350 * (2 ** attempt));
          continue;
        }

        if (isTransientGeminiFailure(response.status, text)) {
          throw new Error('AJAX is temporarily unavailable because the Gemini provider is overloaded. Please try again soon.');
        }

        throw new Error(`The AI service could not generate a response. Provider response: ${sanitizeErrorMessage(text).slice(0, 500)}`);
      }

      const json = await response.json();
      const text = json?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n')?.trim();
      if (!text) {
        throw new Error('The AI service returned an empty response.');
      }

      const summary = text.slice(0, 220).replace(/\n+/g, ' ').trim();
      return { answer: text, summary };
    } catch (error) {
      const msg = sanitizeErrorMessage(error instanceof Error ? error.message : 'AJAX could not process that request.');
      const transient = isTransientGeminiFailure(0, msg) || /temporar|overload|try again later|high demand|too many requests|rate limit|rate limiting|resource exhaustion|busy/i.test(msg);
      if (transient && attempt < maxAttempts - 1) {
        lastTransientError = new Error(msg);
        await sleep(350 * (2 ** attempt));
        continue;
      }

      if (transient) {
        throw new Error('AJAX is temporarily unavailable because the Gemini provider is overloaded. Please try again soon.');
      }

      throw error;
    }
  }

  if (lastTransientError) {
    throw new Error('AJAX is temporarily unavailable because the Gemini provider is overloaded. Please try again soon.');
  }

  throw new Error('AJAX could not process that request. The news feed is still available.');
}

// Canonical internal handler for assistant queries
async function handleAjaxAssistantRequest(req, res) {
  let metadata = {
    intent: 'general-knowledge',
    usedNews: false,
    itemCount: 0,
    sourceStatus: getLastUpdated() ? 'LIVE' : 'CACHED',
    sources: [],
  };

  try {
    const { message, prompt, conversationHistory = [], history = [], clientContext = {}, mode } = req.body || {};
    const userMessage = String(message || prompt || '').trim();
    if (!userMessage) {
      return res.status(400).json({ ok: false, error: 'A message or prompt is required.' });
    }

    const conversation = Array.isArray(conversationHistory) && conversationHistory.length > 0 ? conversationHistory : Array.isArray(history) ? history : [];
    const intent = mode ? String(mode) : classifyRequest(userMessage);
    const shouldFetchNews = ['current-news', 'specific-news-topic', 'comparison', 'article-summarization'].includes(intent);

    let newsContext = 'No current live news context was needed for this request.';
    let newsItems = [];

    if (shouldFetchNews) {
      if (!getLastUpdated()) await refreshIntelligence();
      newsItems = getRelevantNewsForQuery(getCachedItems(), userMessage);
      if (newsItems.length === 0) {
        newsContext = 'LIVE NEWS:\nNo relevant live intelligence verified from the current feed.';
      } else {
        newsContext = compactNewsContext(newsItems);
      }
    }

    const sourcesMetadata = newsItems.map((item) => ({
      id: item.id,
      title: item.title,
      source: item.source,
      url: item.url,
      publishedAt: item.publishedAt,
      corroboratedBy: item.relatedSources?.map((s) => s.name) || [],
    }));

    metadata = {
      intent,
      usedNews: shouldFetchNews,
      itemCount: newsItems.length,
      sourceStatus: getLastUpdated() ? 'LIVE' : 'CACHED',
      sources: sourcesMetadata,
    };

    const result = await callGemini({
      prompt: userMessage,
      newsContext,
      intent,
      message: userMessage,
      history: conversation,
      clientContext,
    });

    const answer = {
      id: randomUUID(),
      answer: result.answer,
      summary: result.summary,
      mode: intent,
      confidence: 0.92,
      generatedAt: new Date().toISOString(),
      sources: sourcesMetadata,
    };

    const wantsStream = String(req.headers.accept || '').includes('text/event-stream') || String(req.query.stream || '').toLowerCase() === 'true';
    if (wantsStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      res.write(`event: start\ndata: ${JSON.stringify({ ok: true, result: answer, metadata })}\n\n`);

      const text = String(answer.answer || '');
      const chunkSize = 80;
      for (let index = 0; index < text.length; index += chunkSize) {
        const piece = text.slice(index, index + chunkSize);
        res.write(`event: chunk\ndata: ${JSON.stringify({ delta: piece })}\n\n`);
      }

      res.write(`event: done\ndata: ${JSON.stringify({ ok: true, result: answer, metadata })}\n\n`);
      res.end();
      return;
    }

    return res.json({
      ok: true,
      result: answer,
      metadata,
    });
  } catch (error) {
    const rawErrorMessage = error instanceof Error ? error.message : 'AJAX could not process that request.';
    const errorMessage = sanitizeErrorMessage(rawErrorMessage);
    console.error('AJAX Assistant Error:', errorMessage);

    if (errorMessage.includes('GEMINI_API_KEY')) {
      return res.status(500).json({ ok: false, error: 'AJAX cannot reach the Gemini service because the server key is not configured.', metadata });
    }
    if (errorMessage.includes('temporarily unavailable') || errorMessage.includes('overloaded')) {
      return res.status(503).json({ ok: false, error: 'AJAX is temporarily unavailable because the Gemini provider is overloaded. Please try again soon.', metadata });
    }
    if (errorMessage.includes('rate limiting') || errorMessage.includes('429')) {
      return res.status(429).json({ ok: false, error: 'AJAX is temporarily rate limited by the AI service. Please try again soon.', metadata });
    }
    return res.status(500).json({ ok: false, error: 'AJAX could not process that request. The news feed is still available.', metadata });
  }
}

// Canonical assistant endpoint
app.post('/api/ajax', handleAjaxAssistantRequest);

// Backward-compatibility alias
app.post('/api/assistant/chat', handleAjaxAssistantRequest);

app.get('/api/health', (_, res) => {
  res.json({
    ok: true,
    status: 'AJAX assistant backend online',
    intelligence: { status: getLastUpdated() ? 'READY' : 'PENDING', lastUpdated: getLastUpdated(), cachedCount: getCachedItems().length },
  });
});

export { app };

const isDirectEntry = typeof import.meta.url === 'string' && typeof process.argv[1] === 'string'
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;
if (isDirectEntry) {
  app.listen(port, () => {
    console.log(`AJAX backend listening on http://localhost:${port}`);
    void refreshIntelligence();
  });

  setInterval(() => { void refreshIntelligence(); }, refreshIntervalMs).unref();
} else {
  console.log('AJAX server routes loaded without auto-starting the Express listener.');
}
