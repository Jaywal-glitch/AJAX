import React, { useMemo } from 'react';

interface SafeMarkdownProps {
  content: string;
  className?: string;
}

function parseInlineFormatting(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${match.index}-${token}`;

    if (token.startsWith('**') && token.endsWith('**')) {
      tokens.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      tokens.push(<code key={key} className="inline-code">{token.slice(1, -1)}</code>);
    } else if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
      const splitIdx = token.indexOf('](');
      const linkText = token.slice(1, splitIdx);
      const linkUrl = token.slice(splitIdx + 2, -1);
      const isSafeUrl = /^https?:\/\//i.test(linkUrl);
      tokens.push(
        isSafeUrl ? (
          <a key={key} href={linkUrl} target="_blank" rel="noopener noreferrer" className="markdown-link">
            {linkText}
          </a>
        ) : (
          <span key={key}>{linkText}</span>
        )
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      tokens.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      tokens.push(token);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }

  return tokens.length > 0 ? tokens : [text];
}

export const SafeMarkdown: React.FC<SafeMarkdownProps> = ({ content, className = 'assistant-markdown' }) => {
  const elements = useMemo(() => {
    if (!content) return null;

    const lines = content.split('\n');
    const nodes: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeLanguage = '';
    let codeBuffer: string[] = [];
    let listBuffer: { type: 'ul' | 'ol'; items: string[] } | null = null;

    const flushList = () => {
      if (!listBuffer) return;
      const ListTag = listBuffer.type;
      const key = `list-${nodes.length}`;
      nodes.push(
        <ListTag key={key} className="markdown-list">
          {listBuffer.items.map((item, idx) => (
            <li key={idx}>{parseInlineFormatting(item)}</li>
          ))}
        </ListTag>
      );
      listBuffer = null;
    };

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      // Handle Code Blocks
      if (trimmed.startsWith('```')) {
        flushList();
        if (inCodeBlock) {
          const codeText = codeBuffer.join('\n');
          const key = `code-${nodes.length}`;
          nodes.push(
            <pre key={key} className="code-block" data-language={codeLanguage}>
              <code>{codeText}</code>
            </pre>
          );
          codeBuffer = [];
          inCodeBlock = false;
          codeLanguage = '';
        } else {
          inCodeBlock = true;
          codeLanguage = trimmed.slice(3).trim();
          codeBuffer = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeBuffer.push(rawLine);
        continue;
      }

      // Empty line
      if (!trimmed) {
        flushList();
        continue;
      }

      // Headers
      if (trimmed.startsWith('#### ')) {
        flushList();
        nodes.push(<h5 key={`h5-${nodes.length}`}>{parseInlineFormatting(trimmed.slice(5))}</h5>);
        continue;
      }
      if (trimmed.startsWith('### ')) {
        flushList();
        nodes.push(<h4 key={`h4-${nodes.length}`}>{parseInlineFormatting(trimmed.slice(4))}</h4>);
        continue;
      }
      if (trimmed.startsWith('## ')) {
        flushList();
        nodes.push(<h3 key={`h3-${nodes.length}`}>{parseInlineFormatting(trimmed.slice(3))}</h3>);
        continue;
      }
      if (trimmed.startsWith('# ')) {
        flushList();
        nodes.push(<h2 key={`h2-${nodes.length}`}>{parseInlineFormatting(trimmed.slice(2))}</h2>);
        continue;
      }

      // Blockquotes
      if (trimmed.startsWith('> ')) {
        flushList();
        nodes.push(
          <blockquote key={`quote-${nodes.length}`}>
            {parseInlineFormatting(trimmed.slice(2))}
          </blockquote>
        );
        continue;
      }

      // Unordered list
      const ulMatch = trimmed.match(/^[-*•]\s+(.*)$/);
      if (ulMatch) {
        if (!listBuffer || listBuffer.type !== 'ul') {
          flushList();
          listBuffer = { type: 'ul', items: [] };
        }
        listBuffer.items.push(ulMatch[1]);
        continue;
      }

      // Ordered list
      const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);
      if (olMatch) {
        if (!listBuffer || listBuffer.type !== 'ol') {
          flushList();
          listBuffer = { type: 'ol', items: [] };
        }
        listBuffer.items.push(olMatch[1]);
        continue;
      }

      // Standard paragraph
      flushList();
      nodes.push(<p key={`p-${nodes.length}`}>{parseInlineFormatting(trimmed)}</p>);
    }

    // Flush remaining blocks
    flushList();
    if (inCodeBlock && codeBuffer.length > 0) {
      nodes.push(
        <pre key={`code-end-${nodes.length}`} className="code-block">
          <code>{codeBuffer.join('\n')}</code>
        </pre>
      );
    }

    return nodes;
  }, [content]);

  return <div className={className}>{elements}</div>;
};

export default SafeMarkdown;
