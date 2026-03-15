declare module 'youtube-transcript/dist/youtube-transcript.esm.js' {
  export {
    YoutubeTranscriptError,
    YoutubeTranscriptTooManyRequestError,
    YoutubeTranscriptVideoUnavailableError,
    YoutubeTranscriptDisabledError,
    YoutubeTranscriptNotAvailableError,
    YoutubeTranscriptNotAvailableLanguageError,
    YoutubeTranscript,
    fetchTranscript,
  } from 'youtube-transcript';
  export type { TranscriptConfig, TranscriptResponse } from 'youtube-transcript';
}
