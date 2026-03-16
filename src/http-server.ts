import express, { Request, Response } from 'express';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { configJsonSchema } from './index.js';
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

function extractRequestConfig(req: Request): { apiKey?: string; transcriptLang?: string } {
    return {
        apiKey: getHeaderValue(req, 'x-youtube-api-key'),
        transcriptLang: getHeaderValue(req, 'x-youtube-transcript-lang') || getQueryValue(req, 'youtubeTranscriptLang'),
    };
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
 * Smithery handler — direct header auth only, unchanged.
 */
async function handleMcpRequest(req: Request, res: Response) {
    const { apiKey, transcriptLang } = extractRequestConfig(req);
    await serveMcpRequest(req, res, apiKey ?? '', transcriptLang);
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
 * Hosted /mcp handler — dual-mode:
 * 1. Key Service via X-API-Key header or api_key query param (usr_... keys)
 * 2. Direct header auth via x-youtube-api-key (existing behavior)
 */
async function handleHostedMcpRequest(req: Request, res: Response) {
    // Check for usr_ key via header or query param
    const userKey = getHeaderValue(req, 'x-api-key') || getQueryValue(req, 'api_key');

    if (userKey && userKey.startsWith('usr_')) {
        // Key Service mode
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
        return;
    }

    // Fall through to direct header auth
    await handleMcpRequest(req, res);
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
            smithery: '/smithery/mcp',
            mcpConfig: '/.well-known/mcp-config',
        },
        auth: {
            youtubeApiKeyHeader: 'x-youtube-api-key',
            optionalTranscriptLangHeader: 'x-youtube-transcript-lang',
            optionalTranscriptLangQuery: 'youtubeTranscriptLang',
            note: 'Send the YouTube API key via request header, or use an MCP Key Service key (usr_...) in the URL path.',
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

app.get('/.well-known/mcp-config', (_req: Request, res: Response) => {
    res.json(configJsonSchema);
});

app.all('/mcp/:userKey', handleKeyServicePathRequest);
app.all('/mcp', handleHostedMcpRequest);
app.all('/smithery/mcp', handleMcpRequest);

app.listen(PORT, () => {
    console.log(`YouTube MCP HTTP server listening on port ${PORT}`);
    console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`Key Service endpoint: http://localhost:${PORT}/mcp/{usr_key}`);
    console.log(`Smithery endpoint: http://localhost:${PORT}/smithery/mcp`);
    console.log(`Key Service: ${isKeyServiceEnabled() ? 'enabled' : 'not configured'}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});
