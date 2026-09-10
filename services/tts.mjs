const ttsCache = new Map();
const MAX_CACHE_ITEMS = 80;

function cleanTextForSpeech(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[`*_#>[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitIntoChunks(text, maxLength = 180) {
  const words = text.split(/\s+/);
  const chunks = [];
  let current = [];
  let currentLen = 0;

  for (const word of words) {
    if (currentLen + word.length + 1 > maxLength && current.length > 0) {
      chunks.push(current.join(' '));
      current = [word];
      currentLen = word.length;
    } else {
      current.push(word);
      currentLen += word.length + 1;
    }
  }

  if (current.length > 0) {
    chunks.push(current.join(' '));
  }

  return chunks;
}

function escapeSsml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function generateAzureBritishMaleAudio(text) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) return null;

  const voice = process.env.AZURE_TTS_VOICE || 'en-GB-RyanNeural';
  const response = await fetch(`https://${encodeURIComponent(region)}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'AJAX',
    },
    body: `<speak version="1.0" xml:lang="en-GB"><voice name="${voice}"><prosody rate="-5%" pitch="-2%">${escapeSsml(text)}</prosody></voice></speak>`,
  });

  if (!response.ok) throw new Error(`Azure TTS provider returned HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function generateBritishAudio(text) {
  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) {
    throw new Error('No speakable text provided.');
  }

  if (ttsCache.has(cleaned)) {
    return ttsCache.get(cleaned);
  }

  const azureAudio = await generateAzureBritishMaleAudio(cleaned);
  if (azureAudio) {
    ttsCache.set(cleaned, azureAudio);
    return azureAudio;
  }

  const chunks = splitIntoChunks(cleaned, 180);
  const audioBuffers = [];

  for (const chunk of chunks) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=en-GB&client=tw-ob`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          Referer: 'https://translate.google.com/',
        },
      });

      if (!response.ok) {
        throw new Error(`TTS provider returned HTTP ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      audioBuffers.push(buffer);
    } finally {
      clearTimeout(timeout);
    }
  }

  const combined = Buffer.concat(audioBuffers);

  // Manage cache size
  if (ttsCache.size >= MAX_CACHE_ITEMS) {
    const oldestKey = ttsCache.keys().next().value;
    ttsCache.delete(oldestKey);
  }
  ttsCache.set(cleaned, combined);

  return combined;
}
