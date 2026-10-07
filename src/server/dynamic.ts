import { connection } from "next/server";

/** Marks a server render as request-time so database reads stay fresh. */
export async function markDynamic() {
  await connection();
}
