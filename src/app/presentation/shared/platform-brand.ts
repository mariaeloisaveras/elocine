const BRAND_MARKS: Record<string, { text: string; color: string }> = {
  netflix: { text: 'N', color: '#e50914' },
  'prime-video': { text: 'prime', color: '#39b6ef' },
  'hbo-max': { text: 'HBO', color: '#b193ff' },
  'disney-plus': { text: 'D+', color: '#8aafff' },
  globoplay: { text: 'g', color: '#ff715b' },
  'apple-tv': { text: 'tv+', color: '#eeeeee' },
  'paramount-plus': { text: 'P+', color: '#6d9eff' },
};

export function platformBrand(id: string) {
  return BRAND_MARKS[id] || { text: '', color: '#cccccc' };
}
