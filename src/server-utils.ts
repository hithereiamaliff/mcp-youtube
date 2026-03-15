import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { VideoService } from './services/video.js';
import { TranscriptService } from './services/transcript.js';
import { PlaylistService } from './services/playlist.js';
import { ChannelService } from './services/channel.js';

const packageVersion = '0.1.12';

export interface CreateServerOptions {
    apiKey?: string;
    transcriptLang?: string;
    allowEnvApiKeyFallback?: boolean;
    allowEnvTranscriptLangFallback?: boolean;
}

/**
 * Creates and configures a YouTube MCP server with all tools, resources, and prompts registered
 */
export function createYouTubeMcpServer(options?: CreateServerOptions) {
    const server = new McpServer({
        name: 'youtube-mcp',
        version: packageVersion,
    }, {
        capabilities: {
            resources: {},
            prompts: {},
            tools: {},
        }
    });

    const apiKey = options?.apiKey;
    const allowEnvApiKeyFallback = options?.allowEnvApiKeyFallback ?? true;
    const allowEnvTranscriptLangFallback = options?.allowEnvTranscriptLangFallback ?? true;
    const videoService = new VideoService(apiKey, allowEnvApiKeyFallback);
    const transcriptService = new TranscriptService(options?.transcriptLang, allowEnvTranscriptLangFallback);
    const playlistService = new PlaylistService(apiKey, allowEnvApiKeyFallback);
    const channelService = new ChannelService(apiKey, allowEnvApiKeyFallback);

    // Register static resource for Smithery discovery
    server.registerResource(
        'info',
        'youtube://info',
        {
            title: 'YouTube MCP Server Information',
            description: 'Information about available YouTube MCP resources and how to use them',
            mimeType: 'application/json',
        },
        async (uri) => ({
            contents: [{
                uri: uri.href,
                text: JSON.stringify({
                    message: "YouTube MCP Server Resources",
                    availableResources: {
                        transcripts: {
                            description: "Access YouTube video transcripts",
                            uriPattern: "youtube://transcript/{videoId}",
                            example: "youtube://transcript/dQw4w9WgXcQ",
                            note: "Replace {videoId} with actual YouTube video ID"
                        }
                    },
                    tools: [
                        "videos_getVideo",
                        "videos_searchVideos",
                        "transcripts_getTranscript",
                        "transcripts_searchTranscript",
                        "transcripts_getTimestampedTranscript",
                        "channels_getChannel",
                        "channels_listVideos",
                        "playlists_getPlaylist",
                        "playlists_getPlaylistItems"
                    ],
                    prompts: [
                        "summarize-video",
                        "analyze-channel"
                    ]
                }, null, 2)
            }]
        })
    );

    // Register dynamic resource for transcripts
    server.registerResource(
        'transcript',
        new ResourceTemplate('youtube://transcript/{videoId}', { list: undefined }),
        {
            title: 'YouTube Video Transcript',
            description: 'Get the transcript for a YouTube video. Use URI format: youtube://transcript/{videoId}',
            mimeType: 'application/json',
        },
        async (uri, variables) => {
            const { videoId } = variables as unknown as { videoId: string };
            const result = await transcriptService.getTranscript({ videoId });
            return {
                contents: [{
                    uri: uri.href,
                    text: JSON.stringify(result, null, 2),
                    mimeType: "application/json"
                }]
            };
        }
    );

    // Register prompts
    server.registerPrompt(
        'summarize-video',
        {
            description: "Summarize a YouTube video",
            argsSchema: {
                videoId: z.string().describe("The ID of the video to summarize")
            }
        },
        ({ videoId }) => ({
            messages: [{
                role: 'user',
                content: {
                    type: 'text',
                    text: `Please get the transcript for video ID ${videoId} and summarize the key points.`
                }
            }]
        })
    );

    server.registerPrompt(
        'analyze-channel',
        {
            description: "Analyze a YouTube channel",
            argsSchema: {
                channelId: z.string().describe("The ID of the channel to analyze")
            }
        },
        ({ channelId }) => ({
            messages: [{
                role: 'user',
                content: {
                    type: 'text',
                    text: `Please analyze the channel with ID ${channelId}. Look at its recent videos, playlists, and statistics to provide an overview of its content strategy and performance.`
                }
            }]
        })
    );

    // Register video tools
    server.registerTool(
        'videos_getVideo',
        {
            title: 'Get Video Details',
            description: 'Get detailed information about a YouTube video including URL',
            annotations: { readOnlyHint: true, idempotentHint: true },
            inputSchema: {
                videoId: z.string().describe('The YouTube video ID'),
                parts: z.array(z.string()).optional().describe('Parts of the video to retrieve'),
            },
        },
        async ({ videoId, parts }) => {
            const result = await videoService.getVideo({ videoId, parts });
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                }]
            };
        }
    );

    server.registerTool(
        'videos_searchVideos',
        {
            title: 'Search Videos',
            description: 'Search for videos on YouTube and return results with URLs',
            annotations: { readOnlyHint: true, idempotentHint: true },
            inputSchema: {
                query: z.string().describe('Search query'),
                maxResults: z.number().optional().describe('Maximum number of results to return'),
            },
        },
        async ({ query, maxResults }) => {
            const result = await videoService.searchVideos({ query, maxResults });
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                }]
            };
        }
    );

    // Register transcript tool
    server.registerTool(
        'transcripts_getTranscript',
        {
            title: 'Get Video Transcript',
            description: 'Get the transcript of a YouTube video',
            annotations: { readOnlyHint: true, idempotentHint: true },
            inputSchema: {
                videoId: z.string().describe('The YouTube video ID'),
                language: z.string().optional().describe('Language code for the transcript'),
            },
        },
        async ({ videoId, language }) => {
            const result = await transcriptService.getTranscript({ videoId, language });
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                }]
            };
        }
    );

    // Register transcript search tool
    server.registerTool(
        'transcripts_searchTranscript',
        {
            title: 'Search Video Transcript',
            description: 'Search within a YouTube video transcript for specific text',
            annotations: { readOnlyHint: true, idempotentHint: true },
            inputSchema: {
                videoId: z.string().describe('The YouTube video ID'),
                query: z.string().describe('Text to search for within the transcript'),
                language: z.string().optional().describe('Language code for the transcript'),
            },
        },
        async ({ videoId, query, language }) => {
            const result = await transcriptService.searchTranscript({ videoId, query, language });
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                }]
            };
        }
    );

    // Register timestamped transcript tool
    server.registerTool(
        'transcripts_getTimestampedTranscript',
        {
            title: 'Get Timestamped Transcript',
            description: 'Get a YouTube video transcript with human-readable timestamps',
            annotations: { readOnlyHint: true, idempotentHint: true },
            inputSchema: {
                videoId: z.string().describe('The YouTube video ID'),
                language: z.string().optional().describe('Language code for the transcript'),
            },
        },
        async ({ videoId, language }) => {
            const result = await transcriptService.getTimestampedTranscript({ videoId, language });
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                }]
            };
        }
    );

    // Register channel tools
    server.registerTool(
        'channels_getChannel',
        {
            title: 'Get Channel Information',
            description: 'Get information about a YouTube channel',
            annotations: { readOnlyHint: true, idempotentHint: true },
            inputSchema: {
                channelId: z.string().describe('The YouTube channel ID'),
            },
        },
        async ({ channelId }) => {
            const result = await channelService.getChannel({ channelId });
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                }]
            };
        }
    );

    server.registerTool(
        'channels_listVideos',
        {
            title: 'List Channel Videos',
            description: 'Get videos from a specific channel',
            annotations: { readOnlyHint: true, idempotentHint: true },
            inputSchema: {
                channelId: z.string().describe('The YouTube channel ID'),
                maxResults: z.number().optional().describe('Maximum number of results to return'),
            },
        },
        async ({ channelId, maxResults }) => {
            const result = await channelService.listVideos({ channelId, maxResults });
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                }]
            };
        }
    );

    // Register playlist tools
    server.registerTool(
        'playlists_getPlaylist',
        {
            title: 'Get Playlist Information',
            description: 'Get information about a YouTube playlist',
            annotations: { readOnlyHint: true, idempotentHint: true },
            inputSchema: {
                playlistId: z.string().describe('The YouTube playlist ID'),
            },
        },
        async ({ playlistId }) => {
            const result = await playlistService.getPlaylist({ playlistId });
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                }]
            };
        }
    );

    server.registerTool(
        'playlists_getPlaylistItems',
        {
            title: 'Get Playlist Items',
            description: 'Get videos in a YouTube playlist',
            annotations: { readOnlyHint: true, idempotentHint: true },
            inputSchema: {
                playlistId: z.string().describe('The YouTube playlist ID'),
                maxResults: z.number().optional().describe('Maximum number of results to return'),
            },
        },
        async ({ playlistId, maxResults }) => {
            const result = await playlistService.getPlaylistItems({ playlistId, maxResults });
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                }]
            };
        }
    );

    return server;
}
