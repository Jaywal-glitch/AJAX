import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const dataDir = path.resolve('data');
const memoryFile = path.join(dataDir, 'memory.json');

const initialMemory = [
  {
    id: 'mem-1',
    content: 'User prefers concise, source-grounded answers with focus on AI/ML architectures and systems.',
    category: 'preference',
    tags: ['ai', 'concise', 'architecture'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'mem-2',
    content: 'Active project: Developing AJAX as a voice-first personal AI intelligence assistant.',
    category: 'project',
    tags: ['ajax', 'voice', 'assistant'],
    createdAt: new Date().toISOString(),
  },
];

async function ensureDataFile() {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    try {
      await fs.access(memoryFile);
    } catch {
      await fs.writeFile(memoryFile, JSON.stringify(initialMemory, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('Failed to initialize memory directory:', err.message);
  }
}

export async function getMemories() {
  await ensureDataFile();
  try {
    const raw = await fs.readFile(memoryFile, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return initialMemory;
  }
}

export async function addMemory({ content, category = 'general', tags = [] }) {
  await ensureDataFile();
  const memories = await getMemories();
  const newMemory = {
    id: randomUUID(),
    content: String(content || '').trim(),
    category: String(category || 'general'),
    tags: Array.isArray(tags) ? tags : [],
    createdAt: new Date().toISOString(),
  };

  memories.unshift(newMemory);
  await fs.writeFile(memoryFile, JSON.stringify(memories, null, 2), 'utf-8');
  return newMemory;
}

export async function removeMemory(id) {
  await ensureDataFile();
  const memories = await getMemories();
  const filtered = memories.filter((m) => m.id !== id);
  await fs.writeFile(memoryFile, JSON.stringify(filtered, null, 2), 'utf-8');
  return true;
}

export async function getMemoryContextString() {
  try {
    const memories = await getMemories();
    if (memories.length === 0) return 'No personal memories recorded.';
    return memories.slice(0, 5).map((m) => `- [${m.category.toUpperCase()}] ${m.content}`).join('\n');
  } catch {
    return 'No personal memories recorded.';
  }
}
