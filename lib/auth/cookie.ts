/**
 * The session cookie NAME only — no crypto, no Node built-ins.
 *
 * Middleware runs on the edge runtime and must not pull in node:crypto, so it
 * imports this rather than `session.ts`. Keeping them apart is what stops the
 * edge bundle from dragging in the whole session module.
 */
export const SESSION_COOKIE = 'whiply_admin'
