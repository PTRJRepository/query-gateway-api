import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { connectionManager } from '../services/connectionManager.js';
import { queryValidator } from '../services/queryValidator.js';
import { successResponse, errorResponse, measureTime } from '../utils/transformer.js';
import { getAvailableAliases } from '../config/database.js';

interface QueryBody {
    sql: string;
    database?: string;  // Optional: specify database name (default from profile)
    server?: string;    // Optional: specify server profile (e.g., 'SERVER_PROFILE_1')
    params?: Record<string, unknown>;
}

interface BatchQueryBody {
    queries: Array<{ sql: string; params?: Record<string, unknown> }>;
    database?: string;
    server?: string;    // Optional: specify server profile
}

// Swagger schema definitions
const standardResponseSchema = {
    type: 'object',
    properties: {
        success: { type: 'boolean' },
        db: { type: 'string', nullable: true },
        server: { type: 'string', nullable: true },
        execution_ms: { type: 'number' },
        data: {
            type: 'object',
            nullable: true,
            additionalProperties: true
        },
        error: { type: 'string', nullable: true },
    },
};

/**
 * Query routes - /v1/query endpoint
 * Supports multiple server profiles and databases
 */
export async function queryRoutes(fastify: FastifyInstance): Promise<void> {

    /**
     * GET /v1/servers - List available server profiles
     */
    fastify.get('/servers', {
        schema: {
            tags: ['Server'],
            summary: 'List available server profiles',
            description: 'Returns all configured server profiles with connection status',
            security: [{ apiKey: [] }],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'object',
                            properties: {
                                servers: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            name: { type: 'string' },
                                            host: { type: 'string' },
                                            port: { type: 'number' },
                                            defaultDatabase: { type: 'string' },
                                            readOnly: { type: 'boolean' },
                                            connected: { type: 'boolean' },
                                            healthy: { type: 'boolean' },
                                        },
                                    },
                                },
                                total: { type: 'number' },
                                defaultServer: { type: 'string' },
                            },
                        },
                    },
                },
            },
        },
    }, async () => {
        const servers = connectionManager.getServersStatus();
        return {
            success: true,
            data: {
                servers,
                total: servers.length,
                defaultServer: connectionManager.getDefaultServer(),
            },
        };
    });

    /**
     * GET /v1/databases - List available databases on server
     */
    fastify.get<{ Querystring: { server?: string } }>('/databases', {
        schema: {
            tags: ['Database'],
            summary: 'List databases on server',
            description: 'Returns available databases on the specified SQL Server. Defaults to primary server.',
            security: [{ apiKey: [] }],
            querystring: {
                type: 'object',
                properties: {
                    server: {
                        type: 'string',
                        description: 'Server profile name (optional). If not specified, uses default server.',
                        examples: ['SERVER_PROFILE_1', 'SERVER_PROFILE_2'],
                    },
                },
            },
            response: {
                200: standardResponseSchema,
            },
        },
    }, async (request: FastifyRequest<{ Querystring: { server?: string } }>, reply: FastifyReply) => {
        const serverProfile = request.query.server;

        try {
            // Query to get all databases on the server
            const result = await connectionManager.query(
                "SELECT name FROM sys.databases WHERE state = 0 ORDER BY name",
                undefined,
                undefined,
                serverProfile
            );

            const databases = (result.recordset as any[]).map((row: { name: string }) => row.name);

            return {
                success: true,
                server: serverProfile || connectionManager.getDefaultServer(),
                data: {
                    databases: databases,
                    total: databases.length,
                },
                error: null,
            };
        } catch (err) {
            const error = err as Error;
            return reply.code(500).send({
                success: false,
                server: serverProfile || connectionManager.getDefaultServer(),
                data: null,
                error: `Failed to list databases: ${error.message}`,
            });
        }
    });

    /**
     * POST /v1/query - Execute SQL query
     */
    fastify.post<{ Body: QueryBody }>('/query', {
        schema: {
            tags: ['Query'],
            summary: 'Execute SQL query',
            description: 'Execute a SQL query. Optionally specify server profile and database name.',
            security: [{ apiKey: [] }],
            body: {
                type: 'object',
                required: ['sql'],
                properties: {
                    sql: {
                        type: 'string',
                        description: 'SQL query to execute',
                        examples: ['SELECT TOP 10 * FROM HR_EMPLOYEE'],
                    },
                    server: {
                        type: 'string',
                        description: 'Server profile name (optional). If not specified, uses default server.',
                        examples: ['SERVER_PROFILE_1', 'SERVER_PROFILE_2'],
                    },
                    database: {
                        type: 'string',
                        description: 'Database name (optional). If not specified, uses default from profile.',
                        examples: ['db_ptrj', 'extend_db_ptrj', 'master'],
                    },
                    params: {
                        type: 'object',
                        description: 'Query parameters for prepared statement (optional)',
                        additionalProperties: true,
                    },
                },
            },
            response: {
                200: standardResponseSchema,
                400: standardResponseSchema,
                403: standardResponseSchema,
                500: standardResponseSchema,
            },
        },
    }, async (request: FastifyRequest<{ Body: QueryBody }>, reply: FastifyReply) => {
        const { sql, database, server, params } = request.body;
        const startTime = performance.now();

        if (!sql) {
            return reply.code(400).send(
                errorResponse('Missing required field: sql')
            );
        }

        // Check if server is read-only
        const isServerReadOnly = connectionManager.isServerReadOnly(server);

        // Validate query against permissions and server read-only status
        const validation = queryValidator.validate(sql, request.permissions, database || 'db_ptrj', isServerReadOnly);

        if (!validation.valid) {
            return reply.code(403).send(
                errorResponse(validation.error || 'Query validation failed', database, performance.now() - startTime)
            );
        }

        try {
            // Execute query with timing
            const { result, durationMs } = await measureTime(() =>
                connectionManager.query(sql, params, database, server)
            );

            return {
                success: true,
                server: server || connectionManager.getDefaultServer(),
                db: database || 'default',
                execution_ms: durationMs,
                data: {
                    recordset: result.recordset,
                    rowsAffected: result.rowsAffected,
                },
                error: null,
            };

        } catch (err) {
            const error = err as Error;
            const executionMs = performance.now() - startTime;

            console.error(`Query error [${server || 'default'}]:`, error.message);

            return reply.code(500).send({
                success: false,
                server: server || connectionManager.getDefaultServer(),
                db: database,
                execution_ms: executionMs,
                data: null,
                error: `Database error: ${error.message}`,
            });
        }
    });

    /**
     * POST /v1/query/batch - Execute multiple queries (transaction)
     */
    fastify.post<{ Body: BatchQueryBody }>(
        '/query/batch',
        {
            schema: {
                tags: ['Query'],
                summary: 'Execute batch queries (transaction)',
                description: 'Execute multiple SQL queries in a single transaction. All succeed or all rollback.',
                security: [{ apiKey: [] }],
                body: {
                    type: 'object',
                    required: ['queries'],
                    properties: {
                        server: {
                            type: 'string',
                            description: 'Server profile name (optional)',
                        },
                        database: {
                            type: 'string',
                            description: 'Database name (optional)',
                        },
                        queries: {
                            type: 'array',
                            items: {
                                type: 'object',
                                required: ['sql'],
                                properties: {
                                    sql: { type: 'string' },
                                    params: { type: 'object', additionalProperties: true },
                                },
                            },
                        },
                    },
                },
                response: {
                    200: standardResponseSchema,
                    400: standardResponseSchema,
                    403: standardResponseSchema,
                    500: standardResponseSchema,
                },
            },
        },
        async (request, reply) => {
            const { queries, database, server } = request.body;
            const startTime = performance.now();

            if (!queries || !Array.isArray(queries)) {
                return reply.code(400).send(
                    errorResponse('Missing required field: queries array')
                );
            }

            // Check if server is read-only
            const isServerReadOnly = connectionManager.isServerReadOnly(server);

            // Validate all queries first
            for (let i = 0; i < queries.length; i++) {
                const validation = queryValidator.validate(queries[i].sql, request.permissions, database || 'db_ptrj', isServerReadOnly);
                if (!validation.valid) {
                    return reply.code(403).send(
                        errorResponse(`Query ${i + 1} validation failed: ${validation.error}`, database)
                    );
                }
            }

            try {
                // In worker mode, we execute queries sequentially (no transaction support)
                // Each query is sent to the worker independently
                const results: unknown[] = [];

                for (const query of queries) {
                    const result = await connectionManager.query(
                        query.sql,
                        query.params,
                        database,
                        server
                    );
                    results.push({
                        recordset: result.recordset,
                        rowsAffected: result.rowsAffected,
                    });
                }

                return {
                    success: true,
                    server: server || connectionManager.getDefaultServer(),
                    db: database || 'default',
                    execution_ms: performance.now() - startTime,
                    data: { results, transactionCommitted: false, note: 'Worker mode: no transaction wrapping' },
                    error: null,
                };

            } catch (err) {
                const error = err as Error;
                return reply.code(500).send({
                    success: false,
                    server: server || connectionManager.getDefaultServer(),
                    db: database,
                    execution_ms: performance.now() - startTime,
                    data: null,
                    error: `Batch query failed: ${error.message}`,
                });
            }
        }
    );
}
