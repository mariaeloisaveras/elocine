export interface SubtitleAppearance {
  size: 'small' | 'medium' | 'large';
  color: 'white' | 'yellow' | 'cyan' | 'green';
  background: 'none' | 'semi' | 'solid';
  outline: boolean;
}

export const DEFAULT_SUBTITLE_APPEARANCE: Readonly<SubtitleAppearance> = Object.freeze({
  size: 'medium',
  color: 'white',
  background: 'semi',
  outline: true,
});

export function normalizeSubtitleAppearance(value: unknown): SubtitleAppearance {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    size: source['size'] === 'small' || source['size'] === 'large' ? source['size'] : 'medium',
    color:
      source['color'] === 'yellow' || source['color'] === 'cyan' || source['color'] === 'green'
        ? source['color']
        : 'white',
    background:
      source['background'] === 'none' || source['background'] === 'solid'
        ? source['background']
        : 'semi',
    outline: typeof source['outline'] === 'boolean' ? source['outline'] : true,
  };
}
