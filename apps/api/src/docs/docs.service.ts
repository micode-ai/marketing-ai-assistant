import { Injectable } from '@nestjs/common';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

@Injectable()
export class DocsService {
  private readonly docsRoot: string;

  constructor() {
    // Resolve user_docs from multiple possible locations
    const candidates = [
      join(process.cwd(), 'user_docs'),           // repo root (production, Docker)
      join(process.cwd(), '../../user_docs'),      // from apps/api/ (dev with cwd=apps/api)
      resolve(__dirname, '../../../../user_docs'),  // relative to compiled file
    ];
    this.docsRoot = candidates.find(p => existsSync(p)) || candidates[0];
  }

  private getDocsDir(lang: string): string {
    const langMap: Record<string, string> = { en: 'eng', pl: 'pl', ru: 'ru' };
    return join(this.docsRoot, langMap[lang] || 'eng');
  }

  getDocsList(lang: string): { slug: string; title: string }[] {
    const dir = this.getDocsDir(lang);
    const fallbackDir = this.getDocsDir('en');
    const targetDir = existsSync(dir) ? dir : fallbackDir;
    if (!existsSync(targetDir)) return [];
    return readdirSync(targetDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .map(f => {
        const slug = f.replace('.md', '');
        const content = readFileSync(join(targetDir, f), 'utf-8');
        const titleMatch = content.match(/^#\s+(.+)/m);
        return { slug, title: titleMatch?.[1] || slug };
      });
  }

  getDoc(
    slug: string,
    lang: string,
  ): { slug: string; title: string; content: string; lang: string } | null {
    const dir = this.getDocsDir(lang);
    const fallbackDir = this.getDocsDir('en');
    let filePath = join(dir, `${slug}.md`);
    let usedLang = lang;
    if (!existsSync(filePath)) {
      filePath = join(fallbackDir, `${slug}.md`);
      usedLang = 'en';
    }
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, 'utf-8');
    const titleMatch = content.match(/^#\s+(.+)/m);
    return { slug, title: titleMatch?.[1] || slug, content, lang: usedLang };
  }
}
