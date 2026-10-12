import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { withPersianRow } from '../src/persian-subtitle-row.ts';

const PERSIAN = { languageCode: 'fa', languageName: 'Persian' };

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

const itemsOf = (payload) =>
  payload.openPopupAction.popup.overlaySectionRenderer.overlay
    .overlayTwoPanelRenderer.actionPanel.overlayPanelRenderer.content
    .overlayPanelItemListRenderer.items;

const commandsOf = (item) =>
  item.compactLinkRenderer?.serviceEndpoint?.commandExecutorCommand?.commands ??
  [];

const languageOf = (item) =>
  commandsOf(item)[0]?.selectSubtitlesTrackCommand?.translationLanguage;

const titleOf = (item) => item.compactLinkRenderer?.title?.simpleText;

const persianRows = (items) =>
  items.filter((item) => languageOf(item)?.languageCode === 'fa');

test('adds one Persian row before the first translation row', () => {
  const input = fixture('auto-translate-popup.json');
  const before = itemsOf(input);

  const after = itemsOf(withPersianRow(input));

  assert.equal(after.length, before.length + 1);
  assert.equal(persianRows(after).length, 1);
  assert.equal(titleOf(after[1]), 'Persian');
  assert.deepEqual(languageOf(after[1]), PERSIAN);
  assert.equal(
    after[1].compactLinkRenderer.secondaryIcon.iconType,
    'RADIO_BUTTON_UNCHECKED'
  );
  assert.deepEqual(
    commandsOf(after[1]).slice(1),
    commandsOf(before[1]).slice(1)
  );
  assert.equal(titleOf(after[2]), 'English');
});

test('drops the source track hint so Persian translates from the default track', () => {
  const input = fixture('auto-translate-popup.json');
  assert.ok(languageOf(itemsOf(input)[1]).translationSourceTrackIndices);

  const persian = itemsOf(withPersianRow(input))[1];

  assert.equal(languageOf(persian).translationSourceTrackIndices, undefined);
});

test('does not mutate its input', () => {
  const input = fixture('auto-translate-popup.json');
  const snapshot = structuredClone(input);

  withPersianRow(input);

  assert.deepEqual(input, snapshot);
});

test('returns the same payload when Persian is already listed', () => {
  const once = withPersianRow(fixture('auto-translate-popup.json'));

  assert.equal(withPersianRow(once), once);
});

test('leaves the caption track popup untouched', () => {
  const input = fixture('captions-language-popup.json');

  assert.equal(withPersianRow(input), input);
});

test('leaves unrelated and malformed payloads untouched', () => {
  const inputs = [
    {},
    [],
    { openPopupAction: { popup: null } },
    {
      openPopupAction: {
        popup: { items: [null, 1, 'x', { compactLinkRenderer: null }] }
      }
    },
    {
      compactLinkRenderer: {
        serviceEndpoint: { commandExecutorCommand: { commands: 'x' } }
      }
    }
  ];

  for (const input of inputs) {
    assert.equal(withPersianRow(input), input);
  }
});

test('does not depend on English section headers', () => {
  const input = fixture('auto-translate-popup.json');
  for (const item of itemsOf(input)) {
    if (item.overlayMessageRenderer) {
      item.overlayMessageRenderer.subtitle.simpleText = 'زبان‌ها';
    }
  }

  const after = itemsOf(withPersianRow(input));

  assert.equal(titleOf(after[1]), 'Persian');
});

test('shows the Persian row unchecked even when the copied row is selected', () => {
  const input = fixture('auto-translate-popup.json');
  itemsOf(input)[1].compactLinkRenderer.secondaryIcon.iconType =
    'RADIO_BUTTON_CHECKED';

  const after = itemsOf(withPersianRow(input));

  assert.equal(
    after[1].compactLinkRenderer.secondaryIcon.iconType,
    'RADIO_BUTTON_UNCHECKED'
  );
  assert.equal(
    after[2].compactLinkRenderer.secondaryIcon.iconType,
    'RADIO_BUTTON_CHECKED'
  );
});
