import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from 'react';
import type { Group } from 'three';
import './styles.css';
import type { ChatMessage } from './types';
import { requestAssistant, requestIntelligence, requestBriefing, type IntelligenceItem } from './services/api';
import SafeMarkdown from './components/SafeMarkdown';
import MemoryView from './components/MemoryView';
import { useVoiceState, type VoiceStatus } from './hooks/useVoiceState';
import { useAudioAnalyser } from './hooks/useAudioAnalyser';

type ActiveView = 'home' | 'ask' | 'intelligence' | 'research' | 'history' | 'memory' | 'settings';

const navItems = ['AJAX', 'Ask', 'Intelligence', 'History', 'Memory', 'Settings'];
const quickCommands = ['Explain AI', "What's new in AI?", 'Daily Briefing', 'Research', 'Project ideas', 'Learn'];

const introSeenKey = 'ajax_intro_seen';
const savedItemsKey = 'ajax_saved_items';

function relativeTime(timestamp: string | null) {
  if (!timestamp) return 'time unavailable';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function getGreetingText(date = new Date()) {
  const hour = date.getHours();

  if (hour < 5) return 'Good evening, sir. You are up late.';
  if (hour < 12) return 'Good morning, sir. Systems operational. Ready when you are.';
  if (hour < 18) return 'Good afternoon. What technology areas are we examining today?';
  return 'Good evening. What intelligence can I retrieve for you?';
}

function readLocalStorageBoolean(key: string, fallback: boolean) {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

function readSavedItems(): IntelligenceItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(savedItemsKey);
    if (!raw) return [];
    return JSON.parse(raw) as IntelligenceItem[];
  } catch {
    return [];
  }
}

const voiceMessages: Record<VoiceStatus, string> = {
  IDLE: 'Speak to AJAX',
  LISTENING: 'Listening...',
  THINKING: 'Processing...',
  SPEAKING: 'Speaking...',
  ERROR: 'Voice error',
  OFFLINE: 'AJAX offline',
};

function CoreMotion({ groupRef, status, voiceLevel }: { groupRef: RefObject<Group | null>; status: VoiceStatus; voiceLevel: number }) {
  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const motion = status === 'SPEAKING' ? Math.max(0.15, voiceLevel) : status === 'THINKING' ? 0.22 : status === 'LISTENING' ? Math.max(0.14, voiceLevel * 0.9) : 0;
    const targetScale = 1 + motion * 0.22;
    groupRef.current.scale.setScalar(targetScale);
    groupRef.current.rotation.y += delta * (0.08 + motion * 0.5);
    groupRef.current.rotation.x += delta * (0.025 + motion * 0.12);
  });

  return null;
}

