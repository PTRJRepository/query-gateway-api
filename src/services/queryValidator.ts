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
const BLACKLISTED_TABLES = ['sys', 'master', 'msdb', 'tempdb'];

// Databases that allow write operations
const WRITABLE_DATABASES = ['extend_db_ptrj'];

// Databases that are READ-ONLY
const READONLY_DATABASES = ['db_ptrj'];

/**
 * Query Validator using node-sql-parser
 * Validates SQL queries against security rules
 * 
 * Rules:
 * - db_ptrj: READ-ONLY (SELECT only)
 * - extend_db_ptrj: Full access (SELECT, INSERT, UPDATE, DELETE)
 */
export class QueryValidator {
    private parser: InstanceType<typeof Parser>;

    constructor() {
        this.parser = new Parser();
    }

    /**
     * Validate a SQL query against permissions and database rules
     */
    validate(sqlQuery: string, permissions: ApiKeyPermissions, database?: string): ValidationResult {
        const dbName = (database || 'db_ptrj').toLowerCase();

        try {
            // Parse the SQL query
            const { tableList, ast } = this.parser.parse(sqlQuery, { database: 'TransactSQL' });

            // Handle array of statements
            const statements = Array.isArray(ast) ? ast : [ast];

            for (const statement of statements) {
                const queryType = (statement.type || '').toUpperCase();

                // Check for blacklisted operations (always blocked)
                if (BLACKLISTED_OPERATIONS.includes(queryType)) {
                    return {
                        valid: false,
                        error: `Blocked: ${queryType} operations are not allowed.`,
                        queryType,
                    };
                }

                // Check if this is a write operation
                const writeOperations = ['INSERT', 'UPDATE', 'DELETE'];
                if (writeOperations.includes(queryType)) {
                    // Check if database is read-only
                    if (READONLY_DATABASES.includes(dbName)) {
                        return {
                            valid: false,
                            error: `Access denied: Database '${database || 'db_ptrj'}' is READ-ONLY. Only SELECT queries allowed. Use 'extend_db_ptrj' for write operations.`,
                            queryType,
                        };
                    }

                    // Check if database allows writes
                    if (!WRITABLE_DATABASES.includes(dbName)) {
                        return {
                            valid: false,
                            error: `Access denied: Write operations not allowed on database '${database}'. Allowed: ${WRITABLE_DATABASES.join(', ')}`,
                            queryType,
                        };
                    }
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

            return { valid: true };

        } catch (parseErr) {
            // If parsing fails, do basic validation
            const upperQuery = sqlQuery.toUpperCase().trim();

            // Check for blacklisted operations
            for (const op of BLACKLISTED_OPERATIONS) {
                if (upperQuery.startsWith(op)) {
                    return {
                        valid: false,
                        error: `Blocked: ${op} operations are not allowed.`,
                    };
                }
            }

            // Check write operations on read-only databases
            const writeOps = ['INSERT', 'UPDATE', 'DELETE'];
            for (const op of writeOps) {
                if (upperQuery.startsWith(op)) {
                    if (READONLY_DATABASES.includes(dbName)) {
                        return {
                            valid: false,
                            error: `Access denied: Database '${database || 'db_ptrj'}' is READ-ONLY. Only SELECT queries allowed.`,
                        };
                    }
                    if (!WRITABLE_DATABASES.includes(dbName)) {
                        return {
                            valid: false,
                            error: `Access denied: Write operations not allowed on database '${database}'.`,
                        };
                    }
                }
            }

            // Allow if basic checks pass
            return { valid: true };
        }
    }

    /**
     * Extract table names from tableList
     */
    private extractTables(tableList: string[]): string[] {
        const tables: string[] = [];

        for (const entry of tableList) {
            const parts = entry.split('::');
            if (parts.length >= 3) {
                const tableName = parts[2];
                if (tableName && !tables.includes(tableName)) {
                    tables.push(tableName);
                }
            }
        }

        return tables;
    }
}

// Export singleton instance
export const queryValidator = new QueryValidator();
