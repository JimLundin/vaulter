import { pattern } from '../navigation/routing.ts';

export const chatRoute = pattern('/chat/');
export const conversationRoute = pattern('/chat/:node/');
export const historyRoute = pattern('/history/');
export const settingsRoute = pattern('/settings/');
