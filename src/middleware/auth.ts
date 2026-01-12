import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from 'dotenv';

config();

export interface ApiKeyPermissions {
    description?: string;
    allowed_dbs: string[];
    read_only: boolean;
    write_dbs: string[];
    write_tables: string[];
}

declare module 'fastify' {
    interface FastifyRequest {
        apiKey: string;
        permissions: ApiKeyPermissions;
    }
}

// Default permissions for the static admin token
const ADMIN_PERMISSIONS: ApiKeyPermissions = {
    description: 'Static Admin Token',
    allowed_dbs: ['*'],
    read_only: false,
    write_dbs: ['*'],
    write_tables: ['*']
};

/**
 * Authentication middleware - validates x-api-key header against env API_TOKEN
 */
export async function authMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    // Skip auth for health check and swagger docs
    if (request.url === '/health' ||
        request.url.startsWith('/docs') ||
        request.url.startsWith('/documentation')) {
        return;
    }

    const apiKey = request.headers['x-api-key'] as string;
    const staticToken = process.env.API_TOKEN;

    if (!staticToken) {
        request.log.error('API_TOKEN environment variable is not set!');
        reply.code(500).send({
            success: false,
            error: 'Server configuration error',
            data: null,
        });
        return;
    }

    if (!apiKey) {
        reply.code(401).send({
            success: false,
            error: 'Missing API key. Include x-api-key header.',
            data: null,
        });
        return;
    }

    if (apiKey !== staticToken) {
        reply.code(401).send({
            success: false,
            error: 'Invalid API key.',
            data: null,
        });
        return;
    }

    // Attach to request for use in routes
    request.apiKey = apiKey;
    request.permissions = ADMIN_PERMISSIONS;
}