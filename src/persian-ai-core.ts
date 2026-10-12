export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
}

const isEnglish = (track: CaptionTrack) =>
  track.languageCode === 'en' || track.languageCode.startsWith('en-');

export function pickEnglishTrack(
  tracks: readonly CaptionTrack[]
): CaptionTrack | undefined {
  return (
    tracks.find((t) => isEnglish(t) && t.kind !== 'asr') ??
    tracks.find((t) => isEnglish(t) && t.kind === 'asr')
  );
}

export function englishCaptionUrl(track: CaptionTrack): string {
  return track.baseUrl.replace(/&fmt=[^&]*/, '') + '&fmt=json3';
}

export function parseServers(list: string): string[] {
  return list
    .split(',')
    .map((server) => server.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function persianCaptionVideoId(url: string): string | null {
  if (!url.includes('/api/timedtext?') || !/[?&]tlang=fa(&|$)/.test(url)) {
    return null;
  }
  return /[?&]v=([\w-]{11})(&|$)/.exec(url)?.[1] ?? null;
}

export function serverCaptionUrl(
  server: string,
  videoId: string,
  positionMs: number
): string {
  return `${server}/v1/timedtext?v=${videoId}&t=${Math.max(0, Math.round(positionMs))}`;
}

export async function firstAccepting(
  servers: readonly string[],
  send: (server: string) => Promise<unknown>
): Promise<string | null> {
  for (const server of servers) {
    try {
      await send(server);
      return server;
    } catch {
      // `send` logs its own failure; try the next server.
    }
  }
  return null;
}

export function visitTracker(): (videoId: string) => boolean {
  let current: string | null = null;
  return (videoId) => {
    if (videoId === current) return false;
    current = videoId;
    return true;
  };
}

export async function submitVisit(
  videoId: string,
  servers: readonly string[],
  send: (server: string) => Promise<unknown>,
  serverFor: Map<string, string>
): Promise<string | null> {
  const server = await firstAccepting(servers, send);
  if (server) serverFor.set(videoId, server);
  else serverFor.delete(videoId);
  return server;
}
