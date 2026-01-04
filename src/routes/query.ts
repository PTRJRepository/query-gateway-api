import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { connectionManager } from '../services/connectionManager.js';
import { queryValidator } from '../services/queryValidator.js';
import { successResponse, errorResponse, measureTime } from '../utils/transformer.js';
import { getAvailableAliases } from '../config/database.js';

interface QueryBody {
    sql: string;
    database?: string;  // Optional: specify database name (default from profile)
    params?: Record<string, unknown>;
}

interface BatchQueryBody {
    queries: Array<{ sql: string; params?: Record<string, unknown> }>;
    database?: string;
}

// Swagger schema definitions
const standardResponseSchema = {
    type: 'object',
    properties: {
        success: { type: 'boolean' },
        db: { type: 'string', nullable: true },
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
 * Uses LOCAL profile, supports multiple databases on the server
 */
export async function queryRoutes(fastify: FastifyInstance): Promise<void> {

    /**
     * GET /v1/databases - List available databases on server
     */
    fastify.get('/databases', {
        schema: {
            tags: ['Database'],
            summary: 'List databases on server',
            description: 'Returns available databases on the connected SQL Server',
            security: [{ apiKey: [] }],
            response: {
                200: standardResponseSchema,
            },
        },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            // Query to get all databases on the server
            const result = await connectionManager.query(
                "SELECT name FROM sys.databases WHERE state = 0 ORDER BY name"
            );

            const databases = (result.recordset as any[]).map((row: { name: string }) => row.name);

            return {
                success: true,
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
            description: 'Execute a SQL query. Optionally specify database name, otherwise uses default from profile.',
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
        const { sql, database, params } = request.body;
        const startTime = performance.now();

        if (!sql) {
            return reply.code(400).send(
                errorResponse('Missing required field: sql')
            );
        }

        // Validate query against permissions
        const validation = queryValidator.validate(sql, request.permissions, database || 'LOCAL');

        if (!validation.valid) {
            return reply.code(403).send(
                errorResponse(validation.error || 'Query validation failed', database, performance.now() - startTime)
            );
        }

        try {
            // Execute query with timing
            const { result, durationMs } = await measureTime(() =>
                connectionManager.query(sql, params, database)
            );

            return successResponse(
                {
                    recordset: result.recordset,
                    rowsAffected: result.rowsAffected,
                },
                database || 'default',
                durationMs
            );

        } catch (err) {
            const error = err as Error;
            const executionMs = performance.now() - startTime;

            console.error(`Query error:`, error.message);

            return reply.code(500).send(
                errorResponse(
                    `Database error: ${error.message}`,
                    database,
                    executionMs
                )
            );
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
            const { queries, database } = request.body;
            const startTime = performance.now();

            if (!queries || !Array.isArray(queries)) {
                return reply.code(400).send(
                    errorResponse('Missing required field: queries array')
                );
            }

            // Validate all queries first
            for (let i = 0; i < queries.length; i++) {
                const validation = queryValidator.validate(queries[i].sql, request.permissions, database || 'LOCAL');
                if (!validation.valid) {
                    return reply.code(403).send(
                        errorResponse(`Query ${i + 1} validation failed: ${validation.error}`, database)
                    );
                }
            }

            try {
                const pool = await connectionManager.getPool();
                const transaction = pool.transaction();

                await transaction.begin();

                const results: unknown[] = [];

                try {
                    for (const query of queries) {
                        const request = transaction.request();

                        if (query.params) {
                            for (const [key, value] of Object.entries(query.params)) {
                                request.input(key, value);
                            }
                        }

                        // Use database if specified
                        const sqlWithDb = database
                            ? `USE [${database}]; ${query.sql}`
                            : query.sql;

                        const result = await request.query(sqlWithDb);
                        results.push({
                            recordset: result.recordset,
                            rowsAffected: result.rowsAffected,
                        });
                    }

                    await transaction.commit();

                    return successResponse(
                        { results, transactionCommitted: true },
                        database || 'default',
                        performance.now() - startTime
                    );

                } catch (queryErr) {
                    await transaction.rollback();
                    throw queryErr;
                }

            } catch (err) {
                const error = err as Error;
                return reply.code(500).send(
                    errorResponse(
                        `Transaction failed: ${error.message}`,
                        database,
                        performance.now() - startTime
                    )
                );
            }
        }
    );
}
