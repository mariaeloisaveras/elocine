export const PROFILE_AVATARS = [
  {
    id: 'classic',
    name: 'Clássico Elocine',
    icon: 'E',
    background: 'linear-gradient(135deg, #df1834, #761d49)',
  },
  {
    id: 'cat',
    name: 'Gato debochado',
    icon: '😼',
    background: 'linear-gradient(135deg, #f6a23c, #a74429)',
  },
  {
    id: 'alien',
    name: 'Visitante de outro planeta',
    icon: '👽',
    background: 'linear-gradient(135deg, #8dc746, #245e54)',
  },
  {
    id: 'popcorn',
    name: 'Fiscal da pipoca',
    icon: '🍿',
    background: 'linear-gradient(135deg, #f54f65, #861e43)',
  },
  {
    id: 'sloth',
    name: 'Só mais um episódio',
    icon: '🦥',
    background: 'linear-gradient(135deg, #c59260, #5b4436)',
  },
  {
    id: 'ghost',
    name: 'Fantasma do sofá',
    icon: '👻',
    background: 'linear-gradient(135deg, #a582eb, #493284)',
  },
  {
    id: 'frog',
    name: 'Sapo de folga',
    icon: '🐸',
    background: 'linear-gradient(135deg, #4ecb92, #126d64)',
  },
  {
    id: 'robot',
    name: 'Robô da maratona',
    icon: '🤖',
    background: 'linear-gradient(135deg, #67b7ed, #305099)',
  },
  {
    id: 'unicorn',
    name: 'Unicórnio dramático',
    icon: '🦄',
    background: 'linear-gradient(135deg, #ed92d9, #8e46a5)',
  },
  {
    id: 'cool',
    name: 'Crítico de óculos',
    icon: '😎',
    background: 'linear-gradient(135deg, #efcb46, #ce7224)',
  },
  {
    id: 'fox',
    name: 'Raposa das reviravoltas',
    icon: '🦊',
    background: 'linear-gradient(135deg, #f3924c, #ac3c55)',
  },
  {
    id: 'octopus',
    name: 'Oito controles e um sofá',
    icon: '🐙',
    background: 'linear-gradient(135deg, #dd72b8, #6e3d9e)',
  },
] as const;
export interface ProfileAvatar {
  id: (typeof PROFILE_AVATARS)[number]['id'];
  name: string;
  icon: string;
  background: string;
}
export function avatarLetter(value: unknown): string {
  if (typeof value !== 'string') return '';
  return (
    Array.from(value.normalize('NFC').toLocaleUpperCase('pt-BR')).find((letter) =>
      /\p{L}/u.test(letter),
    ) || ''
  );
}
export function profileAvatar(id: unknown): ProfileAvatar {
  return PROFILE_AVATARS.find((avatar) => avatar.id === id) || PROFILE_AVATARS[0];
}
