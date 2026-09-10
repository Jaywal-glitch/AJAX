export type AssistantMode =
  | 'question'
  | 'research'
  | 'learning'
  | 'project'
  | 'technology'
  | 'coding'
  | 'general'
  | 'current-news'
  | 'specific-news-topic'
  | 'article-summarization'
  | 'comparison'
  | 'casual-conversation'
  | 'assistant-command';

export type CitedSource = {
  id?: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
  corroboratedBy?: string[];
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: CitedSource[];
};

export type AssistantResponse = {
  id: string;
  answer: string;
  summary: string;
  mode: AssistantMode;
  confidence: number;
  generatedAt: string;
  sources?: CitedSource[];
};

export type AssistantState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR';

export type AssistantStateSnapshot = {
  state: AssistantState;
  isListening: boolean;
  isThinking: boolean;
  isSpeaking: boolean;
  isError: boolean;
};

export type MemoryItem = {
  id: string;
  content: string;
  category: string;
  tags: string[];
  createdAt: string;
};
