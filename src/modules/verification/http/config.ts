/**
 * Configuration for HTTP verification. Kept free of database and server imports so the adapter registry, which is
 * pure, can read availability without loading the database client.
 */

export const VERIFICATION_DATABASE_CONFIGURATION_MESSAGE =
  "HTTP verification needs a disposable database, and VERIFICATION_DATABASE_ADMIN_URL is not configured. Set it to a PostgreSQL URL for a dedicated, non-superuser role that can create and drop databases. The framework never falls back to DATABASE_URL or to a development database.";

/**
 * Setup for a dedicated verification role. A person runs these statements as a PostgreSQL administrator. The
 * framework never runs them and never changes roles or privileges. Passwords are chosen by the administrator and
 * stored only in the server's environment file, never in source code.
 */
export const VERIFICATION_DATABASE_SETUP = [
  "1. As a PostgreSQL administrator, create a dedicated login role with no extra privileges:",
  "   CREATE ROLE apf_verifier LOGIN CREATEDB NOSUPERUSER NOCREATEROLE NOBYPASSRLS PASSWORD '<choose-a-strong-password>';",
  "2. Do not grant this role membership in any other role, and do not give it ownership of any existing database.",
  "3. In the server's .env file (never in source code), set:",
  "   VERIFICATION_DATABASE_ADMIN_URL=postgresql://apf_verifier:<password>@127.0.0.1:5433/postgres",
  "4. Restart the server. The framework checks the role before creating anything and refuses a role that is a superuser,",
  "   can create roles, bypasses row-level security, is the AI Product Builder's own role, or owns non-verification databases.",
  "5. Verification databases are named vf_<24 hex characters>, created for one attempt and dropped afterwards.",
].join("\n");

export function verificationDatabaseAdminUrl(env: Record<string, string | undefined> = process.env): string | null {
  const value = env.VERIFICATION_DATABASE_ADMIN_URL?.trim();
  return value ? value : null;
}
