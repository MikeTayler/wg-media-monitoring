/**
 * Secures cron-triggered routes (`project.md`). `CRON_SECRET` must be set in the environment.
 *
 * Accepted (any one):
 * - `Authorization: Bearer <CRON_SECRET>` (used by Vercel Cron when `CRON_SECRET` is set on the project)
 * - `x-cron-secret: <CRON_SECRET>`
 * - `?secret=<CRON_SECRET>` (local / manual)
 */
export function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");

  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

  const cronHeader = request.headers.get("x-cron-secret");

  return (
    querySecret === secret ||
    bearer === secret ||
    cronHeader === secret
  );
}
