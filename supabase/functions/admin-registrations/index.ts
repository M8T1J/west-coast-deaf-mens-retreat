import { authenticatedUser, databaseRequest } from "../_shared/supabase.ts";
import { createHandler } from "./handler.ts";

Deno.serve(createHandler({
  env: (name) => Deno.env.get(name),
  fetch,
  databaseRequest,
  authenticatedUser,
  log: console.error,
}));
