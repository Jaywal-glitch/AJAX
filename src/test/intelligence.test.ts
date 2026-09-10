import { describe, it, expect } from 'vitest';
import {
  deduplicateAndCorroborate,
  getRelevantNewsForQuery,
  inferCategory,
  toIntelligenceItem,
} from '../../services/intelligence.mjs';

describe('Intelligence Pipeline', () => {
  it('correctly infers category from content keywords', () => {
    const item = {
      title: 'New LLM reasoning model announced by Anthropic',
      contentSnippet: 'Deep learning weights released with open weights',
    };
    expect(inferCategory(item, 'Software')).toBe('AI');
  });

  it('detects multi-source corroboration between different outlets reporting the same news', () => {
    const source1 = { id: 'tc', name: 'TechCrunch', priority: 0.9, category: 'AI' };
    const source2 = { id: 'ars', name: 'Ars Technica', priority: 0.9, category: 'AI' };

    const raw1 = {
      title: 'OpenAI announces GPT-5 frontier intelligence model',
      link: 'https://techcrunch.com/article-1',
      isoDate: new Date().toISOString(),
    };
    const raw2 = {
      title: 'OpenAI announces GPT-5 frontier intelligence release',
      link: 'https://arstechnica.com/article-2',
      isoDate: new Date().toISOString(),
    };

    const item1 = toIntelligenceItem(raw1, source1);
    const item2 = toIntelligenceItem(raw2, source2);

    const corroborated = deduplicateAndCorroborate([item1, item2]);
    expect(corroborated.length).toBe(1);
    expect(corroborated[0].relatedSources.length).toBe(1);
    expect(corroborated[0].relatedSources[0].name).toBe('Ars Technica');
  });

  it('boosts AI items when querying "What\'s new in AI?"', () => {
    const items = [
      {
        id: '1',
        title: 'New electric bike released by startup',
        description: 'Battery range improved',
        summary: '',
        category: 'Hardware',
        source: 'The Verge',
        freshness: 90,
        importance: 60,
        relatedSources: [],
      },
      {
        id: '2',
        title: 'Breakthrough in AI reasoning models announced',
        description: 'New multimodal architecture benchmarked',
        summary: '',
        category: 'AI',
        source: 'MIT Technology Review',
        freshness: 85,
        importance: 80,
        relatedSources: [{ name: 'Ars Technica', url: 'https://example.com' }],
      },
    ];

    const results = getRelevantNewsForQuery(items, "What's new in AI?");
    expect(results.length).toBe(2);
    expect(results[0].category).toBe('AI');
    expect(results[0].id).toBe('2');
  });
});
