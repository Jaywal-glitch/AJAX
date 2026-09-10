const ttsCache = new Map();
const MAX_CACHE_ITEMS = 80;

function cleanTextForSpeech(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[`*_#>[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BRITISH_MALE_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';

export async function generateBritishAudio(text) {
  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) {
    throw new Error('No speakable text provided.');
  }

  if (ttsCache.has(cleaned)) {
    return ttsCache.get(cleaned);
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured on the server.');

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${BRITISH_MALE_VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: cleaned.slice(0, 1000),
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.1, use_speaker_boost: true },
      }),
    }
  );

  if (!response.ok) throw new Error(`ElevenLabs TTS provider returned HTTP ${response.status}`);
  const audio = Buffer.from(await response.arrayBuffer());

  // Manage cache size
  if (ttsCache.size >= MAX_CACHE_ITEMS) {
    const oldestKey = ttsCache.keys().next().value;
    ttsCache.delete(oldestKey);
  }
  ttsCache.set(cleaned, audio);

  return audio;
}