function HolographicCore({
  status,
  voiceLevel = 0,
  pointer = { x: 50, y: 50 },
}: {
  status: VoiceStatus;
  voiceLevel?: number;
  pointer?: { x: number; y: number };
}) {
  const particles = useMemo(
    () =>
      Array.from({ length: 220 }, (_, index) => ({
        key: index,
        angle: (index / 220) * Math.PI * 2,
        radius: 1.2 + (index % 9) * 0.12,
        offset: ((index * 17) % 11) * 0.12,
      })),
    [],
  );

  const isListening = status === 'LISTENING';
  const isThinking = status === 'THINKING';
  const isSpeaking = status === 'SPEAKING';
  const stateClass = status.toLowerCase();
  const sceneGroupRef = useRef<Group>(null);

  return (
    <div className={`core-shell ${stateClass}`}>
      <Canvas camera={{ position: [0, 0, 4.7], fov: 42 }}>
        <CoreMotion groupRef={sceneGroupRef} status={status} voiceLevel={voiceLevel} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 2, 4]} intensity={1.2} color="#c4b5fd" />
        <directionalLight position={[-2, -1, 2]} intensity={0.9} color="#67e8f9" />

        <group ref={sceneGroupRef} position={[(pointer.x - 50) * 0.002, (50 - pointer.y) * 0.002, 0]}>
          <mesh rotation={[0.4, 0.6, 0]}>
            <icosahedronGeometry args={[1.05 + voiceLevel * 0.15, 2]} />
            <meshStandardMaterial
              color="#8be9fd"
              emissive="#67e8f9"
              emissiveIntensity={isListening ? 2.4 : isThinking ? 2.8 : isSpeaking ? 2.2 + voiceLevel * 1.5 : 1.8}
              wireframe
            />
          </mesh>

          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.7 + voiceLevel * 0.1, 0.04, 16, 200]} />
            <meshStandardMaterial color="#93c5fd" emissive="#7dd3fc" emissiveIntensity={isListening ? 1.6 : 1.1} />
          </mesh>

          <mesh rotation={[0.8, Math.PI / 2, 0.6]}>
            <torusGeometry args={[2.1 + voiceLevel * 0.12, 0.03, 18, 220]} />
            <meshStandardMaterial color="#22d3ee" emissive="#67e8f9" emissiveIntensity={isThinking ? 2.2 : 1.2} />
          </mesh>

          <mesh rotation={[1.2, 0.2, Math.PI / 2]}>
            <torusGeometry args={[2.5 + voiceLevel * 0.08, 0.02, 14, 180]} />
            <meshStandardMaterial color="#c4b5fd" emissive="#a78bfa" emissiveIntensity={1.1} />
          </mesh>

          {particles.map((particle) => (
            <mesh
              key={particle.key}
              position={[
                Math.cos(particle.angle + Date.now() * 0.00015) * particle.radius * (1 + voiceLevel * 0.2),
                Math.sin(particle.angle * 1.4 + Date.now() * 0.00012) * 0.9,
                Math.sin(particle.angle) * 1.4 + particle.offset,
              ]}
            >
              <sphereGeometry args={[0.04 + voiceLevel * 0.02, 12, 12]} />
              <meshStandardMaterial
                color={isSpeaking ? '#f5d0fe' : '#dbeafe'}
                emissive={isListening ? '#67e8f9' : '#60a5fa'}
                emissiveIntensity={1.5 + voiceLevel * 1.2}
              />
            </mesh>
          ))}

          <mesh rotation={[0.3, 0.5, 0.7]}>
            <cylinderGeometry args={[0.52, 0.52, 0.16, 42]} />
            <meshStandardMaterial color="#bfe7ff" emissive="#67e8f9" emissiveIntensity={2.8} />
          </mesh>
        </group>

        <Html center position={[0, 0, 0]}>
          <div className="core-brand">AJAX</div>
        </Html>

        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={isThinking ? 1.7 : isListening ? 1.2 : isSpeaking ? 1.5 : 0.7} />
      </Canvas>
    </div>
  );
}

