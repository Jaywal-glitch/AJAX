import { useCallback, useEffect, useRef, useState } from 'react';

export function useAudioAnalyser(isListening: boolean, isSpeaking: boolean) {
  const [voiceLevel, setVoiceLevel] = useState<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const smoothedLevelRef = useRef<number>(0);

  // Initialize Audio Context and Analyser
  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        audioContextRef.current = ctx;
        analyserRef.current = analyser;
      }
    }

    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      void audioContextRef.current.resume();
    }

    return { ctx: audioContextRef.current, analyser: analyserRef.current };
  }, []);

  // Connect microphone for real-time speech analysis
  const startMicAnalysis = useCallback(async () => {
    try {
      const { analyser } = ensureAudioContext();
      if (!analyser || !navigator.mediaDevices?.getUserMedia) return;

      if (!micStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        micStreamRef.current = stream;

        if (audioContextRef.current) {
          const source = audioContextRef.current.createMediaStreamSource(stream);
          source.connect(analyser);
          micSourceRef.current = source;
        }
      }
    } catch {
      // Microphone permissions denied or unavailable; fallback to cadence
    }
  }, [ensureAudioContext]);

  const stopMicAnalysis = useCallback(() => {
    if (micSourceRef.current) {
      micSourceRef.current.disconnect();
      micSourceRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
  }, []);

  // Connect an HTML Audio element to the analyser
  const attachAudioElement = useCallback(
    (audioElement: HTMLAudioElement) => {
      try {
        const { ctx, analyser } = ensureAudioContext();
        if (!ctx || !analyser) return;

        const source = ctx.createMediaElementSource(audioElement);
        source.connect(analyser);
        analyser.connect(ctx.destination);
      } catch {
        // Element may already be connected or CORS restricted
      }
    },
    [ensureAudioContext]
  );

  // Animation frame loop measuring audio energy
  useEffect(() => {
    let active = true;

    if (isListening) {
      void startMicAnalysis();
    } else {
      stopMicAnalysis();
    }

    const dataArray = new Uint8Array(128);

    const updateLevel = (timestamp: number) => {
      if (!active) return;

      let currentEnergy = 0;

      if (analyserRef.current && (isListening || isSpeaking)) {
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        // Normalize 0 to 1
        currentEnergy = Math.min(1, average / 85);
      }

      // If speaking via speech synthesis or simulated vocal cadence when mic isn't active
      if (isSpeaking && currentEnergy < 0.05) {
        const wave1 = Math.sin(timestamp * 0.012) * 0.25;
        const wave2 = Math.sin(timestamp * 0.007) * 0.2;
        const wave3 = Math.sin(timestamp * 0.023) * 0.15;
        currentEnergy = Math.max(0.08, 0.45 + wave1 + wave2 + wave3);
      } else if (isListening && currentEnergy < 0.02) {
        currentEnergy = 0.05 + Math.sin(timestamp * 0.005) * 0.03;
      }

      // Smooth interpolation for fluid holographic rendering
      smoothedLevelRef.current = smoothedLevelRef.current * 0.75 + currentEnergy * 0.25;
      const rounded = Math.round(smoothedLevelRef.current * 1000) / 1000;

      setVoiceLevel(rounded);

      // Update root CSS variable --voice-level for ambient holographic liquid drift
      if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--voice-level', String(rounded));
      }

      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };

    animationFrameRef.current = requestAnimationFrame(updateLevel);

    return () => {
      active = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      stopMicAnalysis();
    };
  }, [isListening, isSpeaking, startMicAnalysis, stopMicAnalysis]);

  return {
    voiceLevel,
    attachAudioElement,
    ensureAudioContext,
  };
}
