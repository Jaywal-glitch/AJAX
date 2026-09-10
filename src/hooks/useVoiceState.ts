import { useCallback, useEffect, useRef, useState } from 'react';
import { detectWakeWord, extractCommandFromWakeWord, normalizeWakeTranscript } from '../intent';

export type VoiceInputMode = 'push-to-talk' | 'wake-word';
export type VoiceStatus = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR' | 'OFFLINE';

export interface UseVoiceStateOptions {
  onCommand: (command: string) => void;
  onAudioElement?: (audio: HTMLAudioElement) => void;
}

const voiceEnabledKey = 'ajax_voice_enabled';
const autoSpeakKey = 'ajax_auto_speak';
const voiceInputModeKey = 'ajax_voice_input_mode';
const preferredVoiceKey = 'ajax_preferred_voice';

type SpeechRecognitionCtor = new () => SpeechRecognition;

function readStorageBool(key: string, fallback: boolean) {
  if (typeof window === 'undefined') return fallback;
  const val = window.localStorage.getItem(key);
  return val === null ? fallback : val === 'true';
}

function readStorageStr<T extends string>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  return (window.localStorage.getItem(key) as T) || fallback;
}

export function useVoiceState({ onCommand, onAudioElement }: UseVoiceStateOptions) {
  const [status, setStatus] = useState<VoiceStatus>('IDLE');
  const [voiceInputMode, setVoiceInputMode] = useState<VoiceInputMode>(() =>
    readStorageStr(voiceInputModeKey, 'push-to-talk')
  );
  const [voiceEnabled, setVoiceEnabled] = useState(() => readStorageBool(voiceEnabledKey, true));
  const [autoSpeak, setAutoSpeak] = useState(() => readStorageBool(autoSpeakKey, true));
  const [isMuted, setIsMuted] = useState(false);
  const [voiceError, setVoiceError] = useState<string>('');
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [preferredVoiceName, setPreferredVoiceName] = useState<string>(() => readStorageStr(preferredVoiceKey, ''));
  const [lastSpokenText, setLastSpokenText] = useState('');

  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;

  const onAudioElementRef = useRef(onAudioElement);
  onAudioElementRef.current = onAudioElement;

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recognitionActiveRef = useRef(false);
  const recognitionStartingRef = useRef(false);
  const shouldListenRef = useRef(false);
  const wakePausedRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const startRecognitionRef = useRef<() => void>(() => undefined);
  const currentModeRef = useRef<VoiceInputMode>(voiceInputMode);
  currentModeRef.current = voiceInputMode;

  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  const autoSpeakRef = useRef(autoSpeak);
  autoSpeakRef.current = autoSpeak;

  const voiceEnabledRef = useRef(voiceEnabled);
  voiceEnabledRef.current = voiceEnabled;

  const preferredVoiceNameRef = useRef(preferredVoiceName);
  preferredVoiceNameRef.current = preferredVoiceName;

  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeBlobUrlRef = useRef<string | null>(null);
  const speakRef = useRef<(text: string, force?: boolean) => Promise<void>>(() => Promise.resolve());

  // Persist settings
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(voiceEnabledKey, String(voiceEnabled));
      window.localStorage.setItem(autoSpeakKey, String(autoSpeak));
      window.localStorage.setItem(voiceInputModeKey, voiceInputMode);
      window.localStorage.setItem(preferredVoiceKey, preferredVoiceName);
    }
  }, [voiceEnabled, autoSpeak, voiceInputMode, preferredVoiceName]);

  // Sync available speech synthesis voices
  useEffect(() => {
    const syncVoices = () => {
      if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        setAvailableVoices(voices);

        if (!preferredVoiceNameRef.current && voices.length > 0) {
          const britishVoice =
            voices.find(
              (v) =>
                (v.lang.startsWith('en-GB') ||
                  v.name.toLowerCase().includes('united kingdom') ||
                  v.name.toLowerCase().includes('uk')) &&
                (v.name.toLowerCase().includes('male') ||
                  v.name.toLowerCase().includes('george') ||
                  v.name.toLowerCase().includes('ryan') ||
                  v.name.toLowerCase().includes('arthur') ||
                  v.name.toLowerCase().includes('oliver'))
            ) ||
            voices.find((v) => v.lang.startsWith('en-GB')) ||
            voices.find((v) => v.lang.startsWith('en'));

          if (britishVoice) {
            setPreferredVoiceName(britishVoice.name);
          }
        }
      }
    };

    if ('speechSynthesis' in window) {
      syncVoices();
      window.speechSynthesis.onvoiceschanged = syncVoices;
    }

    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  // Initialize Speech Recognition
  useEffect(() => {
    const speechCtor = (window as typeof window & {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    }).SpeechRecognition ?? (window as typeof window & { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition;

    if (speechCtor) {
      setVoiceSupported(true);
      const recognition = new speechCtor();
      recognition.lang = 'en-GB';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        recognitionStartingRef.current = false;
        recognitionActiveRef.current = true;
        setStatus('LISTENING');
        setVoiceError('');
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const results = Array.from(event.results || []);
        const last = results[results.length - 1] || [];
        const rawTranscript = Array.from(last || []).map((item) => item.transcript).join(' ');
        const transcript = rawTranscript.trim();
        if (!transcript) return;

        const mode = currentModeRef.current;

        // Push-to-Talk mode: directly accept whatever user spoke
        if (mode === 'push-to-talk') {
          shouldListenRef.current = false;
          try {
            recognition.stop();
          } catch {
            // Recognition can already be ending after a result.
          }
          setStatus('THINKING');
          onCommandRef.current(transcript);
          return;
        }

        // Wake-Word mode: require "Hey AJAX" or "AJAX"
        const normalized = normalizeWakeTranscript(transcript);
        if (!detectWakeWord(normalized)) {
          return;
        }

        const command = extractCommandFromWakeWord(transcript);
        wakePausedRef.current = true;
        try {
          recognition.stop();
        } catch {
          // Recognition can already be ending after a result.
        }
        if (!command) {
          if (autoSpeakRef.current && !isMutedRef.current) {
            void speakRef.current('Yes?', true);
          } else {
            wakePausedRef.current = false;
            startRecognitionRef.current();
          }
          return;
        }

        setStatus('THINKING');
        onCommandRef.current(command);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          shouldListenRef.current = false;
          wakePausedRef.current = false;
        }
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          setStatus('ERROR');
          setVoiceError(`Voice input: ${event.error || 'unavailable'}`);
        }
      };

      recognition.onend = () => {
        recognitionActiveRef.current = false;
        recognitionStartingRef.current = false;
        if (shouldListenRef.current && currentModeRef.current === 'wake-word' && !wakePausedRef.current) {
          restartTimerRef.current = window.setTimeout(() => startRecognitionRef.current(), 150);
        } else {
          setStatus((prev) => (prev === 'LISTENING' ? 'IDLE' : prev));
        }
      };

      recognitionRef.current = recognition;
    } else {
      setVoiceSupported(false);
    }
    return () => {
      shouldListenRef.current = false;
      recognitionStartingRef.current = false;
      if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
      recognitionRef.current?.abort();
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.currentTime = 0;
      activeAudioRef.current = null;
    }

    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    setStatus('IDLE');
  }, []);

  const interrupt = useCallback(() => {
    shouldListenRef.current = false;
    recognitionStartingRef.current = false;
    wakePausedRef.current = false;
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Safe ignore
      }
    }
    stopSpeaking();
  }, [stopSpeaking]);

  const startRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!shouldListenRef.current || !recognition || recognitionActiveRef.current || recognitionStartingRef.current) return;
    try {
      recognitionStartingRef.current = true;
      recognition.start();
    } catch (error) {
      recognitionStartingRef.current = false;
      const message = error instanceof Error ? error.message : 'unavailable';
      if (!/already started/i.test(message)) {
        setStatus('ERROR');
        setVoiceError(`Voice input: ${message}`);
      }
    }
  }, []);

  startRecognitionRef.current = startRecognition;

  const startListening = useCallback((modeOverride?: VoiceInputMode) => {
    if (!voiceEnabledRef.current) {
      setVoiceError('Voice input is disabled in Settings.');
      setStatus('ERROR');
      return;
    }

    if (!recognitionRef.current) {
      setVoiceError("Voice input isn't supported in this browser. You can still type to AJAX.");
      setStatus('ERROR');
      return;
    }

    if (modeOverride) {
      currentModeRef.current = modeOverride;
    }

    shouldListenRef.current = true;
    setVoiceError('');
    startRecognition();
  }, [startRecognition]);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    recognitionStartingRef.current = false;
    wakePausedRef.current = false;
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Safe ignore
      }
    }
    setStatus((prev) => (prev === 'LISTENING' ? 'IDLE' : prev));
  }, []);

  // Browser SpeechSynthesis fallback
  const speakFallback = useCallback((cleanText: string): Promise<void> => {
    if (!('speechSynthesis' in window)) return Promise.resolve();

    return new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      const voices = window.speechSynthesis.getVoices();
      const preferred = preferredVoiceNameRef.current
        ? voices.find((v) => v.name === preferredVoiceNameRef.current || v.voiceURI === preferredVoiceNameRef.current)
        : voices.find((v) => v.lang.startsWith('en-GB')) || voices.find((v) => v.lang.startsWith('en'));

      if (preferred) utterance.voice = preferred;
      utterance.rate = 1.0;
      utterance.pitch = 0.94;
      utterance.volume = 1.0;

      utterance.onstart = () => setStatus('SPEAKING');
      utterance.onend = () => {
        setStatus('IDLE');
        resolve();
      };
      utterance.onerror = () => {
        setStatus('IDLE');
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }, []);

  const resumeWakeListening = useCallback(() => {
    if (wakePausedRef.current && currentModeRef.current === 'wake-word') {
      wakePausedRef.current = false;
      startRecognition();
    }
  }, [startRecognition]);

  // Primary speak method: uses neural British TTS with automatic browser fallback
  const speak = useCallback(
    async (text: string, force = false): Promise<void> => {
      if (!text) return;
      if (!force && (isMutedRef.current || !voiceEnabledRef.current)) return;

      const cleanText = String(text || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/[`*_#>[\]()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!cleanText) return;

      stopSpeaking();
      if (recognitionActiveRef.current || recognitionStartingRef.current) {
        wakePausedRef.current = currentModeRef.current === 'wake-word';
        recognitionStartingRef.current = false;
        try {
          recognitionRef.current?.stop();
        } catch {
          // Recognition can already be ending.
        }
      }
      setLastSpokenText(cleanText);
      setStatus('SPEAKING');

      // 1. Try Neural TTS Endpoint (/api/tts)
      try {
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cleanText.slice(0, 1000) }),
        });

        if (response.ok && response.headers.get('content-type')?.includes('audio')) {
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          activeBlobUrlRef.current = blobUrl;

          const audio = new Audio(blobUrl);
          activeAudioRef.current = audio;

          if (onAudioElementRef.current) {
            onAudioElementRef.current(audio);
          }

          return new Promise((resolve) => {
            audio.onended = () => {
              stopSpeaking();
              resumeWakeListening();
              resolve();
            };
            audio.onerror = () => {
              // On audio play error, fallback to browser synthesis
              void speakFallback(cleanText).then(() => {
                resumeWakeListening();
                resolve();
              });
            };
            audio.play().catch(() => {
              void speakFallback(cleanText).then(() => {
                resumeWakeListening();
                resolve();
              });
            });
          });
        }
      } catch {
        // Fall through to browser SpeechSynthesis
      }

      // 2. Fallback to Browser SpeechSynthesis
      return speakFallback(cleanText).finally(resumeWakeListening);
    },
    [resumeWakeListening, speakFallback, stopSpeaking]
  );

  speakRef.current = speak;

  return {
    status,
    setStatus,
    voiceInputMode,
    setVoiceInputMode,
    voiceEnabled,
    setVoiceEnabled,
    autoSpeak,
    setAutoSpeak,
    isMuted,
    setIsMuted,
    voiceError,
    setVoiceError,
    voiceSupported,
    availableVoices,
    preferredVoiceName,
    setPreferredVoiceName,
    lastSpokenText,
    isListening: status === 'LISTENING',
    isThinking: status === 'THINKING',
    isSpeaking: status === 'SPEAKING',
    startListening,
    stopListening,
    stopSpeaking,
    interrupt,
    speak,
  };
}
