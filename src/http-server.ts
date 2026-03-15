import express, { Request, Response } from 'express';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { configJsonSchema } from './index.js';
import { createYouTubeMcpServer } from './server-utils.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const app = express();

app.use(cors());
app.use(express.json());

function getHeaderValue(req: Request, name: string): string | undefined {
    const value = req.headers[name.toLowerCase()];
    if (typeof value === 'string' && value.trim()) {
        return value.trim();
    }
    if (Array.isArray(value)) {
        const first = value.find((item) => typeof item === 'string' && item.trim());
        return first?.trim();
    }
    return undefined;
}

function getQueryValue(req: Request, key: string): string | undefined {
    const candidates = [
        req.query[key],
        req.query[`config[${key}]`],
        req.query[`config.${key}`],
    ];

    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
        if (Array.isArray(candidate)) {
            const first = candidate.find((item) => typeof item === 'string' && item.trim());
            if (typeof first === 'string') {
                return first.trim();
            }
        }
    }

    return undefined;
}

function extractRequestConfig(req: Request): { apiKey?: string; transcriptLang?: string } {
    return {
        apiKey: getHeaderValue(req, 'x-youtube-api-key'),
        transcriptLang: getHeaderValue(req, 'x-youtube-transcript-lang') || getQueryValue(req, 'youtubeTranscriptLang'),
    };
}

async function handleMcpRequest(req: Request, res: Response) {
    const { apiKey, transcriptLang } = extractRequestConfig(req);

    try {
        const server = createYouTubeMcpServer({
            apiKey,
            transcriptLang,
            allowEnvApiKeyFallback: false,
            allowEnvTranscriptLangFallback: false,
        });

        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });

        let cleanedUp = false;
        const cleanup = () => {
            if (cleanedUp) return;
            cleanedUp = true;
            void transport.close();
            void server.close();
        };

        res.once('finish', cleanup);
        res.once('close', cleanup);

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);

        if (res.writableEnded) {
            cleanup();
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('MCP request error:', msg);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

app.get('/', (_req: Request, res: Response) => {
    res.json({
        name: 'youtube-mcp',
        transport: 'streamable-http',
        deployment: 'smithery-direct-config',
        endpoints: {
            health: '/health',
            mcp: '/mcp',
            smithery: '/smithery/mcp',
            mcpConfig: '/.well-known/mcp-config',
        },
        auth: {
            youtubeApiKeyHeader: 'x-youtube-api-key',
            optionalTranscriptLangHeader: 'x-youtube-transcript-lang',
            optionalTranscriptLangQuery: 'youtubeTranscriptLang',
            note: 'Send the YouTube API key via request header. Raw API keys in URL paths are not supported.',
        },
    });
});

app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        server: 'youtube-mcp',
        timestamp: new Date().toISOString(),
    });
});

app.get('/.well-known/mcp-config', (_req: Request, res: Response) => {
    res.json(configJsonSchema);
});

app.all('/mcp/:apiKey', (_req: Request, res: Response) => {
    res.status(400).json({
        error: 'Passing YouTube API keys in the URL path is no longer supported.',
        useInstead: {
            endpoint: '/mcp',
            youtubeApiKeyHeader: 'x-youtube-api-key',
            optionalTranscriptLangQuery: 'youtubeTranscriptLang',
        },
    });
});

app.all('/mcp', handleMcpRequest);
app.all('/smithery/mcp', handleMcpRequest);

app.listen(PORT, () => {
    console.log(`YouTube MCP HTTP server listening on port ${PORT}`);
    console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`Smithery endpoint: http://localhost:${PORT}/smithery/mcp`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});
