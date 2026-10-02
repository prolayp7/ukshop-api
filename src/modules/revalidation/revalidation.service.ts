import { Injectable, Logger } from '@nestjs/common';

export type RevalidationTarget = { tags?: string[]; paths?: string[] };

// Waits before each retry; three attempts in all. Kept in memory: a restart drops pending retries,
// which only means that content refreshes on its normal cache lifetime instead.
export const RETRY_DELAYS_MS = [2_000, 10_000];
const REQUEST_TIMEOUT_MS = 5_000;

/**
 * Tells the storefront (POST <storefront>/api/revalidate) which cached data an admin change affects.
 * Call it only after the change is committed. It never throws and never delays the admin response:
 * a failure is logged and retried, and the database change stays successful regardless.
 */
@Injectable()
export class RevalidationService {
  private readonly logger = new Logger('Revalidation');

  /** Fire and forget: `void this.revalidation.revalidate(...)`. Resolves true once the storefront confirmed it. */
  async revalidate(target: RevalidationTarget, context: string): Promise<boolean> {
    const tags = [...new Set(target.tags ?? [])];
    const paths = [...new Set(target.paths ?? [])];
    if (!tags.length && !paths.length) return true;
    const secret = process.env.REVALIDATION_SECRET;
    if (!secret) {
      this.logger.warn(`[REVALIDATION] context=${context} status=skipped reason=REVALIDATION_SECRET not set`);
      return false;
    }
    const url = process.env.REVALIDATION_URL || `${(process.env.STOREFRONT_URL || 'http://localhost:3002').replace(/\/$/, '')}/api/revalidate`;
    const summary = `context=${context} tags=${tags.join(',') || '-'} paths=${paths.join(',') || '-'}`;

    for (let attempt = 1; ; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags, paths }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        // A 4xx means the request itself is wrong (bad secret, unknown tag): retrying cannot help.
        if (response.ok) { this.logger.log(`[REVALIDATION] ${summary} status=success attempt=${attempt}`); return true; }
        const detail = `HTTP ${response.status}`;
        if (response.status < 500) { this.logger.error(`[REVALIDATION] ${summary} status=failed attempt=${attempt} error=${detail} (not retried)`); return false; }
        throw new Error(detail);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const delay = RETRY_DELAYS_MS[attempt - 1];
        if (delay === undefined) { this.logger.error(`[REVALIDATION] ${summary} status=failed attempt=${attempt} error=${message} (giving up)`); return false; }
        this.logger.warn(`[REVALIDATION] ${summary} status=retrying attempt=${attempt} error=${message}`);
        await new Promise((resolve) => setTimeout(resolve, delay).unref());
      }
    }
  }
}
