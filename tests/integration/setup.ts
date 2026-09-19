/**
 * Integration tests run against a REAL PostgreSQL database.
 *
 * Nothing about stock contention, CHECK constraints, or transactional
 * behaviour can be proven against a mock — and those are precisely the
 * properties that must never be wrong (§13.1).
 */
const testUrl =
  process.env.TEST_DATABASE_URL ?? 'postgresql://whiply@localhost:5433/whiply_test?host=/tmp'

Object.assign(process.env, {
  DATABASE_URL: testUrl,
  DIRECT_DATABASE_URL: testUrl,
  NODE_ENV: 'test',
})
