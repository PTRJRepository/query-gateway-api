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

// Blacklisted SQL operations (always blocked regardless of server profile)
const BLACKLISTED_OPERATIONS = ['DROP', 'TRUNCATE', 'GRANT', 'REVOKE'];

/**
 * Query Validator using node-sql-parser
 * Validates SQL queries against security rules
 * 
 * Rules:
 * - Server-level readOnly=true: Only SELECT allowed (SERVER_PROFILE_2, SERVER_PROFILE_3)
 * - Server-level readOnly=false: Full access - SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER (SERVER_PROFILE_1)
 * - Blacklisted operations (DROP, TRUNCATE, GRANT, REVOKE) are always blocked
 */
export class QueryValidator {
    private parser: InstanceType<typeof Parser>;

    constructor() {
        this.parser = new Parser();
    }

    /**
     * Validate a SQL query against server read-only status
     * Permission is based ONLY on server profile's READ_ONLY flag
     */
    validate(sqlQuery: string, permissions: ApiKeyPermissions, database?: string, isServerReadOnly?: boolean): ValidationResult {
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
                const writeOperations = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER'];
                if (writeOperations.includes(queryType)) {
                    // Check if SERVER is read-only
                    if (isServerReadOnly) {
                        return {
                            valid: false,
                            error: `Access denied: Server profile is READ-ONLY. Write operations (${queryType}) not allowed. Use a server profile with READ_ONLY=false.`,
                            queryType,
                        };
                    }
                    // If server is not read-only, allow write operations
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

            // Check write operations on read-only server
            const writeOperations = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER'];
            for (const op of writeOperations) {
                if (upperQuery.startsWith(op)) {
                    // Check server read-only
                    if (isServerReadOnly) {
                        return {
                            valid: false,
                            error: `Access denied: Server profile is READ-ONLY. Write operations (${op}) not allowed. Use a server profile with READ_ONLY=false.`,
                        };
                    }
                    // If server is not read-only, allow write operations
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
