import { parentPort, workerData } from 'worker_threads';
import sql from 'mssql';

interface WorkerConfig {
    profileName: string;
    server: string;
    port: number;
    user: string;
    password: string;
    database: string;
    readOnly: boolean;
    encrypt: boolean;
    trustServerCertificate: boolean;
}

interface QueryMessage {
    id: string;
    type: 'query' | 'health' | 'close';
    sql?: string;
    database?: string;
    params?: Record<string, unknown>;
}

interface QueryResponse {
    id: string;
    success: boolean;
    data?: {
        recordset: unknown[];
        rowsAffected: number[];
    };
    error?: string;
    execution_ms: number;
}

const config = workerData as WorkerConfig;
let pool: sql.ConnectionPool | null = null;

async function initPool(): Promise<sql.ConnectionPool> {
    const poolConfig: sql.config = {
        user: config.user,
        password: config.password,
        server: config.server,
        port: config.port,
        database: config.database,
        pool: {
            max: 25,
            min: 2,
            idleTimeoutMillis: 60000,
            acquireTimeoutMillis: 10000,
        },
        options: {
            encrypt: config.encrypt,
            trustServerCertificate: config.trustServerCertificate,
            useUTC: true,
            enableArithAbort: true,
            appName: `SQL-Gateway-${config.profileName}`,
        },
        requestTimeout: 30000,
        connectionTimeout: 15000,
    };

    const newPool = new sql.ConnectionPool(poolConfig);

    newPool.on('error', (err) => {
        console.error(`[Worker ${config.profileName}] Pool error:`, err.message);
        pool = null;
    });

    await newPool.connect();
    console.log(`[Worker ${config.profileName}] ✅ Connected to ${config.server}:${config.port}`);

    return newPool;
}

async function executeQuery(msg: QueryMessage): Promise<QueryResponse> {
    const startTime = performance.now();

    try {
        if (!pool || !pool.connected) {
            pool = await initPool();
        }

        const request = pool.request();

        // Add parameters
        if (msg.params) {
            for (const [key, value] of Object.entries(msg.params)) {
                request.input(key, value);
            }
        }

        // Add USE database if specified
        const finalSql = msg.database
            ? `USE [${msg.database}]; ${msg.sql}`
            : msg.sql!;

        const result = await request.query(finalSql);

        return {
            id: msg.id,
            success: true,
            data: {
                recordset: result.recordset,
                rowsAffected: result.rowsAffected,
            },
            execution_ms: performance.now() - startTime,
        };

    } catch (err) {
        return {
            id: msg.id,
            success: false,
            error: (err as Error).message,
            execution_ms: performance.now() - startTime,
        };
    }
}

async function healthCheck(): Promise<boolean> {
    try {
        if (!pool || !pool.connected) {
            pool = await initPool();
        }
        await pool.request().query('SELECT 1 AS health');
        return true;
    } catch {
        return false;
    }
}

// Message handler
parentPort?.on('message', async (msg: QueryMessage) => {
    switch (msg.type) {
        case 'query':
            const result = await executeQuery(msg);
            parentPort?.postMessage(result);
            break;

        case 'health':
            const healthy = await healthCheck();
            parentPort?.postMessage({ id: msg.id, success: healthy, healthy });
            break;

        case 'close':
            if (pool) {
                await pool.close();
                pool = null;
            }
            parentPort?.postMessage({ id: msg.id, success: true, closed: true });
            break;
    }
});

// Initialize pool on worker start
initPool().catch(err => {
    console.error(`[Worker ${config.profileName}] Failed to initialize:`, err.message);
});

console.log(`[Worker ${config.profileName}] Started for ${config.server}:${config.port} (readOnly: ${config.readOnly})`);
