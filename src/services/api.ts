import type { AssistantMode, AssistantResponse, ChatMessage, CitedSource, MemoryItem } from '../types';

export type IntelligenceItem = {
  id: string;
  title: string;
  description: string;
  summary: string;
  url: string;
  canonicalUrl: string;
  publishedAt: string | null;
  fetchedAt: string;
  category: string;
  importance: number;
  relevance: number;
  freshness: number;
  tags: string[];
  source: string;
  sourceId: string;
  relatedSources: Array<{ name: string; url: string }>;
};

export type IntelligenceResponse = {
  ok: boolean;
  status: 'LIVE' | 'CACHED' | 'OFFLINE';
  lastUpdated: string | null;
  categories: string[];
  sources: Array<{ id: string; name: string; url: string; error: string | null }>;
  items: IntelligenceItem[];
};

export type BriefingResponse = {
  ok: boolean;
  briefing: string;
  summary: string;
  sources: CitedSource[];
  generatedAt: string;
};

export function classifyPrompt(prompt: string): AssistantMode {
  const lower = prompt.toLowerCase();

  if (lower.includes('error') || lower.includes('python') || lower.includes('bug') || lower.includes('debug')) return 'coding';
  if (lower.includes('project') || lower.includes('idea') || lower.includes('build')) return 'project';
  if (lower.includes('learn') || lower.includes('course') || lower.includes('path')) return 'learning';
  if (lower.includes('what\'s new') || lower.includes('whats new') || lower.includes('what happened') || lower.includes('latest') || lower.includes('news')) return 'current-news';
  if (lower.includes('research') || lower.includes('paper')) return 'research';
  if (lower.includes('rag') || lower.includes('llm') || lower.includes('transformer') || lower.includes('model') || lower.includes('ai')) return 'technology';
  return 'question';
}

export async function requestAssistant(
  prompt: string,
  history: ChatMessage[],
  signal?: AbortSignal
): Promise<AssistantResponse> {
  const response = await fetch('/api/ajax', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      message: prompt,
      conversationHistory: history.slice(-8),
      clientContext: { mode: classifyPrompt(prompt) },
    }),
    signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'AJAX could not process that request.');
  }

  const payload = await response.json();
  return payload.result as AssistantResponse;
}

export async function requestIntelligence(path = '/api/intelligence/top', signal?: AbortSignal): Promise<IntelligenceResponse> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error('AJAX intelligence sources are unavailable.');
  return response.json() as Promise<IntelligenceResponse>;
}

export async function requestBriefing(signal?: AbortSignal): Promise<BriefingResponse> {
  const response = await fetch('/api/briefing', { signal });
  if (!response.ok) throw new Error('Failed to generate daily technology briefing.');
  return response.json() as Promise<BriefingResponse>;
}

export async function requestMemories(): Promise<MemoryItem[]> {
  const response = await fetch('/api/memory');
  if (!response.ok) return [];
  const data = await response.json();
  return (data.memories || []) as MemoryItem[];
}

export async function addPersonalMemory(content: string, category = 'preference'): Promise<MemoryItem> {
  const response = await fetch('/api/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, category }),
  });
  if (!response.ok) throw new Error('Failed to store memory.');
  const data = await response.json();
  return data.memory as MemoryItem;
}

export async function deletePersonalMemory(id: string): Promise<boolean> {
  const response = await fetch(`/api/memory/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return response.ok;
}
