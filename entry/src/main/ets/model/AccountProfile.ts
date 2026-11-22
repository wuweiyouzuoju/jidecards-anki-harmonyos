// SPDX-License-Identifier: AGPL-3.0-or-later
export interface AccountProfile { nickname: string; avatar: string; revision: number; }
export interface ProfileAvatar { id: string; symbol: string; }

export const PROFILE_AVATARS: ProfileAvatar[] = [
  { id: 'owl', symbol: '🦉' }, { id: 'cat', symbol: '🐱' }, { id: 'fox', symbol: '🦊' },
  { id: 'panda', symbol: '🐼' }, { id: 'frog', symbol: '🐸' }, { id: 'whale', symbol: '🐳' },
  { id: 'rocket', symbol: '🚀' }, { id: 'planet', symbol: '🪐' },
  { id: 'book', symbol: '📚' }, { id: 'star', symbol: '⭐' }
];
export const NICKNAME_LIMIT: number = 20;

export function profileAvatarSymbol(id: string): string {
  return PROFILE_AVATARS.find((avatar: ProfileAvatar): boolean => avatar.id === id)?.symbol ?? '';
}

export const DEFAULT_PROFILE_AVATAR: string = 'owl';
export const PROFILE_AVATAR_PREFIX: string = 'data:image/jpeg;base64,';
export const PROFILE_AVATAR_BYTES: number = 8192;

export function isProfilePhoto(value: string): boolean {
  return typeof value === 'string' && value.length <= PROFILE_AVATAR_PREFIX.length + Math.ceil(PROFILE_AVATAR_BYTES / 3) * 4 &&
    value.startsWith(PROFILE_AVATAR_PREFIX) && /^[A-Za-z0-9+/]+={0,2}$/.test(value.slice(PROFILE_AVATAR_PREFIX.length));
}

export function isProfileAvatar(value: string): boolean {
  return profileAvatarSymbol(value) !== '' || isProfilePhoto(value);
}
