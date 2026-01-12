import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { config } from 'dotenv';
import { queryRoutes } from './routes/query.js';
import { authMiddleware } from './middleware/auth.js';
import { connectionManager } from './services/connectionManager.js';

// Load environment variables
config();

const HOST = process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '8001', 10);

// Create Fastify instance with performance optimizations
const fastify = Fastify({
    logger: {
        level: 'warn',
    },
    disableRequestLogging: true,
    trustProxy: true,
});

// Register Swagger
await fastify.register(fastifySwagger, {
    openapi: {
        info: {
            title: 'SQL Bridge Gateway API',
            description: 'Execute SQL queries to multiple databases on SQL Server via REST API',
            version: '1.0.0',
        },
        servers: [
            { url: `http://localhost:${PORT}`, description: 'Local server' },
        ],
        components: {
            securitySchemes: {
                apiKey: {
                    type: 'apiKey',
                    name: 'x-api-key',
                    in: 'header',
                    description: 'API Key for authentication',
                },
            },
        },
        security: [{ apiKey: [] }],
    },
});

// Register Swagger UI at /docs
await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
        persistAuthorization: true,
    },
    staticCSP: true,
});

// Register auth middleware
fastify.addHook('preHandler', authMiddleware);

// Health check endpoint (no auth required)
fastify.get('/health', {
    schema: {
        tags: ['Health'],
        summary: 'Health check',
        response: {
            200: {
                type: 'object',
                properties: {
                    status: { type: 'string' },
                    timestamp: { type: 'string' },
                },
            },
        },
    },
}, async () => {
    return {
        status: 'ok',
        timestamp: new Date().toISOString(),
    };
});

// Register query routes
fastify.register(queryRoutes, { prefix: '/v1' });

// Graceful shutdown
const gracefulShutdown = async () => {
    console.log('Shutting down gracefully...');
    await connectionManager.closeAll();
    await fastify.close();
    process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const start = async () => {
    try {
        // Pre-warm connection
        await connectionManager.warmUp();

        await fastify.listen({ port: PORT, host: HOST });
        console.log(`🚀 SQL Bridge Gateway running at http://${HOST}:${PORT}`);
        console.log(`📚 Swagger docs: http://localhost:${PORT}/docs`);
    } catch (err) {
        console.error('Startup error:', err);
        process.exit(1);
    }
};

start();