/**
 * `server-only` throws by design when imported outside a React Server
 * Component. That guard is what stops a client component importing the domain
 * core (§14.4) — it must stay in the app, so tests alias it to a no-op here
 * rather than removing it from the modules it protects.
 */
export {}
