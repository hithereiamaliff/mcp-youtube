/**
 * MCP Key Service client for credential resolution.
 * Adapted from mcp-nextcloud, simplified for YouTube's single-credential model.
 */

const KEY_SERVICE_URL = process.env.KEY_SERVICE_URL?.replace(/\/+$/, '');
const KEY_SERVICE_TOKEN = process.env.KEY_SERVICE_TOKEN;

const CACHE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 5_000;
const CACHE_CLEANUP_INTERVAL_MS = 300_000;

export interface ResolvedCredentials {
    apiKey: string;
}

export type ResolveResult =
    | { ok: true; credentials: ResolvedCredentials }
    | { ok: false; reason: 'invalid_key' | 'service_unavailable' | 'malformed_response' };

interface CacheEntry {
    credentials: ResolvedCredentials;
    expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ResolveResult>>();

// Periodic cache cleanup
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
        if (entry.expiresAt <= now) {
            cache.delete(key);
        }
    }
}, CACHE_CLEANUP_INTERVAL_MS).unref();

export function isKeyServiceEnabled(): boolean {
    return !!(KEY_SERVICE_URL && KEY_SERVICE_TOKEN);
}

export async function resolveKeyCredentials(userKey: string): Promise<ResolveResult> {
    // Check cache first
    const cached = cache.get(userKey);
    if (cached && cached.expiresAt > Date.now()) {
        return { ok: true, credentials: cached.credentials };
    }

    // Deduplicate concurrent requests for the same key
    const existing = inFlight.get(userKey);
    if (existing) {
        return existing;
    }

    const promise = doResolve(userKey);
    inFlight.set(userKey, promise);

    try {
        return await promise;
    } finally {
        inFlight.delete(userKey);
    }
}

async function doResolve(userKey: string): Promise<ResolveResult> {
    if (!KEY_SERVICE_URL || !KEY_SERVICE_TOKEN) {
        return { ok: false, reason: 'service_unavailable' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(`${KEY_SERVICE_URL}/internal/resolve`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${KEY_SERVICE_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ key: userKey, server_id: 'youtube' }),
            signal: controller.signal,
        });

        if (response.status === 401 || response.status === 403) {
            return { ok: false, reason: 'invalid_key' };
        }

        if (!response.ok) {
            console.error(`Key service returned ${response.status}`);
            return { ok: false, reason: 'service_unavailable' };
        }

        const data = await response.json() as Record<string, unknown>;

        if (!data.valid) {
            return { ok: false, reason: 'invalid_key' };
        }

        const credentials = data.credentials as Record<string, unknown> | undefined;
        if (!credentials || typeof credentials.apiKey !== 'string' || !credentials.apiKey) {
            console.error('Key service response missing credentials.apiKey');
            return { ok: false, reason: 'malformed_response' };
        }

        const resolved: ResolvedCredentials = { apiKey: credentials.apiKey };

        // Cache successful resolutions only
        cache.set(userKey, {
            credentials: resolved,
            expiresAt: Date.now() + CACHE_TTL_MS,
        });

        return { ok: true, credentials: resolved };
    } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.error('Key service request timed out');
        } else {
            console.error('Key service request failed:', error instanceof Error ? error.message : String(error));
        }
        return { ok: false, reason: 'service_unavailable' };
    } finally {
        clearTimeout(timeout);
    }
}
