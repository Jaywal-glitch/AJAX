import { render, screen } from '@testing-library/react';
import App from './App';
import { classifyRequest, detectWakeWord, extractCommandFromWakeWord, normalizeWakeTranscript } from './intent';
import SafeMarkdown from './components/SafeMarkdown';

describe('AJAX app', () => {
  it('renders the command center heading and primary actions', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'AJAX' })).toBeInTheDocument();
    expect(screen.getByText('Activate AJAX to begin.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ACTIVATE AJAX' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'SKIP INTRODUCTION' })).toBeInTheDocument();
    expect(screen.getByText('GLOBAL TECH PULSE · TOP 10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'SCOUT MORE NEWS' })).toBeInTheDocument();
  });

  it('classifies current-news and AI queries reliably', () => {
    expect(classifyRequest("What's new in AI?")).toBe('current-news');
    expect(classifyRequest("What's new?")).toBe('current-news');
    expect(classifyRequest('What happened in AI today?')).toBe('current-news');
    expect(classifyRequest('Explain AI')).toBe('general-knowledge');
    expect(classifyRequest('Compare OpenAI and Google')).toBe('comparison');
    expect(classifyRequest('How does backpropagation work?')).toBe('general-knowledge');
  });

  it('recognizes wake words and extracts the combined command from the wake phrase', () => {
    expect(detectWakeWord('AJAX')).toBe(true);
    expect(detectWakeWord('Hey AJAX')).toBe(true);
    expect(detectWakeWord('Okay AJAX')).toBe(true);
    expect(normalizeWakeTranscript('AJAX, what happened in AI today?')).toContain('ajax, what happened in ai today');
    expect(extractCommandFromWakeWord('AJAX, what happened in AI today?')).toBe('what happened in ai today');
    expect(extractCommandFromWakeWord('AJAX')).toBe('');
  });

  it('safely renders markdown formatting without dangerouslySetInnerHTML', () => {
    const content = `### Overview\nThis is **important**.\n- Item 1\n- Item 2\n\`\`\`js\nconst x = 42;\n\`\`\`\nCheck [link](https://example.com).`;
    const { container } = render(<SafeMarkdown content={content} />);

    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Overview');
    expect(screen.getByText('important')).toBeInTheDocument();
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    expect(container.querySelector('code')).toHaveTextContent('const x = 42;');
    const link = screen.getByRole('link', { name: 'link' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
