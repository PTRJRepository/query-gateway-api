export interface StandardResponse<T = unknown> {
    success: boolean;
    db: string | null;
    execution_ms: number;
    data: T | null;
    error: string | null;
}

/**
 * Create a success response
 */
export function successResponse<T>(
    data: T,
    dbAlias: string,
    executionMs: number
): StandardResponse<T> {
    return {
        success: true,
        db: dbAlias,
        execution_ms: Math.round(executionMs),
        data,
        error: null,
    };
}

/**
 * Create an error response
 */
export function errorResponse(
    error: string,
    dbAlias?: string,
    executionMs: number = 0
): StandardResponse<null> {
    return {
        success: false,
        db: dbAlias || null,
        execution_ms: Math.round(executionMs),
        data: null,
        error,
    };
}

/**
 * Measure execution time
 */
export function measureTime<T>(
    fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
    const start = performance.now();
    return fn().then((result) => ({
        result,
        durationMs: performance.now() - start,
    }));
}
