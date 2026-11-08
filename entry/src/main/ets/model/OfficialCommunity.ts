// SPDX-License-Identifier: AGPL-3.0-or-later

export const OFFICIAL_QQ_GROUP: string = '726837065';

export interface OfficialHelpLink {
  id: string;
  titleKey: string;
  url: string;
}

export const OFFICIAL_HELP_LINKS: OfficialHelpLink[] = [
  { id: 'community', titleKey: 'about_qq_group_title', url: '' },
  { id: 'website', titleKey: 'home_software_website', url: 'https://jidecards.com/' },
  { id: 'getting_started', titleKey: 'home_software_getting_started', url: 'https://jidecards.com/guides/harmonyos-anki/' },
  { id: 'ankiweb', titleKey: 'about_ankiweb_title', url: 'https://ankiweb.net/shared/decks/' },
  { id: 'anki_documentation', titleKey: 'about_anki_docs_title', url: 'https://docs.ankiweb.net/' },
  { id: 'ankidroid_manual', titleKey: 'home_software_ankidroid_manual', url: 'https://docs.ankidroid.org/manual.html' }
];
