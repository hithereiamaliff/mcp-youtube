import { z } from 'zod';
import { createYouTubeMcpServer } from './server-utils.js';

// Configuration schema for Smithery
export const configSchema = z.object({
    youtubeApiKey: z.string().optional().describe("Your YouTube Data API v3 key. Required for YouTube Data API operations."),
    youtubeTranscriptLang: z.string().optional().describe("Default language code for YouTube transcripts (e.g., 'en', 'es', 'fr', 'de', 'ms', 'th'). Leave blank to auto-detect from video."),
});

// Export JSON schema for Smithery
export const configJsonSchema = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "http://smithery-1f4f267c-d6d8-4f88-8fed-228b834c308f.fly.dev/.well-known/mcp-config",
    "title": "YouTube MCP Server Configuration",
    "description": "Configuration schema for the YouTube Model Context Protocol (MCP) Server. This server provides tools for accessing YouTube video information, transcripts, channel data, and playlists.",
    "type": "object",
    "properties": {
        "youtubeApiKey": {
            "type": "string",
            "title": "YouTube Data API Key",
            "description": "Your YouTube Data API v3 key. Required for YouTube Data API operations.",
            "secret": true,
            "x-from": "header",
            "x-header-name": "x-youtube-api-key"
        },
        "youtubeTranscriptLang": {
            "type": "string",
            "title": "Default Transcript Language",
            "description": "Default language code for YouTube transcripts (e.g., 'en', 'es', 'fr', 'de', 'ms', 'th'). Leave blank to auto-detect from video.",
            "x-from": "query"
        }
    },
    "required": [],
    "additionalProperties": false,
    "x-query-style": "dot+bracket"
};

// Required: Export default createServer function for Smithery
export default function createServer({ config }: { config?: z.infer<typeof configSchema> }) {
    const server = createYouTubeMcpServer({
        apiKey: config?.youtubeApiKey,
        transcriptLang: config?.youtubeTranscriptLang,
    });

    // Must return the MCP server object for Smithery
    return server.server;
}
