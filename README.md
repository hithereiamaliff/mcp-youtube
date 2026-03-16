# YouTube MCP Server

[![smithery badge](https://smithery.ai/badge/@sfiorini/youtube-mcp)](https://smithery.ai/server/@sfiorini/youtube-mcp)

A Model Context Protocol (MCP) server for YouTube that exposes video, channel, playlist, and transcript tools over MCP.

> Fork notice: This repository is a maintained fork of [sfiorini/youtube-mcp](https://github.com/sfiorini/youtube-mcp).
>
> Deployment: Available via Smithery and self-hosted VPS with MCP Key Service integration.
>
> Current package identity: The published Smithery/NPM package remains `@sfiorini/youtube-mcp` for now, while this repository is the maintained GitHub fork behind the fixes.

## Features

### Video Tools
* `videos_getVideo` - Get video details with direct URL and normalized `videoId`
* `videos_searchVideos` - Search YouTube videos with direct URLs in results

### Transcript Tools
* `transcripts_getTranscript` - Get a transcript for a video
* `transcripts_searchTranscript` - Search within a transcript
* `transcripts_getTimestampedTranscript` - Get transcript segments with human-readable timestamps

Transcript language behavior:
* If `YOUTUBE_TRANSCRIPT_LANG` is unset and no per-request `language` is passed, the server lets YouTube choose the default caption track for that video.
* If `language` is provided, the server requests that specific caption language.

### Channel Tools
* `channels_getChannel` - Get channel details and statistics
* `channels_listVideos` - List videos for a channel

### Playlist Tools
* `playlists_getPlaylist` - Get playlist details
* `playlists_getPlaylistItems` - List playlist items

### Resources And Prompts
* Resource `youtube://info` - Server information and tool documentation
* Resource `youtube://transcript/{videoId}` - Direct transcript access by URI
* Prompt `summarize-video` - Ask the client to summarize a video transcript
* Prompt `analyze-channel` - Ask the client to analyze a channel

## Installation

### Smithery

Install via Smithery for Claude Desktop:

```bash
npx -y @smithery/cli@latest install @sfiorini/youtube-mcp --client claude
```

### Hosted Deployment (MCP Key Service)

Register your YouTube API key at [mcpkeys.techmavie.digital](https://mcpkeys.techmavie.digital) to get a `usr_...` key, then use:

```text
https://mcp.techmavie.digital/youtube/mcp/usr_YOUR_KEY_HERE
```

Alternative methods (same endpoint, different key delivery):
* Query param: `https://mcp.techmavie.digital/youtube/mcp?api_key=usr_...`
* Header: `X-API-Key: usr_...` to `https://mcp.techmavie.digital/youtube/mcp`

### Hosted HTTP Deployment (Direct Header Auth)

For direct header-based auth without Key Service:

```text
https://mcp.techmavie.digital/youtube/mcp
```

Request-scoped config:
* `x-youtube-api-key` header - required for YouTube Data API tools
* `youtubeTranscriptLang` query param - optional default transcript language for that request

Notes:
* The transcript tools can still work without a YouTube Data API key.
* Raw YouTube API keys in URL paths are not accepted — only `usr_...` keys from the Key Service.

### Claude Desktop

Install the package:

```bash
npm install -g @sfiorini/youtube-mcp
```

Then add this to Claude Desktop config:

```json
{
  "mcpServers": {
    "youtube": {
      "command": "youtube-mcp",
      "env": {
        "YOUTUBE_API_KEY": "your_youtube_api_key_here"
      }
    }
  }
}
```

### NPX

```json
{
  "mcpServers": {
    "youtube": {
      "command": "npx",
      "args": ["-y", "@sfiorini/youtube-mcp"],
      "env": {
        "YOUTUBE_API_KEY": "your_youtube_api_key_here"
      }
    }
  }
}
```

### VS Code

Add this to VS Code user settings JSON or `.vscode/mcp.json`:

```json
{
  "mcp": {
    "inputs": [
      {
        "type": "promptString",
        "id": "apiKey",
        "description": "YouTube API Key",
        "password": true
      }
    ],
    "servers": {
      "youtube": {
        "command": "npx",
        "args": ["-y", "@sfiorini/youtube-mcp"],
        "env": {
          "YOUTUBE_API_KEY": "${input:apiKey}"
        }
      }
    }
  }
}
```

## Configuration

### Environment Variables

For local stdio usage:
* `YOUTUBE_API_KEY` - Required for YouTube Data API operations
* `YOUTUBE_TRANSCRIPT_LANG` - Optional default transcript language. Leave unset to let YouTube choose the default caption track for each video.

### Hosted Deployment Variables

For VPS/Docker deployment with Key Service:
* `KEY_SERVICE_URL` - URL of the MCP Key Service (e.g., `https://mcpkeys.techmavie.digital`)
* `KEY_SERVICE_TOKEN` - Server-specific bearer token for the Key Service
* `YOUTUBE_TRANSCRIPT_LANG` - Optional default transcript language

### Smithery Configuration

Smithery config keeps both fields optional:
* `youtubeApiKey` - For hosted HTTP deployment, Smithery should forward this as the `x-youtube-api-key` header
* `youtubeTranscriptLang` - Optional. Leave blank to auto-detect from the video's available captions

### YouTube API Setup

1. Open [Google Cloud Console](https://console.cloud.google.com).
2. Create or select a project.
3. Enable YouTube Data API v3.
4. Create an API key.
5. Use that key in your MCP config.

## Development

```bash
npm install
npm run build
npm run lint
npm run typecheck
npm start
```

Notes:
* `npm start` runs the local stdio server and expects `YOUTUBE_API_KEY` for YouTube Data API tools.
* `npm run start:http` runs the hosted Streamable HTTP server and does not require a shared server-wide YouTube API key.

## Architecture

This repo uses a shared service-based MCP design:

* `src/server-utils.ts` - Registers all tools, resources, and prompts
* `src/index.ts` - Smithery entry point
* `src/cli.ts` and `src/server.ts` - Local stdio startup path
* `src/http-server.ts` - Hosted Streamable HTTP server with Key Service + direct header auth
* `src/utils/key-service.ts` - MCP Key Service client (credential resolution with caching)
* `src/services/` - Service layer for videos, channels, playlists, and transcripts
* `src/services/transcript-provider.ts` - Transcript adapter layer so the MCP contract stays stable if the underlying provider changes

Project structure:

```text
src/
|-- server-utils.ts
|-- index.ts
|-- server.ts
|-- cli.ts
|-- http-server.ts
|-- utils/
|   `-- key-service.ts
|-- services/
|   |-- video.ts
|   |-- transcript.ts
|   |-- transcript-provider.ts
|   |-- playlist.ts
|   `-- channel.ts
|-- types.ts
`-- types/
```

## License

MIT
