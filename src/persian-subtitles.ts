import {
  ResolveCommandRegistry,
  type ResolveCommandHook
} from './app_api/index';
import { withPersianRow } from './persian-subtitle-row';

const hook: ResolveCommandHook = (resolveCommand, payload, extra) => {
  let next = payload;
  try {
    next = withPersianRow(payload);
  } catch (error) {
    console.warn('[persian-subtitles] Passing popup through unchanged:', error);
  }
  return resolveCommand(next, extra);
};

const registry = await ResolveCommandRegistry.getInstance();
registry.setHook('openPopupAction', hook);
