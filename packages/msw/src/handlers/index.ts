import { googleHandlers } from './google';
import { optimizerHandlers } from './optimizer';

export * from './google';
export * from './optimizer';

export const defaultHandlers = [...googleHandlers, ...optimizerHandlers];
