import { config } from 'dotenv';

config();

export interface DatabaseConfig {
    driver: string;
    server: string;
    port: number;
    user: string;
    password: string;
    database: string;
    readOnly: boolean;  // Server is read-only (rejects write operations)
    options: {
        encrypt: boolean;
        trustServerCertificate: boolean;
    };
    pool: {
        max: number;
        min: number;
        idleTimeoutMillis: number;
        acquireTimeoutMillis: number;
    };
}

type DatabaseProfiles = Record<string, DatabaseConfig>;

// Cache profiles to avoid re-parsing env on every request
let cachedProfiles: DatabaseProfiles | null = null;

/**
 * Parse DATABASE_PROFILES_* environment variables into structured config
 * Results are cached for performance
 */
export function loadDatabaseProfiles(): DatabaseProfiles {
    // Return cached profiles if available
    if (cachedProfiles) {
        return cachedProfiles;
    }

    const profiles: DatabaseProfiles = {};
    const envVars = process.env;

    // Find all unique database profile names
    const profileNames = new Set<string>();

    // Define known property suffixes (what comes AFTER the profile name)
    const knownSuffixes = [
        '_DRIVER', '_SERVER', '_PORT', '_USERNAME', '_PASSWORD',
        '_DATABASE_NAME', '_TRUSTED_CONNECTION', '_ENCRYPT', '_READ_ONLY'
    ];

    for (const key of Object.keys(envVars)) {
        if (key.startsWith('DATABASE_PROFILES_')) {
            const afterPrefix = key.replace('DATABASE_PROFILES_', '');

            // Try to match each known suffix and extract profile name
            for (const suffix of knownSuffixes) {
                if (afterPrefix.endsWith(suffix)) {
                    const profileName = afterPrefix.slice(0, -suffix.length);
                    if (profileName) {
                        profileNames.add(profileName);
                    }
                    break;
                }
            }
        }
    }

    console.log(`Found profiles: ${[...profileNames].join(', ') || '(none)'}`);

    // Build config for each profile with OPTIMIZED pool settings
    for (const profileName of profileNames) {
        const prefix = `DATABASE_PROFILES_${profileName}_`;

        const server = envVars[`${prefix}SERVER`];
        // DATABASE_NAME is optional - default to 'master' if not specified
        const database = envVars[`${prefix}DATABASE_NAME`] || 'master';

        // Only require SERVER to exist
        if (!server) {
            console.log(`Skipping profile ${profileName}: Missing SERVER`);
            continue;
        }

        profiles[profileName] = {
            driver: envVars[`${prefix}DRIVER`] || 'ODBC Driver 17 for SQL Server',
            server: server,
            port: parseInt(envVars[`${prefix}PORT`] || '1433', 10),
            user: envVars[`${prefix}USERNAME`] || 'sa',
            password: envVars[`${prefix}PASSWORD`] || '',
            database: database,
            readOnly: envVars[`${prefix}READ_ONLY`] === 'true',  // Parse READ_ONLY flag
            options: {
                encrypt: envVars[`${prefix}ENCRYPT`] === 'true',
                trustServerCertificate: envVars[`${prefix}TRUSTED_CONNECTION`] !== 'true',
            },
            pool: {
                // Pool settings - balanced for stability
                max: 50,           // Max 50 connections per server
                min: 2,            // Keep 2 connections warm
                idleTimeoutMillis: 60000,      // 60 seconds idle timeout
                acquireTimeoutMillis: 10000,   // 10 seconds to acquire
            },
        };
    }

    // Cache the result
    cachedProfiles = profiles;

    return profiles;
}

/**
 * Get database configuration by alias (case-insensitive)
 */
export function getDatabaseConfig(alias: string): DatabaseConfig | undefined {
    const profiles = loadDatabaseProfiles();
    // Case-insensitive lookup
    const normalizedAlias = alias.toUpperCase();
    return profiles[normalizedAlias];
}

/**
 * Get all available database aliases
 */
export function getAvailableAliases(): string[] {
    return Object.keys(loadDatabaseProfiles());
}

/**
 * Clear cached profiles (useful for testing)
 */
export function clearProfileCache(): void {
    cachedProfiles = null;
}

/**
 * Get all server profiles with metadata (for /servers endpoint)
 */
export function getServerProfiles(): Array<{
    name: string;
    host: string;
    port: number;
    defaultDatabase: string;
    readOnly: boolean;
}> {
    const profiles = loadDatabaseProfiles();
    return Object.entries(profiles).map(([name, config]) => ({
        name,
        host: config.server,
        port: config.port,
        defaultDatabase: config.database,
        readOnly: config.readOnly,
    }));
}
