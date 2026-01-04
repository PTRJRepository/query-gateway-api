import { createRequire } from 'module';
import { ApiKeyPermissions } from '../middleware/auth.js';

const require = createRequire(import.meta.url);
const { Parser } = require('node-sql-parser');

export interface ValidationResult {
    valid: boolean;
    error?: string;
    queryType?: string;
    tables?: string[];
}

// Blacklisted SQL operations
const BLACKLISTED_OPERATIONS = ['DROP', 'TRUNCATE', 'ALTER', 'CREATE', 'GRANT', 'REVOKE'];
const BLACKLISTED_TABLES = ['information_schema', 'sys', 'master', 'msdb', 'tempdb'];

/**
 * Query Validator using node-sql-parser
 * Validates SQL queries against security rules and user permissions
 */
export class QueryValidator {
    private parser: InstanceType<typeof Parser>;

    constructor() {
        this.parser = new Parser();
    }

    /**
     * Validate a SQL query against permissions
     */
    validate(sqlQuery: string, permissions: ApiKeyPermissions, dbAlias: string): ValidationResult {
        // Check if database is allowed
        if (!this.isDatabaseAllowed(dbAlias, permissions)) {
            return {
                valid: false,
                error: `Access denied: Database '${dbAlias}' is not in your allowed databases.`,
            };
        }

        try {
            // Parse the SQL query
            const { tableList, ast } = this.parser.parse(sqlQuery, { database: 'TransactSQL' });

            // Handle array of statements
            const statements = Array.isArray(ast) ? ast : [ast];

            for (const statement of statements) {
                const queryType = (statement.type || '').toUpperCase();

                // Check for blacklisted operations
                if (BLACKLISTED_OPERATIONS.includes(queryType)) {
                    return {
                        valid: false,
                        error: `Blocked: ${queryType} operations are not allowed.`,
                        queryType,
                    };
                }

                // Check read-only permission
                if (permissions.read_only && queryType !== 'SELECT') {
                    return {
                        valid: false,
                        error: `Access denied: Your API key only allows SELECT queries.`,
                        queryType,
                    };
                }
            }

            // Extract and validate tables
            const tables = this.extractTables(tableList);

            // Check for blacklisted tables
            for (const table of tables) {
                const tableLower = table.toLowerCase();
                if (BLACKLISTED_TABLES.some(bt => tableLower.includes(bt))) {
                    return {
                        valid: false,
                        error: `Blocked: Access to system table '${table}' is not allowed.`,
                        tables,
                    };
                }
            }

            // For write operations, check write_dbs and write_tables permission
            const writeOperations = ['INSERT', 'UPDATE', 'DELETE'];
            const queryType = statements[0]?.type?.toUpperCase();

            if (writeOperations.includes(queryType)) {
                // First check if database allows writes
                if (!this.isDatabaseWriteAllowed(dbAlias, permissions)) {
                    return {
                        valid: false,
                        error: `Access denied: Database '${dbAlias}' is read-only. Write operations only allowed on: ${permissions.write_dbs.join(', ')}`,
                        queryType,
                        tables,
                    };
                }

                // Then check if table allows writes
                if (!this.isTableWriteAllowed(tables, permissions)) {
                    return {
                        valid: false,
                        error: `Access denied: You don't have write permission for table(s): ${tables.join(', ')}`,
                        queryType,
                        tables,
                    };
                }
            }

            return {
                valid: true,
                queryType,
                tables,
            };

        } catch (err) {
            // If parsing fails, we still allow the query but log a warning
            // This handles edge cases where node-sql-parser doesn't support certain T-SQL syntax
            console.warn('Query parsing warning:', err);

            // Basic check for obviously dangerous statements
            const upperQuery = sqlQuery.toUpperCase().trim();
            for (const op of BLACKLISTED_OPERATIONS) {
                if (upperQuery.startsWith(op + ' ') || upperQuery.startsWith(op + '\n')) {
                    return {
                        valid: false,
                        error: `Blocked: ${op} operations are not allowed.`,
                    };
                }
            }

            // Check read-only for non-SELECT
            if (permissions.read_only) {
                if (!upperQuery.startsWith('SELECT ') && !upperQuery.startsWith('SELECT\n')) {
                    return {
                        valid: false,
                        error: `Access denied: Your API key only allows SELECT queries.`,
                    };
                }
            }

            return { valid: true };
        }
    }

    /**
     * Check if database is in allowed list
     */
    private isDatabaseAllowed(dbAlias: string, permissions: ApiKeyPermissions): boolean {
        if (permissions.allowed_dbs.includes('*')) {
            return true;
        }
        return permissions.allowed_dbs.includes(dbAlias);
    }

    /**
     * Check if database allows write operations
     */
    private isDatabaseWriteAllowed(dbAlias: string, permissions: ApiKeyPermissions): boolean {
        if (!permissions.write_dbs || permissions.write_dbs.length === 0) {
            return false;
        }
        if (permissions.write_dbs.includes('*')) {
            return true;
        }
        return permissions.write_dbs.includes(dbAlias);
    }

    /**
     * Check if tables are in write_tables list
     */
    private isTableWriteAllowed(tables: string[], permissions: ApiKeyPermissions): boolean {
        if (permissions.write_tables.includes('*')) {
            return true;
        }
        return tables.every(table =>
            permissions.write_tables.some(wt =>
                wt.toLowerCase() === table.toLowerCase()
            )
        );
    }

    /**
     * Extract table names from tableList
     * tableList format: ["select::null::tablename", "update::db::tablename"]
     */
    private extractTables(tableList: string[]): string[] {
        const tables: string[] = [];

        for (const entry of tableList) {
            const parts = entry.split('::');
            if (parts.length >= 3) {
                tables.push(parts[2]);
            }
        }

        return [...new Set(tables)]; // Remove duplicates
    }
}

// Export singleton instance
export const queryValidator = new QueryValidator();
