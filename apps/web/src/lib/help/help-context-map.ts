// Route → help-article slug. First match wins, so more specific patterns
// (e.g. per-project sub-pages, /crm) must precede the generic /projects entry.
export const helpContextMap: [RegExp, string][] = [
  [/\/dashboard/, '01-getting-started'],
  [/\/projects\/[^/]+\/content/, '03-ai-features'],
  [/\/projects\/[^/]+\/checklists/, '03-ai-features'],
  [/\/projects\/[^/]+\/documents/, '03-ai-features'],
  [/\/projects\/[^/]+\/campaigns/, '03-ai-features'],
  [/\/projects\/[^/]+\/email/, '04-email-marketing'],
  [/\/projects\/[^/]+\/seo/, '08-advanced-features'],
  [/\/projects\/[^/]+\/analytics/, '08-advanced-features'],
  [/\/projects\/[^/]+\/competitors/, '08-advanced-features'],
  [/\/projects\/[^/]+\/experiments/, '08-advanced-features'],
  [/\/projects\/[^/]+\/sequences/, '04-email-marketing'],
  [/\/projects\/[^/]+\/crm/, '10-crm'],
  [/\/projects/, '02-projects'],
  [/\/ai-chat/, '03-ai-features'],
  [/\/templates/, '03-ai-features'],
  [/\/content/, '03-ai-features'],
  [/\/checklists/, '03-ai-features'],
  [/\/documents/, '03-ai-features'],
  [/\/email/, '04-email-marketing'],
  [/\/settings\/billing/, '05-team-and-billing'],
  [/\/settings\/team/, '05-team-and-billing'],
  [/\/settings\/integrations/, '07-social-publishing'],
  [/\/settings/, '05-team-and-billing'],
  [/\/analytics/, '08-advanced-features'],
  [/\/seo/, '08-advanced-features'],
];

export function helpSlugForPath(pathname: string): string {
  return helpContextMap.find(([re]) => re.test(pathname))?.[1] ?? '01-getting-started';
}
