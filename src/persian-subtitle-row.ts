type Json = Record<string, unknown>;

const PERSIAN = { languageCode: 'fa', languageName: 'Persian' } as const;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null;

function commandsOf(item: unknown): unknown[] {
  if (!isObject(item)) return [];
  const link = item.compactLinkRenderer;
  if (!isObject(link)) return [];
  const endpoint = link.serviceEndpoint;
  if (!isObject(endpoint)) return [];
  const executor = endpoint.commandExecutorCommand;
  if (!isObject(executor) || !Array.isArray(executor.commands)) return [];
  return executor.commands;
}

function translationLanguageOf(item: unknown): Json | null {
  for (const command of commandsOf(item)) {
    if (!isObject(command)) continue;
    const select = command.selectSubtitlesTrackCommand;
    if (isObject(select) && isObject(select.translationLanguage)) {
      return select.translationLanguage;
    }
  }
  return null;
}

const isTranslationRow = (item: unknown) =>
  translationLanguageOf(item) !== null;

function persianRowFrom(row: unknown): unknown {
  const clone = structuredClone(row);
  if (!isObject(clone) || !isObject(clone.compactLinkRenderer)) return clone;

  const link = clone.compactLinkRenderer;
  link.title = { simpleText: PERSIAN.languageName };
  delete link.accessibility;
  delete link.trackingParams;
  if (isObject(link.secondaryIcon)) {
    link.secondaryIcon = {
      ...link.secondaryIcon,
      iconType: 'RADIO_BUTTON_UNCHECKED'
    };
  }

  for (const command of commandsOf(clone)) {
    if (!isObject(command)) continue;
    const select = command.selectSubtitlesTrackCommand;
    if (isObject(select)) select.translationLanguage = { ...PERSIAN };
  }
  return clone;
}

function withPersian(list: unknown[]): unknown[] | undefined {
  const hasPersian = list.some(
    (item) => translationLanguageOf(item)?.languageCode === PERSIAN.languageCode
  );
  if (hasPersian) return undefined;

  const index = list.findIndex(isTranslationRow);
  return [
    ...list.slice(0, index),
    persianRowFrom(list[index]),
    ...list.slice(index)
  ];
}

function rebuild(node: unknown): unknown {
  if (Array.isArray(node)) {
    if (node.some(isTranslationRow)) return withPersian(node);
    for (let i = 0; i < node.length; i++) {
      const child = rebuild(node[i]);
      if (child !== undefined) {
        return [...node.slice(0, i), child, ...node.slice(i + 1)];
      }
    }
    return undefined;
  }

  if (!isObject(node)) return undefined;
  for (const [key, value] of Object.entries(node)) {
    const child = rebuild(value);
    if (child !== undefined) return { ...node, [key]: child };
  }
  return undefined;
}

export function withPersianRow<T>(payload: T): T {
  const next = rebuild(payload);
  return next === undefined ? payload : (next as T);
}
