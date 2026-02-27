import type { QueryErrorDetails } from './types';

export function mapQueryError(status: number, message: string): QueryErrorDetails {
  if (status === 401) {
    return {
      status,
      code: 'AUTH_REQUIRED',
      message: 'Authentication failed. Sign in again and retry.',
      suggestion: 'Use Sign in and make sure your Entra app consent is granted.',
    };
  }

  if (status === 403) {
    const msgLower = message.toLowerCase();
    if (msgLower.includes('build')) {
      return {
        status,
        code: 'MISSING_BUILD',
        message: 'Missing Build permission on the selected semantic model.',
        suggestion: 'Ask a Power BI admin to grant Build on this dataset.',
      };
    }
    return {
      status,
      code: 'FORBIDDEN',
      message: 'Access denied for this workspace or dataset.',
      suggestion: 'Check dataset access, tenant settings, and API permissions.',
    };
  }

  if (status === 429) {
    return {
      status,
      code: 'RATE_LIMITED',
      message: 'Rate limit reached while executing the query.',
      suggestion: 'Wait and retry, or reduce benchmark iteration count.',
    };
  }

  if (status >= 500) {
    return {
      status,
      code: 'SERVER_ERROR',
      message: 'Query service error while executing the request.',
      suggestion: 'Retry and check the backend logs with requestId.',
    };
  }

  return {
    status,
    code: 'QUERY_ERROR',
    message: message || 'Unexpected query error.',
  };
}