function App() {
  const [activeView, setActiveView] = useState<ActiveView>('home');
  const [inputValue, setInputValue] = useState('');
  const [isActivated, setIsActivated] = useState(false);
  const [introVisible, setIntroVisible] = useState(() => !readLocalStorageBoolean(introSeenKey, false));
  const [activationPhase, setActivationPhase] = useState<'idle' | 'pressing' | 'activating' | 'active'>('idle');
  const [activationPointer, setActivationPointer] = useState({ x: 50, y: 50 });
  const [corePointer, setCorePointer] = useState({ x: 50, y: 50 });
  const [isBriefingLoading, setIsBriefingLoading] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'AJAX online. Ask me about AI, ML, research, learning, or current technology intelligence.',
      timestamp: new Date().toISOString(),
    },
  ]);

  const [savedItems, setSavedItems] = useState<IntelligenceItem[]>(() => readSavedItems());
  const [intelligenceItems, setIntelligenceItems] = useState<IntelligenceItem[]>([]);
  const [intelligenceStatus, setIntelligenceStatus] = useState<'LIVE' | 'CACHED' | 'OFFLINE'>('OFFLINE');
  const [intelligenceUpdatedAt, setIntelligenceUpdatedAt] = useState<string | null>(null);
  const [intelligenceCategories, setIntelligenceCategories] = useState<string[]>([]);
  const [intelligenceSearch, setIntelligenceSearch] = useState('');
  const [intelligenceCategory, setIntelligenceCategory] = useState('');
  const [intelligenceTime, setIntelligenceTime] = useState('');
  const [isRefreshingIntelligence, setIsRefreshingIntelligence] = useState(false);
  const [intelligenceError, setIntelligenceError] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<IntelligenceItem | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sendPromptRef = useRef<(promptText: string) => void>(() => {});

  const handleUserCommand = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed) return;

    abortControllerRef.current?.abort();
    voice.setStatus('THINKING');

    const requestController = new AbortController();
    abortControllerRef.current = requestController;

    setActiveView('ask');
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');

    try {
      const result = await requestAssistant(trimmed, [...messages, userMessage], requestController.signal);
      const assistantResponse: ChatMessage = {
        id: result.id,
        role: 'assistant',
        content: result.answer,
        timestamp: result.generatedAt,
        sources: result.sources,
      };

      setMessages((prev) => [...prev, assistantResponse]);

      if (voice.autoSpeak && !voice.isMuted) {
        await voice.speak(result.answer, true);
      } else {
        voice.setStatus('IDLE');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        voice.setStatus('IDLE');
        return;
      }
      const message = error instanceof Error ? error.message : 'AJAX could not process that request.';
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: message, timestamp: new Date().toISOString() },
      ]);
      voice.setVoiceError(message);
      voice.setStatus('ERROR');
    }
  };

  sendPromptRef.current = (promptText: string) => {
    void handleUserCommand(promptText);
  };

  // Voice State Hook
  const voice = useVoiceState({
    onCommand: (command) => {
      sendPromptRef.current(command);
    },
    onAudioElement: (audio) => {
      audioAnalyser.attachAudioElement(audio);
    },
  });

  // Audio Analyser Hook
  const audioAnalyser = useAudioAnalyser(voice.isListening, voice.isSpeaking);

  // Global Keyboard Shortcuts (Space for PTT, Escape to Interrupt)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        voice.interrupt();
        return;
      }

      if (e.code === 'Space' && voice.voiceInputMode === 'push-to-talk') {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        if (!voice.isListening && voice.status !== 'SPEAKING') {
          e.preventDefault();
          voice.startListening('push-to-talk');
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && voice.voiceInputMode === 'push-to-talk') {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        if (voice.isListening) {
          e.preventDefault();
          voice.stopListening();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [voice]);

  const loadIntelligence = useCallback(async (path = '/api/intelligence/top') => {
    setIsRefreshingIntelligence(true);
    try {
      const result = await requestIntelligence(path);
      setIntelligenceItems(result.items);
      setIntelligenceStatus(result.status);
      setIntelligenceUpdatedAt(result.lastUpdated);
      setIntelligenceCategories(result.categories);
      setIntelligenceError('');
    } catch (error) {
      setIntelligenceError(error instanceof Error ? error.message : 'Live sources are unavailable.');
      setIntelligenceStatus(intelligenceItems.length > 0 ? 'CACHED' : 'OFFLINE');
    } finally {
      setIsRefreshingIntelligence(false);
    }
  }, [intelligenceItems.length]);

  useEffect(() => {
    void loadIntelligence();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void loadIntelligence();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [loadIntelligence]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(savedItemsKey, JSON.stringify(savedItems));
    }
  }, [savedItems]);

  const handleTriggerBriefing = async () => {
    setIsBriefingLoading(true);
    voice.setStatus('THINKING');
    setActiveView('ask');

    try {
      const data = await requestBriefing();
      const briefingMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.briefing,
        timestamp: data.generatedAt,
        sources: data.sources,
      };

      setMessages((prev) => [...prev, briefingMessage]);
      setIsBriefingLoading(false);

      if (voice.autoSpeak && !voice.isMuted) {
        await voice.speak(data.briefing, true);
      } else {
        voice.setStatus('IDLE');
      }
    } catch (err) {
      setIsBriefingLoading(false);
      voice.setStatus('ERROR');
      voice.setVoiceError(err instanceof Error ? err.message : 'Failed to generate briefing.');
    }
  };

  const handleActivationPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setActivationPointer({ x, y });
  };

  const handleActivateAjax = () => {
    setActivationPhase('pressing');
    window.setTimeout(() => setActivationPhase('activating'), 120);

    window.setTimeout(() => {
      setIsActivated(true);
      setIntroVisible(false);
      setActivationPhase('active');
      setActiveView('ask');

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(introSeenKey, 'true');
      }

      window.setTimeout(() => {
        inputRef.current?.focus();
      }, 400);

      const greeting = getGreetingText();
      if (voice.autoSpeak && !voice.isMuted) {
        void voice.speak(greeting, true);
      }
    }, 500);
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;
    if (inputValue.toLowerCase().includes('briefing')) {
      void handleTriggerBriefing();
    } else {
      sendPromptRef.current(inputValue);
    }
  };

  const handleSaveItem = (item: IntelligenceItem) => {
    setSavedItems((prev) => {
      if (prev.some((entry) => entry.id === item.id)) return prev;
      return [item, ...prev];
    });
    setActiveView('history');
  };

  const handleReadItem = (item: IntelligenceItem) => {
    setSelectedArticle(item);
    setActiveView('research');
    window.open(item.url, '_blank', 'noopener,noreferrer');
  };

  const handleExplainItem = (item: IntelligenceItem) => {
    const prompt = `Article context: headline: ${item.title}; source: ${item.source}; publication date: ${item.publishedAt || 'unknown'}; description: ${item.description}; URL: ${item.url}; category: ${item.category}. Explain this retrieved article in plain language.`;
    setSelectedArticle(item);
    sendPromptRef.current(prompt);
  };

  const handleShareItem = async (item: IntelligenceItem) => {
    const shareData = { title: item.title, text: `${item.title} · ${item.source}`, url: item.url };
    try {
      if (navigator.share) await navigator.share(shareData);
      else await navigator.clipboard.writeText(item.url);
      voice.setVoiceError('Article link ready to share.');
    } catch {
      voice.setVoiceError('Article sharing was cancelled.');
    }
  };

  const filteredIntelligenceItems = intelligenceItems.filter((item) => {
    const query = intelligenceSearch.trim().toLowerCase();
    return (
      (!query || `${item.title} ${item.description} ${item.source} ${item.category}`.toLowerCase().includes(query)) &&
      (!intelligenceCategory || item.category === intelligenceCategory) &&
      (!intelligenceTime ||
        (item.publishedAt &&
          Date.now() - new Date(item.publishedAt).getTime() <=
            (intelligenceTime === 'hour' ? 3600000 : intelligenceTime === 'week' ? 604800000 : 86400000)))
    );
  });

  const renderIntelligenceCard = (article: IntelligenceItem) => (
    <article key={article.id} className="intel-card">
      <div className="intel-header">
        <div>
          <span className="eyebrow">
            {article.category} · {relativeTime(article.publishedAt)}
          </span>
          <h3>{article.title}</h3>
        </div>
        <div className="score-stack">
          <span>IMPORTANCE {article.importance}</span>
          <span>{article.source}</span>
        </div>
      </div>
      <p>{article.description || article.summary}</p>
      <div className="tag-row">
        {article.tags.map((tag) => (
          <span key={tag} className="tag">
            #{tag}
          </span>
        ))}
        {article.relatedSources.length > 0 && (
          <span className="tag">Covered by {article.relatedSources.length + 1} sources</span>
        )}
      </div>
      {article.relatedSources && article.relatedSources.length > 0 && (
        <div className="corroboration-cluster">
          <span className="corroboration-badge">
            ✓ Multi-Source Corroborated ({article.relatedSources.length + 1} sources)
          </span>
          <div className="corroboration-sources">
            <span>Also reported by:</span>
            {article.relatedSources.map((rel, idx) => (
              <a key={idx} href={rel.url} target="_blank" rel="noopener noreferrer" className="corroboration-link">
                {rel.name}
              </a>
            ))}
          </div>
        </div>
      )}
      <div className="card-actions">
        <button type="button" onClick={() => handleReadItem(article)}>
          READ ARTICLE
        </button>
        <button type="button" onClick={() => handleExplainItem(article)}>
          ASK AJAX
        </button>
        <button type="button" onClick={() => handleSaveItem(article)}>
          SAVE
        </button>
        <button type="button" onClick={() => void handleShareItem(article)}>
          SHARE / COPY LINK
        </button>
      </div>
    </article>
  );

  const renderSavedItems = () => {
    if (savedItems.length === 0) {
      return <p className="empty-state">No saved intelligence yet.</p>;
    }

    return savedItems.map((item) => (
      <article key={item.id} className="intel-card saved-card">
        <div className="intel-header">
          <div>
            <span className="eyebrow">{item.category}</span>
            <h3>{item.title}</h3>
          </div>
          <button type="button" className="secondary-button" onClick={() => handleReadItem(item)}>
            READ
          </button>
        </div>
        <p>{item.summary}</p>
      </article>
    ));
  };

  const renderMainView = () => {
    if (activeView === 'memory') {
      return <MemoryView />;
    }

    if (activeView === 'settings') {
      return (
        <section className="settings-panel glass-panel">
          <div className="panel-header">
            <span>SETTINGS</span>
            <span className="pill subtle">AJAX CONFIG</span>
          </div>
          <div className="settings-grid">
            <label className="setting-row">
              <span>Voice mode</span>
              <select
                value={voice.voiceInputMode}
                onChange={(e) => voice.setVoiceInputMode(e.target.value as 'push-to-talk' | 'wake-word')}
              >
                <option value="push-to-talk">Push to Talk (Space / Click)</option>
                <option value="wake-word">Wake Word (&quot;Hey AJAX&quot;)</option>
              </select>
            </label>
            <label className="setting-row">
              <span>Voice enabled</span>
              <input
                type="checkbox"
                checked={voice.voiceEnabled}
                onChange={(event) => voice.setVoiceEnabled(event.target.checked)}
              />
            </label>
            <label className="setting-row">
              <span>Auto-speak (Neural British Voice)</span>
              <input
                type="checkbox"
                checked={voice.autoSpeak}
                onChange={(event) => voice.setAutoSpeak(event.target.checked)}
              />
            </label>
            <label className="setting-row">
              <span>Mute</span>
              <input
                type="checkbox"
                checked={voice.isMuted}
                onChange={(event) => voice.setIsMuted(event.target.checked)}
              />
            </label>
            <label className="setting-row select-row">
              <span>Fallback voice</span>
              <select
                value={voice.preferredVoiceName}
                onChange={(event) => voice.setPreferredVoiceName(event.target.value)}
              >
                <option value="">System British Default</option>
                {voice.availableVoices.map((v) => (
                  <option key={`${v.name}-${v.lang}`} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="secondary-button" onClick={() => setIntroVisible(true)}>
              Replay introduction
            </button>
          </div>
        </section>
      );
    }

    if (activeView === 'history') {
      return (
        <section className="glass-panel intel-panel">
          <div className="panel-header">
            <span>HISTORY & SAVED</span>
            <span className="pill subtle">{savedItems.length} saved</span>
          </div>
          {renderSavedItems()}
        </section>
      );
    }

    if (activeView === 'intelligence' || activeView === 'research') {
      return (
        <section className="overview-grid">
          <div className="glass-panel intel-panel">
            <div className="panel-header">
              <span>{activeView === 'research' ? 'RESEARCH' : 'GLOBAL TECH PULSE'}</span>
              <span className="pill subtle">
                {intelligenceStatus} · {relativeTime(intelligenceUpdatedAt)}
              </span>
            </div>
            <div className="intel-controls">
              <input
                aria-label="Search intelligence"
                value={intelligenceSearch}
                onChange={(event) => setIntelligenceSearch(event.target.value)}
                placeholder="Search global technology..."
              />
              <select
                aria-label="Filter intelligence category"
                value={intelligenceCategory}
                onChange={(event) => setIntelligenceCategory(event.target.value)}
              >
                <option value="">All categories</option>
                {intelligenceCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter intelligence time"
                value={intelligenceTime}
                onChange={(event) => setIntelligenceTime(event.target.value)}
              >
                <option value="">Any time</option>
                <option value="hour">Last hour</option>
                <option value="today">Today</option>
                <option value="week">This week</option>
              </select>
              <button
                type="button"
                className="primary-button"
                onClick={() => void loadIntelligence('/api/intelligence/refresh')}
                disabled={isRefreshingIntelligence}
              >
                REFRESH NOW
              </button>
            </div>
            {intelligenceError && (
              <p className="voice-error">LIVE SOURCES UNAVAILABLE. Showing recently verified intelligence.</p>
            )}
            {selectedArticle && (
              <div className="selected-item">
                <h3>{selectedArticle.title}</h3>
                <p>{selectedArticle.description || selectedArticle.summary}</p>
                <div className="source-block">
                  <strong>Source</strong>
                  <a href={selectedArticle.url} target="_blank" rel="noreferrer">
                    {selectedArticle.source}
                  </a>
                </div>
              </div>
            )}
            <div className="feed-list">
              {filteredIntelligenceItems.map(renderIntelligenceCard)}
              {filteredIntelligenceItems.length === 0 && (
                <p className="empty-state">No verified intelligence matches this filter.</p>
              )}
            </div>
          </div>
          <div className="glass-panel">
            <div className="panel-header">
              <span>SCOUT MORE NEWS</span>
              <span className="pill subtle">{intelligenceItems.length} loaded</span>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void loadIntelligence('/api/intelligence?limit=100')}
            >
              LOAD MORE
            </button>
            <div className="radar-list source-health-list">
              {intelligenceCategories.slice(0, 8).map((category) => (
                <div key={category} className="radar-row">
                  <strong>{category}</strong>
                  <span>AVAILABLE</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    }

    return (
      <>
        <section className="assistant-layout">
          <div className="core-panel glass-panel">
            <div className="panel-header compact">
              <span>AJAX CORE</span>
              <span className="pill">{voice.status}</span>
            </div>
            <div
              className="core-stage"
              aria-label={`AJAX is currently ${voice.status.toLowerCase()}`}
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setCorePointer({
                  x: ((event.clientX - rect.left) / rect.width) * 100,
                  y: ((event.clientY - rect.top) / rect.height) * 100,
                });
              }}
              onPointerLeave={() => setCorePointer({ x: 50, y: 50 })}
            >
              <HolographicCore status={voice.status} voiceLevel={audioAnalyser.voiceLevel} pointer={corePointer} />
            </div>
            <div className="voice-bar">
              <button
                className={`mic-button ${voice.isListening ? 'listening' : ''} ${voice.isSpeaking ? 'speaking' : ''}`}
                aria-label={voice.voiceSupported ? voiceMessages[voice.status] : 'Voice input unavailable'}
                onClick={() => {
                  if (voice.isListening) {
                    voice.stopListening();
                  } else {
                    voice.startListening();
                  }
                }}
                type="button"
              >
                <span className="mic-icon">🎙</span>
                <span>{voice.voiceSupported ? voiceMessages[voice.status] : 'Voice unavailable'}</span>
              </button>

              <div className="voice-mode-toggle">
                <button
                  type="button"
                  className={`voice-mode-button ${voice.voiceInputMode === 'push-to-talk' ? 'active' : ''}`}
                  onClick={() => voice.setVoiceInputMode('push-to-talk')}
                  title="Direct Push-to-Talk (no wake word needed)"
                >
                  PTT
                </button>
                <button
                  type="button"
                  className={`voice-mode-button ${voice.voiceInputMode === 'wake-word' ? 'active' : ''}`}
                  onClick={() => voice.setVoiceInputMode('wake-word')}
                  title="Hands-free (says 'Hey AJAX')"
                >
                  Wake Word
                </button>
              </div>

              {(voice.isSpeaking || voice.status === 'SPEAKING') && (
                <button className="secondary-button" onClick={voice.stopSpeaking} type="button">
                  Stop speaking
                </button>
              )}
              {voice.lastSpokenText && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void voice.speak(voice.lastSpokenText, true)}
                >
                  Replay
                </button>
              )}
              <button className="secondary-button" type="button" onClick={() => voice.setIsMuted((val) => !val)}>
                {voice.isMuted ? 'Unmute' : 'Mute'}
              </button>
            </div>
            {voice.voiceInputMode === 'push-to-talk' && (
              <small className="ptt-hint">Push-To-Talk: Click mic or hold [Space] to speak directly.</small>
            )}
            {voice.voiceError && <small className="voice-error">{voice.voiceError}</small>}
          </div>

          <div className="conversation-panel glass-panel">
            <div className="panel-header compact">
              <span>AJAX ASSISTANT</span>
              <span className="pill subtle">{messages.length} messages</span>
            </div>
            <div className="messages">
              {messages.map((message) => (
                <div key={message.id} className={`message ${message.role}`}>
                  <div className="message-role">{message.role === 'assistant' ? 'AJAX' : 'YOU'}</div>
                  <SafeMarkdown content={message.content} />
                  {message.sources && message.sources.length > 0 && (
                    <div className="cited-sources">
                      <span className="sources-label">Sources:</span>
                      {message.sources.map((s, idx) => (
                        <a key={idx} href={s.url} target="_blank" rel="noopener noreferrer" className="source-pill">
                          {s.source}: {s.title.slice(0, 45)}...
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {voice.isThinking && <div className="thinking-pill">AJAX is thinking…</div>}
            </div>
            <div className="quick-actions">
              {quickCommands.map((text) => (
                <button
                  key={text}
                  className="quick-command"
                  onClick={() => {
                    if (text === 'Daily Briefing') {
                      void handleTriggerBriefing();
                    } else {
                      setInputValue(text);
                    }
                  }}
                  type="button"
                >
                  {text}
                </button>
              ))}
            </div>
            <div className="composer">
              <input
                ref={inputRef}
                aria-label="Ask AJAX anything"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleSend();
                  }
                }}
                placeholder="Ask AJAX anything or request briefing..."
              />
              <button className="primary-button" onClick={handleSend} type="button">
                Send
              </button>
            </div>
          </div>
        </section>

        <section className="overview-grid">
          <div className="glass-panel intel-panel">
            <div className="panel-header">
              <span>GLOBAL TECH PULSE · TOP 10</span>
              <span className="pill subtle">
                {intelligenceStatus} · {relativeTime(intelligenceUpdatedAt)}
              </span>
            </div>
            <div className="feed-list">
              {intelligenceItems.slice(0, 10).map(renderIntelligenceCard)}
              {intelligenceItems.length === 0 && (
                <p className="empty-state">{intelligenceError || 'Loading verified global technology intelligence...'}</p>
              )}
            </div>
          </div>

          <div className="glass-panel">
            <div className="panel-header">
              <span>SCOUT MORE NEWS</span>
            </div>
            <p className="empty-state">Search, filter, and scout beyond the top ten in Intelligence.</p>
            <button type="button" className="secondary-button" onClick={() => setActiveView('intelligence')}>
              SCOUT MORE NEWS
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void loadIntelligence('/api/intelligence/refresh')}
              disabled={isRefreshingIntelligence}
            >
              REFRESH NOW
            </button>
          </div>
        </section>
      </>
    );
  };

  return (
    <div className={`app-shell ${voice.status.toLowerCase()}`} style={{} as CSSProperties}>
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">A</div>
          <div>
            <div className="eyebrow">PERSONAL TECHNOLOGY INTELLIGENCE</div>
            <h1>AJAX</h1>
          </div>
        </div>

        <div className="live-status">
          <span className="status-dot" />
          {isActivated ? 'AJAX ONLINE' : voice.status === 'IDLE' ? 'STANDBY' : voice.status}
        </div>

        <nav className="nav">
          {navItems.map((item) => {
            const viewMap: Record<string, ActiveView> = {
              AJAX: 'home',
              Ask: 'ask',
              Intelligence: 'intelligence',
              History: 'history',
              Memory: 'memory',
              Settings: 'settings',
            };

            return (
              <button
                key={item}
                className={`nav-item ${activeView === viewMap[item] ? 'active' : ''}`}
                onClick={() => {
                  setActiveView(viewMap[item] ?? 'home');
                  if (item === 'Ask') setInputValue('');
                }}
                type="button"
              >
                {item}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <div className="eyebrow">{getGreetingText().toUpperCase()}</div>
            <h2>{isActivated ? 'Your intelligence briefing is ready.' : 'Activate AJAX to begin.'}</h2>
          </div>
          <div className="topbar-actions">
            <button
              className="ghost-button"
              onClick={() => {
                setIsActivated(true);
                setActiveView('ask');
              }}
              type="button"
            >
              ASK AJAX
            </button>
            <button
              className="primary-button"
              onClick={() => void handleTriggerBriefing()}
              disabled={isBriefingLoading}
              type="button"
            >
              {isBriefingLoading ? 'BRIEFING...' : 'DAILY BRIEFING'}
            </button>
            <button className="primary-button" onClick={handleActivateAjax} type="button">
              ACTIVATE AJAX
            </button>
            <button
              className="ghost-button"
              onClick={() => {
                setInputValue('What are the most important AI developments this week?');
                setActiveView('ask');
              }}
              type="button"
            >
              WHAT SHOULD I KNOW?
            </button>
          </div>
        </header>

        {introVisible && (
          <div className="activation-overlay">
            <button
              type="button"
              className="skip-intro"
              aria-label="SKIP INTRODUCTION"
              onClick={() => {
                setIntroVisible(false);
                setIsActivated(true);
                setActiveView('ask');
              }}
            >
              SKIP INTRODUCTION
            </button>
            <div className="activation-shell" aria-live="polite">
              <div className="activation-surface" />
              <div className="activation-grid" />
              <div className="activation-noise" />

              <div className="activation-meta">
                <span className="activation-system">SYSTEM READY</span>
              </div>

              <button
                type="button"
                className={`activation-core-button ${activationPhase}`}
                aria-label="Activate AJAX"
                onClick={handleActivateAjax}
                onPointerDown={() => setActivationPhase('pressing')}
                onPointerUp={() => setActivationPhase('activating')}
                onPointerMove={handleActivationPointerMove}
                onPointerLeave={() => setActivationPointer({ x: 50, y: 50 })}
                style={
                  {
                    ['--pointer-x' as string]: `${activationPointer.x}%`,
                    ['--pointer-y' as string]: `${activationPointer.y}%`,
                  } as CSSProperties
                }
              >
                <span className="activation-halo" />
                <span className="activation-ring activation-ring--outer" />
                <span className="activation-ring activation-ring--mid" />
                <span className="activation-ring activation-ring--inner" />
                <span className="activation-core-symbol">A</span>
                <span className="activation-ticks" />
              </button>

              <div className="activation-instruction">Tap to activate</div>
            </div>
          </div>
        )}

        {renderMainView()}
      </main>
    </div>
  );
}

export default App;
