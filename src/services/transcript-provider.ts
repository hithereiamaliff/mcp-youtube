import {
  fetchTranscript as fetchYoutubeTranscript,
  YoutubeTranscriptVideoUnavailableError,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptInvalidVideoIdError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
} from 'youtube-transcript-plus';

const NAMED_HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': '\'',
  '&apos;': '\'',
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|apos|#39);|&#(\d+);|&#x([0-9a-fA-F]+);/g, (match, decimal, hex) => {
    if (decimal) {
      return String.fromCodePoint(parseInt(decimal, 10));
    }
    if (hex) {
      return String.fromCodePoint(parseInt(hex, 16));
    }
    return NAMED_HTML_ENTITIES[match] ?? match;
  });
}

function toMilliseconds(value: number): number {
  return Math.round(value * 1000);
}

/**
 * Normalized transcript segment returned by the adapter.
 * Stable contract — does not change if we swap the underlying library.
 */
export interface TranscriptSegment {
  text: string;
  offset: number;   // start time in milliseconds
  duration: number;  // duration in milliseconds
}

export interface TranscriptFetchOptions {
  lang?: string;
}

/**
 * Error thrown when transcript retrieval fails.
 * Carries a user-friendly message suitable for MCP responses.
 */
export class TranscriptError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_VIDEO_ID' | 'VIDEO_UNAVAILABLE' | 'CAPTIONS_DISABLED' | 'CAPTIONS_NOT_AVAILABLE' | 'LANGUAGE_NOT_AVAILABLE' | 'RATE_LIMITED' | 'PROVIDER_FAILURE',
  ) {
    super(message);
    this.name = 'TranscriptError';
  }
}

/**
 * Fetch transcript segments for a YouTube video.
 * Wraps the underlying library so the rest of the codebase stays decoupled.
 */
export async function fetchTranscript(
  videoId: string,
  options?: TranscriptFetchOptions,
): Promise<TranscriptSegment[]> {
  try {
    const config = options?.lang ? { lang: options.lang } : undefined;
    const raw = await fetchYoutubeTranscript(videoId, config);

    if (!raw || raw.length === 0) {
      throw new TranscriptError(
        `No transcript is available for video "${videoId}". The video may not have captions.`,
        'CAPTIONS_NOT_AVAILABLE',
      );
    }

    return raw.map((item) => ({
      text: decodeHtmlEntities(item.text),
      offset: toMilliseconds(item.offset),
      duration: toMilliseconds(item.duration),
    }));
  } catch (error: unknown) {
    // Re-throw our own errors
    if (error instanceof TranscriptError) {
      throw error;
    }

    if (error instanceof YoutubeTranscriptInvalidVideoIdError) {
      throw new TranscriptError(
        `Invalid YouTube video ID "${videoId}". Please provide a valid 11-character video ID or YouTube URL.`,
        'INVALID_VIDEO_ID',
      );
    }
    if (error instanceof YoutubeTranscriptVideoUnavailableError) {
      throw new TranscriptError(
        `Video "${videoId}" is unavailable. It may be private, deleted, or region-restricted.`,
        'VIDEO_UNAVAILABLE',
      );
    }
    if (error instanceof YoutubeTranscriptDisabledError) {
      throw new TranscriptError(
        `Captions are disabled for video "${videoId}".`,
        'CAPTIONS_DISABLED',
      );
    }
    if (error instanceof YoutubeTranscriptNotAvailableLanguageError) {
      throw new TranscriptError(
        `Transcript not available in the requested language for video "${videoId}". ${error.message}`,
        'LANGUAGE_NOT_AVAILABLE',
      );
    }
    if (error instanceof YoutubeTranscriptNotAvailableError) {
      throw new TranscriptError(
        `No transcript is available for video "${videoId}". The video may not have captions.`,
        'CAPTIONS_NOT_AVAILABLE',
      );
    }
    if (error instanceof YoutubeTranscriptTooManyRequestError) {
      throw new TranscriptError(
        'Too many requests to YouTube. Please wait a moment and try again.',
        'RATE_LIMITED',
      );
    }

    // Unknown / generic failure — preserve as PROVIDER_FAILURE
    const msg = error instanceof Error ? error.message : String(error);
    throw new TranscriptError(
      `Failed to fetch transcript for video "${videoId}": ${msg}`,
      'PROVIDER_FAILURE',
    );
  }
}
