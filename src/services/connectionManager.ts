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
 * Supports multiple server profiles with separate connection pools
 * Features: health checks, auto-reconnection, robust pooling
 */
class ConnectionManager {
    private pools: Map<string, sql.ConnectionPool> = new Map();
    private connecting: Map<string, Promise<sql.ConnectionPool>> = new Map();
    private healthStatus: Map<string, boolean> = new Map();

    /**
     * Get default server profile name
     */
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
     * Pre-warm connection pools with health check for all configured servers
     */
    async warmUp(): Promise<void> {
        const aliases = getAvailableAliases();
        console.log(`🔥 Pre-warming ${aliases.length} server pool(s)...`);

        const warmupPromises = aliases.map(async (alias) => {
            try {
                // Health check: test connection
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
     * Health check - execute simple query to verify connection
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
                // OPTIMIZATION: Create connections more aggressively
                createTimeoutMillis: 5000,
                destroyTimeoutMillis: 5000,
                reapIntervalMillis: 1000,
                createRetryIntervalMillis: 200,
            },
            options: {
                encrypt: config.options.encrypt,
                trustServerCertificate: config.options.trustServerCertificate,
                useUTC: true,
                enableArithAbort: true,
                // OPTIMIZATION: Performance settings
                appName: 'SQL-Gateway',
                packetSize: 16384,  // Larger packets = fewer round trips
                abortTransactionOnError: true,
            },
            // OPTIMIZATION: Faster timeouts
            requestTimeout: 30000,     // 30 seconds max for query
            connectionTimeout: 15000,  // 15 seconds to connect
        };

        const pool = new sql.ConnectionPool(poolConfig);

        // Handle pool errors - mark as unhealthy and remove from pool map
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
     * Execute a query on a specific server, optionally switching database
     */
    async query(
        sqlQuery: string,
        params?: Record<string, unknown>,
        database?: string,
        serverProfile?: string
    ): Promise<sql.IResult<unknown>> {
        const pool = await this.getPool(serverProfile);
        const request = pool.request();

        // Add parameters if provided
        if (params && Object.keys(params).length > 0) {
            for (const [key, value] of Object.entries(params)) {
                request.input(key, value);
            }
        }

        // If database specified, prepend USE statement
        const finalQuery = database
            ? `USE [${database}]; ${sqlQuery}`
            : sqlQuery;

        return request.query(finalQuery);
    }

    /**
     * Get config for a server profile (useful for read-only check)
     */
    getServerConfig(serverProfile?: string): DatabaseConfig | undefined {
        const profileName = (serverProfile || DEFAULT_SERVER).toUpperCase();
        return getDatabaseConfig(profileName);
    }

    /**
     * Check if server profile is read-only
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
     * Get pool statistics for all servers
     */
    getPoolStats(): Record<string, PoolStats & { healthy: boolean }> {
        const stats: Record<string, PoolStats & { healthy: boolean }> = {};

        for (const [name, pool] of this.pools) {
            stats[name] = {
                connected: pool.connected,
                size: pool.size,
                available: (pool as any).available ?? 0,
                pending: (pool as any).pending ?? 0,
                healthy: this.healthStatus.get(name) ?? false,
            };
        }

        return stats;
    }

    /**
     * Get server list with connection status
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
