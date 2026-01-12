import sql from 'mssql';
import { getDatabaseConfig, getAvailableAliases, getServerProfiles, DatabaseConfig } from '../config/database.js';

// Default server profile (from env or fallback)
const DEFAULT_SERVER = process.env.DB_PROFILE || 'SERVER_PROFILE_1';

interface PoolStats {
    connected: boolean;
    size: number;
    available: number;
    pending: number;
}

/**
 * Multi-Pool Connection Manager for SQL Server
 * Optimized for Bun runtime with separate pools per server
 */
class ConnectionManager {
    private pools: Map<string, sql.ConnectionPool> = new Map();
    private connecting: Map<string, Promise<sql.ConnectionPool>> = new Map();
    private healthStatus: Map<string, boolean> = new Map();

    getDefaultServer(): string {
        return DEFAULT_SERVER;
    }

    /**
     * Get or create connection pool for a specific server profile
     */
    async getPool(serverProfile?: string): Promise<sql.ConnectionPool> {
        const profileName = (serverProfile || DEFAULT_SERVER).toUpperCase();

        // Return existing pool if available and connected
        const existingPool = this.pools.get(profileName);
        if (existingPool?.connected) {
            return existingPool;
        }

        // If currently connecting, wait for that promise
        const connectingPromise = this.connecting.get(profileName);
        if (connectingPromise) {
            return connectingPromise;
        }

        // Create new connection
        const createPromise = this.createPool(profileName);
        this.connecting.set(profileName, createPromise);

        try {
            const pool = await createPromise;
            this.pools.set(profileName, pool);
            this.healthStatus.set(profileName, true);
            return pool;
        } catch (err) {
            this.healthStatus.set(profileName, false);
            throw err;
        } finally {
            this.connecting.delete(profileName);
        }
    }

    /**
     * Pre-warm connection pools - PARALLEL for all servers
     */
    async warmUp(): Promise<void> {
        const aliases = getAvailableAliases();
        console.log(`🔥 Pre-warming ${aliases.length} server pool(s)...`);

        // Connect to all servers in PARALLEL
        const warmupPromises = aliases.map(async (alias) => {
            try {
                const pool = await this.getPool(alias);
                await this.healthCheck(pool, alias);
                console.log(`✅ ${alias}: Connected & healthy`);
            } catch (err) {
                console.warn(`⚠️ ${alias}: ${(err as Error).message}`);
                this.healthStatus.set(alias, false);
            }
        });

        await Promise.allSettled(warmupPromises);
        console.log(`🚀 Connection warmup complete`);
    }

    /**
     * Health check - simple SELECT 1
     */
    private async healthCheck(pool: sql.ConnectionPool, profileName: string): Promise<boolean> {
        try {
            const request = pool.request();
            await request.query('SELECT 1 AS health_check');
            this.healthStatus.set(profileName, true);
            return true;
        } catch (err) {
            console.error(`❌ Health check failed for ${profileName}:`, (err as Error).message);
            this.healthStatus.set(profileName, false);
            return false;
        }
    }

    /**
     * Create a new connection pool with optimized settings
     */
    private async createPool(profileName: string): Promise<sql.ConnectionPool> {
        const config = getDatabaseConfig(profileName);

        if (!config) {
            const available = getAvailableAliases();
            throw new Error(
                `Server profile '${profileName}' not found. Available: ${available.join(', ')}`
            );
        }

        const poolConfig: sql.config = {
            user: config.user,
            password: config.password,
            server: config.server,
            port: config.port,
            database: config.database,
            pool: {
                max: config.pool.max,
                min: config.pool.min,
                idleTimeoutMillis: config.pool.idleTimeoutMillis,
                acquireTimeoutMillis: config.pool.acquireTimeoutMillis,
            },
            options: {
                encrypt: config.options.encrypt,
                trustServerCertificate: config.options.trustServerCertificate,
                useUTC: true,
                enableArithAbort: true,
                appName: `SQL-Gateway-${profileName}`,
            },
            requestTimeout: 30000,
            connectionTimeout: 15000,
        };

        const pool = new sql.ConnectionPool(poolConfig);

        pool.on('error', (err: Error) => {
            console.error(`Pool error [${profileName}]:`, err.message);
            this.healthStatus.set(profileName, false);
            this.pools.delete(profileName);
        });

        await pool.connect();
        console.log(`✅ Connected: ${profileName} -> ${config.server}:${config.port} (db: ${config.database}, readOnly: ${config.readOnly})`);

        return pool;
    }

    /**
     * Execute a query on a specific server
     */
    async query(
        sqlQuery: string,
        params?: Record<string, unknown>,
        database?: string,
        serverProfile?: string
    ): Promise<sql.IResult<unknown>> {
        const pool = await this.getPool(serverProfile);
        const request = pool.request();

        if (params && Object.keys(params).length > 0) {
            for (const [key, value] of Object.entries(params)) {
                request.input(key, value);
            }
        }

        const finalQuery = database
            ? `USE [${database}]; ${sqlQuery}`
            : sqlQuery;

        return request.query(finalQuery);
    }

    /**
     * Get config for a server profile
     */
    getServerConfig(serverProfile?: string): DatabaseConfig | undefined {
        const profileName = (serverProfile || DEFAULT_SERVER).toUpperCase();
        return getDatabaseConfig(profileName);
    }

    /**
     * Check if server is read-only
     */
    isServerReadOnly(serverProfile?: string): boolean {
        const config = this.getServerConfig(serverProfile);
        return config?.readOnly ?? false;
    }

    /**
     * Close all connection pools
     */
    async closeAll(): Promise<void> {
        console.log(`Closing ${this.pools.size} connection pool(s)...`);

        const closePromises = Array.from(this.pools.entries()).map(async ([name, pool]) => {
            try {
                await pool.close();
                console.log(`  ✅ ${name}: Closed`);
            } catch (err) {
                console.error(`  ❌ ${name}: ${(err as Error).message}`);
            }
        });

        await Promise.allSettled(closePromises);
        this.pools.clear();
        this.healthStatus.clear();
        console.log('All connection pools closed.');
    }

    /**
     * Get servers status
     */
    getServersStatus(): Array<{
        name: string;
        host: string;
        port: number;
        defaultDatabase: string;
        readOnly: boolean;
        connected: boolean;
        healthy: boolean;
    }> {
        const profiles = getServerProfiles();
        return profiles.map(profile => {
            const pool = this.pools.get(profile.name.toUpperCase());
            return {
                ...profile,
                connected: pool?.connected ?? false,
                healthy: this.healthStatus.get(profile.name.toUpperCase()) ?? false,
            };
        });
    }
}

// Export singleton instance
export const connectionManager = new ConnectionManager();
