export function extractApiMessage(payload: any): string {
  if (!payload) return 'Unknown API error';
  if (typeof payload === 'string') return payload;
  if (payload?.error?.message && typeof payload.error.message === 'string') return payload.error.message;
  if (payload?.message && typeof payload.message === 'string') return payload.message;
  if (payload?.text && typeof payload.text === 'string') return payload.text;
  return JSON.stringify(payload);
}

export function preflightCode(status: number, message: string): string {
  const msg = message.toLowerCase();
  if (status === 401) return 'AUTH';
  if (status === 403 && (msg.includes('build') || msg.includes('permission'))) return 'MISSING_BUILD';
  if (status === 403 && (msg.includes('tenant') || msg.includes('execute queries'))) return 'TENANT_SETTING';
  if (status === 403) return 'PERMISSION_OR_TENANT';
  if (status === 429) return 'RATE_LIMIT';
  return 'EXECUTE';
}

export function preflightHint(status: number, message: string): string {
  const code = preflightCode(status, message);
  if (code === 'MISSING_BUILD') return 'Grant Build permission on the semantic model.';
  if (code === 'TENANT_SETTING') return 'Enable Dataset Execute Queries REST API in the Power BI admin portal.';
  if (code === 'AUTH') return 'Sign in again and verify app consent/scopes.';
  if (code === 'RATE_LIMIT') return 'Wait and retry; reduce query/benchmark frequency.';
  return 'Check dataset access and tenant integration settings.';
}
