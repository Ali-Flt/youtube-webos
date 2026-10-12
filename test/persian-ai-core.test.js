import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  englishCaptionUrl,
  firstAccepting,
  parseServers,
  persianCaptionVideoId,
  pickEnglishTrack,
  serverCaptionUrl,
  submitVisit,
  visitTracker
} from '../src/persian-ai-core.ts';

const asr = {
  baseUrl: 'https://yt/api/timedtext?v=a&kind=asr',
  languageCode: 'en',
  kind: 'asr'
};
const uploaded = {
  baseUrl: 'https://yt/api/timedtext?v=a',
  languageCode: 'en-US'
};
const french = {
  baseUrl: 'https://yt/api/timedtext?v=a&lang=fr',
  languageCode: 'fr'
};

test('prefers uploaded English over auto-generated English', () => {
  assert.equal(pickEnglishTrack([asr, french, uploaded]), uploaded);
});

test('falls back to auto-generated English', () => {
  assert.equal(pickEnglishTrack([french, asr]), asr);
});

test('returns undefined without English', () => {
  assert.equal(pickEnglishTrack([french]), undefined);
});

test('asks for json3 exactly once', () => {
  assert.equal(
    englishCaptionUrl({
      ...uploaded,
      baseUrl: 'https://yt/api/timedtext?v=a&fmt=srv3&x=1'
    }),
    'https://yt/api/timedtext?v=a&x=1&fmt=json3'
  );
});

test('parses the build-time server list', () => {
  assert.deepEqual(
    parseServers(' http://192.168.10.139:8765/ ,,http://192.168.10.50:8765'),
    ['http://192.168.10.139:8765', 'http://192.168.10.50:8765']
  );
  assert.deepEqual(parseServers(''), []);
});

test('recognises the player Persian caption request', () => {
  const url =
    'https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&ei=x&lang=en&tlang=fa&fmt=json3&c=TVHTML5';
  assert.equal(persianCaptionVideoId(url), 'dQw4w9WgXcQ');
});

test('ignores other caption and non-caption requests', () => {
  assert.equal(
    persianCaptionVideoId(
      'https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&lang=en&fmt=json3'
    ),
    null
  );
  assert.equal(
    persianCaptionVideoId(
      'https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&tlang=fr'
    ),
    null
  );
  assert.equal(
    persianCaptionVideoId(
      'https://www.youtube.com/api/stats/qoe?v=dQw4w9WgXcQ&tlang=fa'
    ),
    null
  );
});

test('builds the server caption URL with a whole, non-negative position', () => {
  assert.equal(
    serverCaptionUrl('http://pc:8765', 'dQw4w9WgXcQ', 61234.6),
    'http://pc:8765/v1/timedtext?v=dQw4w9WgXcQ&t=61235'
  );
  assert.equal(
    serverCaptionUrl('http://pc:8765', 'dQw4w9WgXcQ', -5),
    'http://pc:8765/v1/timedtext?v=dQw4w9WgXcQ&t=0'
  );
});

test('uses the first server that accepts the job', async () => {
  const tried = [];
  const chosen = await firstAccepting(
    ['http://pc', 'http://thinkpad'],
    async (server) => {
      tried.push(server);
      if (server === 'http://pc') throw new Error('timeout');
    }
  );
  assert.equal(chosen, 'http://thinkpad');
  assert.deepEqual(tried, ['http://pc', 'http://thinkpad']);
});

test('returns null when no server accepts', async () => {
  const chosen = await firstAccepting(['http://pc'], async () => {
    throw new Error('refused');
  });
  assert.equal(chosen, null);
});

test('a revisit after another video is a new visit, a resume is not', () => {
  const isNewVisit = visitTracker();
  assert.deepEqual(
    ['a', 'a', 'b', 'a'].map((id) => isNewVisit(id)),
    [true, false, true, true]
  );
});

test('remembers the server that accepted the job', async () => {
  const serverFor = new Map();
  const chosen = await submitVisit(
    'v',
    ['http://pc'],
    async () => {},
    serverFor
  );
  assert.equal(chosen, 'http://pc');
  assert.equal(serverFor.get('v'), 'http://pc');
});

test('forgets an earlier server when no server accepts', async () => {
  const serverFor = new Map([['v', 'http://pc']]);
  const chosen = await submitVisit(
    'v',
    ['http://pc'],
    async () => {
      throw new Error('down');
    },
    serverFor
  );
  assert.equal(chosen, null);
  assert.equal(serverFor.has('v'), false);
});
