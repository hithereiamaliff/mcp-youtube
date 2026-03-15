import { fetchTranscript, TranscriptSegment, TranscriptError } from './transcript-provider.js';
import { TranscriptParams, SearchTranscriptParams } from '../types.js';

/**
 * Service for interacting with YouTube video transcripts.
 * Uses the adapter layer so the underlying library can be swapped without
 * changing the MCP tool contract.
 */
export class TranscriptService {
  private defaultLanguage?: string;
  private allowEnvLanguageFallback: boolean;

  constructor(defaultLanguage?: string, allowEnvLanguageFallback = true) {
    this.defaultLanguage = defaultLanguage;
    this.allowEnvLanguageFallback = allowEnvLanguageFallback;
  }

  private resolveLanguage(language?: string): string | undefined {
    return language
      || this.defaultLanguage
      || (this.allowEnvLanguageFallback ? process.env.YOUTUBE_TRANSCRIPT_LANG : undefined)
      || undefined;
  }

  /**
   * Get the transcript of a YouTube video.
   */
  async getTranscript({
    videoId,
    language,
  }: TranscriptParams): Promise<{
    videoId: string;
    language?: string;
    transcript: TranscriptSegment[];
  }> {
    try {
      const resolvedLanguage = this.resolveLanguage(language);
      const transcript = await fetchTranscript(videoId, resolvedLanguage ? { lang: resolvedLanguage } : undefined);

      return {
        videoId,
        language: resolvedLanguage,
        transcript,
      };
    } catch (error) {
      if (error instanceof TranscriptError) throw error;
      throw new Error(`Failed to get transcript: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Search within a transcript for matching text.
   */
  async searchTranscript({
    videoId,
    query,
    language,
  }: SearchTranscriptParams): Promise<{
    videoId: string;
    language?: string;
    query: string;
    matches: TranscriptSegment[];
    totalMatches: number;
  }> {
    try {
      const resolvedLanguage = this.resolveLanguage(language);
      const transcript = await fetchTranscript(videoId, resolvedLanguage ? { lang: resolvedLanguage } : undefined);

      const matches = transcript.filter((item) =>
        item.text.toLowerCase().includes(query.toLowerCase()),
      );

      return {
        videoId,
        language: resolvedLanguage,
        query,
        matches,
        totalMatches: matches.length,
      };
    } catch (error) {
      if (error instanceof TranscriptError) throw error;
      throw new Error(`Failed to search transcript: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get transcript with human-readable timestamps.
   */
  async getTimestampedTranscript({
    videoId,
    language,
  }: TranscriptParams): Promise<{
    videoId: string;
    language?: string;
    timestampedTranscript: Array<{
      timestamp: string;
      text: string;
      startTimeMs: number;
      durationMs: number;
    }>;
  }> {
    try {
      const resolvedLanguage = this.resolveLanguage(language);
      const transcript = await fetchTranscript(videoId, resolvedLanguage ? { lang: resolvedLanguage } : undefined);

      const timestampedTranscript = transcript.map((item) => {
        const seconds = item.offset / 1000;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        const formattedTime = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;

        return {
          timestamp: formattedTime,
          text: item.text,
          startTimeMs: item.offset,
          durationMs: item.duration,
        };
      });

      return {
        videoId,
        language: resolvedLanguage,
        timestampedTranscript,
      };
    } catch (error) {
      if (error instanceof TranscriptError) throw error;
      throw new Error(`Failed to get timestamped transcript: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
