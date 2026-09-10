import React, { useState, useEffect, useCallback } from 'react';
import type { MemoryItem } from '../types';
import { requestMemories, addPersonalMemory, deletePersonalMemory } from '../services/api';

export const MemoryView: React.FC = () => {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('preference');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const loadMemories = useCallback(async () => {
    setIsLoading(true);
    try {
      const items = await requestMemories();
      setMemories(items);
    } catch {
      setStatusMessage('Unable to load personal memories.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMemories();
  }, [loadMemories]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    try {
      const item = await addPersonalMemory(newContent.trim(), newCategory);
      setMemories((prev) => [item, ...prev]);
      setNewContent('');
      setStatusMessage('Memory stored successfully.');
      setTimeout(() => setStatusMessage(''), 3000);
    } catch {
      setStatusMessage('Failed to store memory.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePersonalMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      setStatusMessage('Memory removed.');
      setTimeout(() => setStatusMessage(''), 3000);
    } catch {
      setStatusMessage('Failed to remove memory.');
    }
  };

  return (
    <section className="glass-panel memory-panel">
      <div className="panel-header">
        <span>PERSISTENT PERSONAL MEMORY</span>
        <span className="pill subtle">{memories.length} items recorded</span>
      </div>
      <p className="memory-intro">
        AJAX recalls these preferences and project notes to personalize explanations, intelligence briefings, and research.
      </p>

      <form className="memory-form" onSubmit={handleAdd}>
        <input
          type="text"
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="e.g. Focus on low-latency inference and agent orchestration..."
          aria-label="New memory text"
        />
        <select
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          aria-label="Memory category"
        >
          <option value="preference">Preference</option>
          <option value="project">Project</option>
          <option value="watchlist">Watchlist</option>
          <option value="stack">Tech Stack</option>
        </select>
        <button type="submit" className="primary-button">
          Remember
        </button>
      </form>

      {statusMessage && <div className="status-notice">{statusMessage}</div>}

      <div className="memory-list">
        {isLoading && <p className="empty-state">Loading personal memory...</p>}
        {!isLoading && memories.length === 0 && (
          <p className="empty-state">No personal memory recorded yet. Add your interests above.</p>
        )}
        {memories.map((mem) => (
          <div key={mem.id} className="memory-card">
            <div className="memory-header">
              <span className="tag">#{mem.category}</span>
              <button
                type="button"
                className="delete-button"
                onClick={() => handleDelete(mem.id)}
                title="Remove memory"
              >
                ✕
              </button>
            </div>
            <p className="memory-text">{mem.content}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default MemoryView;
