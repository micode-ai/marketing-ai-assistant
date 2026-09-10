export interface FaqEntry {
  q: string;
  a: string;
}

export interface ParsedMarkdown {
  meta: Record<string, string | string[] | FaqEntry[]>;
  body: string;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Minimal frontmatter reader for our own blog files. It supports exactly the three
 * shapes the articles use — `key: value`, `key: [a, b]`, and a `faq:` list of
 * `- q:` / `a:` pairs — which is why we do not pull in a YAML dependency.
 */
export function parseFrontmatter(raw: string): ParsedMarkdown {
  const match = FENCE.exec(raw);
  if (!match) return { meta: {}, body: raw.trim() };

  const meta: ParsedMarkdown['meta'] = {};
  const faq: FaqEntry[] = [];
  let inFaq = false;

  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    if (/^faq:\s*$/.test(line)) {
      inFaq = true;
      continue;
    }

    if (inFaq) {
      const question = /^\s*-\s*q:\s*(.+)$/.exec(line);
      if (question) {
        faq.push({ q: unquote(question[1]), a: '' });
        continue;
      }
      const answer = /^\s+a:\s*(.+)$/.exec(line);
      if (answer && faq.length > 0) {
        faq[faq.length - 1].a = unquote(answer[1]);
        continue;
      }
      if (!/^\S/.test(line)) continue;
      inFaq = false;
    }

    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) continue;

    const key = pair[1];
    const value = pair[2].trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      meta[key] = value
        .slice(1, -1)
        .split(',')
        .map((item) => unquote(item))
        .filter((item) => item.length > 0);
    } else {
      meta[key] = unquote(value);
    }
  }

  if (faq.length > 0) meta.faq = faq;

  return { meta, body: raw.slice(match[0].length).trim() };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.length >= 2 && trimmed[trimmed.length - 1] === quote) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}
