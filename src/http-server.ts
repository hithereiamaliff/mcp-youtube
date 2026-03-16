import express, { Request, Response } from 'express';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createYouTubeMcpServer } from './server-utils.js';
import { isKeyServiceEnabled, resolveKeyCredentials } from './utils/key-service.js';

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

/**
 * Map Key Service resolve failure reason to HTTP error response.
 */
function sendKeyServiceError(res: Response, reason: 'invalid_key' | 'service_unavailable' | 'malformed_response'): void {
    if (reason === 'invalid_key') {
        res.status(401).json({ error: 'Invalid, revoked, or expired API key' });
    } else if (reason === 'service_unavailable') {
        res.status(502).json({ error: 'Credential service temporarily unavailable' });
    } else {
        res.status(502).json({ error: 'Credential service returned an unexpected response' });
    }
}

/**
 * Create MCP server with resolved API key and handle the transport lifecycle.
 */
async function serveMcpRequest(req: Request, res: Response, apiKey: string, transcriptLang?: string) {
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

/**
 * Key Service path-based handler — /mcp/:userKey
 * Only accepts usr_ prefixed keys. Rejects raw YouTube API keys.
 */
async function handleKeyServicePathRequest(req: Request, res: Response) {
    const rawKey = req.params.userKey;
    const userKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (!userKey || !userKey.startsWith('usr_')) {
        res.status(400).json({
            error: 'Only MCP Key Service keys (usr_...) are accepted in the URL path.',
            register: 'https://mcpkeys.techmavie.digital',
        });
        return;
    }

    if (!isKeyServiceEnabled()) {
        res.status(501).json({ error: 'Key service is not configured on this server' });
        return;
    }

    const result = await resolveKeyCredentials(userKey);
    if (!result.ok) {
        sendKeyServiceError(res, (result as { ok: false; reason: 'invalid_key' | 'service_unavailable' | 'malformed_response' }).reason);
        return;
    }

    const transcriptLang = getHeaderValue(req, 'x-youtube-transcript-lang') || getQueryValue(req, 'youtubeTranscriptLang');
    await serveMcpRequest(req, res, result.credentials.apiKey, transcriptLang);
}

/**
 * Hosted /mcp handler — Key Service only.
 * Accepts usr_ keys via X-API-Key header or api_key query param.
 */
async function handleHostedMcpRequest(req: Request, res: Response) {
    const userKey = getHeaderValue(req, 'x-api-key') || getQueryValue(req, 'api_key');

    if (!userKey || !userKey.startsWith('usr_')) {
        res.status(401).json({
            error: 'An MCP Key Service key (usr_...) is required.',
            register: 'https://mcpkeys.techmavie.digital',
            methods: {
                header: 'X-API-Key: usr_...',
                query: '?api_key=usr_...',
                path: '/mcp/usr_...',
            },
        });
        return;
    }

    if (!isKeyServiceEnabled()) {
        res.status(501).json({ error: 'Key service is not configured on this server' });
        return;
    }

    const result = await resolveKeyCredentials(userKey);
    if (!result.ok) {
        sendKeyServiceError(res, (result as { ok: false; reason: 'invalid_key' | 'service_unavailable' | 'malformed_response' }).reason);
        return;
    }

    const transcriptLang = getHeaderValue(req, 'x-youtube-transcript-lang') || getQueryValue(req, 'youtubeTranscriptLang');
    await serveMcpRequest(req, res, result.credentials.apiKey, transcriptLang);
}

// --- Routes ---

app.get('/', (_req: Request, res: Response) => {
    const keyServiceEnabled = isKeyServiceEnabled();
    res.json({
        name: 'youtube-mcp',
        transport: 'streamable-http',
        endpoints: {
            health: '/health',
            mcp: '/mcp',
            mcpKeyService: '/mcp/{usr_key}',
        },
        auth: {
            method: 'MCP Key Service',
            headerKey: 'X-API-Key',
            queryParam: 'api_key',
            pathParam: '/mcp/{usr_key}',
            optionalTranscriptLangHeader: 'x-youtube-transcript-lang',
            optionalTranscriptLangQuery: 'youtubeTranscriptLang',
            note: 'Authenticate with an MCP Key Service key (usr_...) via header, query param, or URL path.',
        },
        keyService: {
            enabled: keyServiceEnabled,
            register: 'https://mcpkeys.techmavie.digital',
            pathEndpoint: '/mcp/{usr_key}',
            queryEndpoint: '/mcp?api_key={usr_key}',
            headerKey: 'X-API-Key',
        },
    });
});

app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        server: 'youtube-mcp',
        keyServiceEnabled: isKeyServiceEnabled(),
        timestamp: new Date().toISOString(),
    });
});

app.all('/mcp/:userKey', handleKeyServicePathRequest);
app.all('/mcp', handleHostedMcpRequest);

app.listen(PORT, () => {
    console.log(`YouTube MCP HTTP server listening on port ${PORT}`);
    console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`Key Service endpoint: http://localhost:${PORT}/mcp/{usr_key}`);
    console.log(`Key Service: ${isKeyServiceEnabled() ? 'enabled' : 'not configured'}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});
