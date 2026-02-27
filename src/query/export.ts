import type { QueryRunResult } from './types';

export function exportResultAsCsv(filename: string, result: QueryRunResult): void {
  const lines: string[] = [];
  const headers = result.columns.map((c) => c.name);
  lines.push(headers.map(escapeCsv).join(','));

  for (const row of result.rows) {
    const cells = headers.map((h) => escapeCsv(stringifyValue(row[h])));
    lines.push(cells.join(','));
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
