import {
  englishCaptionUrl,
  parseServers,
  persianCaptionVideoId,
  pickEnglishTrack,
  serverCaptionUrl,
  submitVisit,
  visitTracker,
  type CaptionTrack
} from './persian-ai-core';
import { ResolveCommandRegistry } from './app_api/index';
import { PERSIAN } from './persian-subtitle-row';
import { getPlayerManager, PlayerMode } from './player_api';
import type { VideoID, YTPlayer } from './player_api';

declare const __PERSIAN_SUBS_SERVERS__: string;

interface CaptionApi {
  getPlayerResponse():
    | {
        captions?: {
          playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] };
        };
        videoDetails?: { title?: string };
      }
    | undefined;
  getCurrentTime(): number;
  loadModule(module: 'captions'): void;
  addEventListener(type: 'captionschanged', listener: () => void): void;
  removeEventListener(type: 'captionschanged', listener: () => void): void;
  getOption(
    module: 'captions',
    option: 'track'
  ): { translationLanguage?: { languageCode?: string } } | undefined;
  getOption(
    module: 'captions',
    option: 'tracklist',
    filter: { includeAsr: boolean }
  ): unknown[] | undefined;
  setOption(module: 'captions', option: 'reload', value: boolean): void;
}

interface JobStatus {
  status: 'working' | 'done';
  done: number;
}

const TAG = '[persian-ai]';
const SERVERS = parseServers(__PERSIAN_SUBS_SERVERS__);
const SUBMIT_TIMEOUT_MS = 3000;
const CAPTIONS_TIMEOUT_MS = 15000;
const POLL_MS = 10000;
const STARTUP_MS = 3000;

const serverFor = new Map<VideoID, string>();
const isNewVisit = visitTracker();
let player: (YTPlayer & CaptionApi) | null = null;
let poll: ReturnType<typeof setInterval> | undefined;

function request(
  method: 'GET' | 'POST',
  url: string,
  timeoutMs: number,
  body?: unknown
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.timeout = timeoutMs;
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`${method} ${url}: HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error(`${method} ${url}: network error`));
    xhr.ontimeout = () => reject(new Error(`${method} ${url}: timeout`));
    if (body === undefined) {
      xhr.send();
    } else {
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify(body));
    }
  });
}

const positionMs = () => (player ? player.getCurrentTime() * 1000 : 0);

const persianActive = () =>
  player?.getOption('captions', 'track')?.translationLanguage?.languageCode ===
  'fa';

function reloadCaptions() {
  player?.setOption('captions', 'reload', true);
}

function showPersian() {
  const captions = player;
  if (!captions) return;
  captions.loadModule('captions');
  if (
    !captions.getOption('captions', 'tracklist', { includeAsr: true })?.length
  ) {
    return;
  }

  const apply = () => {
    if (persianActive()) return;
    registry.dispatchCommand({
      selectSubtitlesTrackCommand: { translationLanguage: { ...PERSIAN } }
    });
  };
  apply();
  // ponytail: the app re-applies its stored caption state ~1s after loadModule; keep Persian only through startup so later user choices win.
  captions.addEventListener('captionschanged', apply);
  setTimeout(
    () => captions.removeEventListener('captionschanged', apply),
    STARTUP_MS
  );
}

function redirect(url: string): string {
  try {
    const videoId = persianCaptionVideoId(url);
    const server = videoId ? serverFor.get(videoId) : undefined;
    return videoId && server
      ? serverCaptionUrl(server, videoId, positionMs())
      : url;
  } catch (error) {
    console.warn(TAG, 'leaving caption request unchanged:', error);
    return url;
  }
}

const originalOpen = XMLHttpRequest.prototype.open as (
  this: XMLHttpRequest,
  method: string,
  url: string | URL,
  async?: boolean,
  username?: string | null,
  password?: string | null
) => void;

XMLHttpRequest.prototype.open = function (
  this: XMLHttpRequest,
  method: string,
  url: string | URL,
  async: boolean = true,
  username?: string | null,
  password?: string | null
) {
  originalOpen.call(
    this,
    method,
    redirect(String(url)),
    async,
    username,
    password
  );
} as typeof XMLHttpRequest.prototype.open;

function stopPolling() {
  if (poll !== undefined) clearInterval(poll);
  poll = undefined;
}

function startPolling(videoId: VideoID, server: string) {
  stopPolling();
  let lastDone = 0;
  poll = setInterval(() => {
    if (playerManager.currentVideoID !== videoId) {
      stopPolling();
      return;
    }
    if (!persianActive()) return;
    request(
      'GET',
      `${server}/v1/status?v=${videoId}&t=${Math.round(positionMs())}`,
      SUBMIT_TIMEOUT_MS
    )
      .then((result) => {
        const status = result as JobStatus;
        if (status.done > lastDone) reloadCaptions();
        lastDone = status.done;
        if (status.status === 'done') stopPolling();
      })
      .catch((error: unknown) => console.warn(TAG, error));
  }, POLL_MS);
}

async function submit(videoId: VideoID) {
  const response = player?.getPlayerResponse();
  const track = pickEnglishTrack(
    response?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
  );
  if (!track) return;

  const captions = (await request(
    'GET',
    englishCaptionUrl(track),
    CAPTIONS_TIMEOUT_MS
  )) as { events?: unknown[] };
  const job = {
    videoId,
    title: response?.videoDetails?.title ?? '',
    track: { languageCode: track.languageCode, kind: track.kind ?? '' },
    positionMs: Math.round(positionMs()),
    events: captions.events ?? []
  };

  const server = await submitVisit(
    videoId,
    SERVERS,
    (candidate) =>
      request('POST', `${candidate}/v1/jobs`, SUBMIT_TIMEOUT_MS, job).catch(
        (error: unknown) => {
          console.warn(TAG, error);
          throw error;
        }
      ),
    serverFor
  );
  const current = playerManager.currentVideoID === videoId;
  if (!server) {
    console.warn(TAG, 'no subtitle server accepted', videoId);
    if (current && persianActive()) reloadCaptions();
    return;
  }
  if (!current) return;

  if (persianActive()) reloadCaptions();
  startPolling(videoId, server);
}

const registry = await ResolveCommandRegistry.getInstance();
const playerManager = await getPlayerManager();
player = playerManager.player as YTPlayer & CaptionApi;
console.info(TAG, 'servers:', SERVERS);

playerManager.addEventListener('playbackStart', function () {
  const videoId = this.currentVideoID;
  if (!videoId || this.playerMode !== PlayerMode.NORMAL) return;
  if (!isNewVisit(videoId)) return;
  if (SERVERS.length) {
    submit(videoId).catch((error: unknown) => {
      console.warn(TAG, 'could not submit', videoId, error);
    });
  }
  showPersian();
});
