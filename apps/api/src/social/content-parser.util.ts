const IMG_MD = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const IMG_HTML = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;

export function extractImageUrls(body: string, publicUrl: string): string[] {
  const urls: string[] = [];
  const base = publicUrl.replace(/\/$/, '');
  let m: RegExpExecArray | null;
  const md = new RegExp(IMG_MD.source, 'g');
  while ((m = md.exec(body)) !== null) urls.push(m[2]);
  const html = new RegExp(IMG_HTML.source, 'gi');
  while ((m = html.exec(body)) !== null) urls.push(m[1]);
  return urls.map((u) => (u.startsWith('http://') || u.startsWith('https://') ? u : u.startsWith('/') ? `${base}${u}` : u));
}

export function stripMarkdown(body: string): string {
  return body
    .replace(IMG_MD, '')
    .replace(IMG_HTML, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!_)_([^_]+)_(?!_)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
