/**
 * Identity boundary.
 *
 * Authentication is intentionally not required to run the application.
 * Replace `getCurrentActor` with a session lookup when auth is added.
 * Domain services depend on this shape, not on a specific auth provider.
 */
export type Actor = {
  id: string;
  name: string;
  email: string | null;
};

export function getCurrentActor(): Actor {
  return {
    id: "local-user",
    name: "Local user",
    email: null,
  };
}
