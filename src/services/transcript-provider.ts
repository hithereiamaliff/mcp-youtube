import {
  fetchTranscript as fetchYoutubeTranscript,
  YoutubeTranscriptVideoUnavailableError,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
} from 'youtube-transcript/dist/youtube-transcript.esm.js';

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
    public readonly code: 'VIDEO_UNAVAILABLE' | 'CAPTIONS_DISABLED' | 'CAPTIONS_NOT_AVAILABLE' | 'LANGUAGE_NOT_AVAILABLE' | 'RATE_LIMITED' | 'PROVIDER_FAILURE',
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

    return raw.map((item) => ({
      text: item.text,
      offset: item.offset,
      duration: item.duration,
    }));
  } catch (error: unknown) {
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

    // Unknown / generic failure
    const msg = error instanceof Error ? error.message : String(error);
    throw new TranscriptError(
      `Failed to fetch transcript for video "${videoId}": ${msg}`,
      'PROVIDER_FAILURE',
    );
  }
}
