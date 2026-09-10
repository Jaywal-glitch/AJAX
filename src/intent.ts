export function normalizeWakeTranscript(text: string) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s,.'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractCommandFromWakeWord(text: string) {
  const normalized = normalizeWakeTranscript(text);
  const match = normalized.match(/(?:^|\s)(?:hey\s+)?(?:okay|ok)?\s*(?:ajax|a\s*jax)(?:,|\s+|$)(.*)$/i);
  if (!match) return normalized || String(text || '').trim();

  const command = String(match[1] || '').trim();
  return command.replace(/^,|,$/g, '').trim();
}

export function detectWakeWord(text: string) {
  const normalized = normalizeWakeTranscript(text);
  return /(?:^|\s)(?:hey\s+)?(?:okay|ok)?\s*(?:ajax|a\s*jax)(?:,|\s+|$)/i.test(normalized);
}

export function classifyRequest(message: string) {
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

  // Current news & live updates (e.g. "What's new in AI?", "What happened today?", "Latest updates")
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
