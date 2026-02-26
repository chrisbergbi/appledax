import { getAllFunctionNames } from './lookup';

/**
 * Compute Levenshtein (edit) distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,       // deletion
        dp[i][j - 1] + 1,       // insertion
        dp[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Find the closest known DAX function name to the given input.
 * Returns the best match if the edit distance is small enough, or null.
 *
 * Max distance threshold: 3 (to avoid nonsensical suggestions).
 */
export function findClosestFunction(name: string): string | null {
  const upper = name.toUpperCase();
  const allNames = getAllFunctionNames();

  let best: string | null = null;
  let bestDist = Infinity;

  for (const fn of allNames) {
    const dist = levenshtein(upper, fn.toUpperCase());
    if (dist < bestDist) {
      bestDist = dist;
      best = fn;
    }
  }

  // Only suggest if edit distance is ≤ 3 (reasonable typo range)
  const maxDist = Math.min(3, Math.floor(name.length / 2));
  return bestDist <= maxDist ? best : null;
}
