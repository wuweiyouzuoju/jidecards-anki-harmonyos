// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { LinksHelpPageLinkRequestHelpPage } from '../generated/CoreMessages';
import { GenericString, LinksHelpPageLinkRequest } from '../generated/CoreMessages';
export enum HelpPage {
    NOTE_TYPE = LinksHelpPageLinkRequestHelpPage.NOTE_TYPE,
    BROWSING = LinksHelpPageLinkRequestHelpPage.BROWSING,
    BROWSING_FIND_AND_REPLACE = LinksHelpPageLinkRequestHelpPage.BROWSING_FIND_AND_REPLACE,
    BROWSING_NOTES_MENU = LinksHelpPageLinkRequestHelpPage.BROWSING_NOTES_MENU,
    KEYBOARD_SHORTCUTS = LinksHelpPageLinkRequestHelpPage.KEYBOARD_SHORTCUTS,
    EDITING = LinksHelpPageLinkRequestHelpPage.EDITING,
    ADDING_CARD_AND_NOTE = LinksHelpPageLinkRequestHelpPage.ADDING_CARD_AND_NOTE,
    ADDING_A_NOTE_TYPE = LinksHelpPageLinkRequestHelpPage.ADDING_A_NOTE_TYPE,
    LATEX = LinksHelpPageLinkRequestHelpPage.LATEX,
    PREFERENCES = LinksHelpPageLinkRequestHelpPage.PREFERENCES,
    INDEX = LinksHelpPageLinkRequestHelpPage.INDEX,
    TEMPLATES = LinksHelpPageLinkRequestHelpPage.TEMPLATES,
    FILTERED_DECK = LinksHelpPageLinkRequestHelpPage.FILTERED_DECK,
    IMPORTING = LinksHelpPageLinkRequestHelpPage.IMPORTING,
    CUSTOMIZING_FIELDS = LinksHelpPageLinkRequestHelpPage.CUSTOMIZING_FIELDS,
    DECK_OPTIONS = LinksHelpPageLinkRequestHelpPage.DECK_OPTIONS,
    EDITING_FEATURES = LinksHelpPageLinkRequestHelpPage.EDITING_FEATURES,
    FULL_SCREEN_ISSUE = LinksHelpPageLinkRequestHelpPage.FULL_SCREEN_ISSUE,
    CARD_TYPE_DUPLICATE = LinksHelpPageLinkRequestHelpPage.CARD_TYPE_DUPLICATE,
    CARD_TYPE_NO_FRONT_FIELD = LinksHelpPageLinkRequestHelpPage.CARD_TYPE_NO_FRONT_FIELD,
    CARD_TYPE_MISSING_CLOZE = LinksHelpPageLinkRequestHelpPage.CARD_TYPE_MISSING_CLOZE,
    TROUBLESHOOTING = LinksHelpPageLinkRequestHelpPage.TROUBLESHOOTING,
    CARD_TYPE_TEMPLATE_ERROR = LinksHelpPageLinkRequestHelpPage.CARD_TYPE_TEMPLATE_ERROR
}
export function encodeHelpPageLinkRequest(page: HelpPage): Uint8Array {
    const w = new LinksHelpPageLinkRequest();
    if (page !== HelpPage.NOTE_TYPE) {
        w.setPage(page);
    }
    return w.转为字节();
}
export function decodeStringResponse(bytes: Uint8Array): string {
    return new GenericString(bytes).getVal();
}
