/**
 * Direct port of src/lib/roles.ts.
 *
 * Roles come from the client's own Supabase project (table `user_profiles`,
 * function `current_user_role()` -- see public/client-app/docs/security-model.md).
 * We don't mint our own accounts or roles here; every person with office-level
 * access to this dashboard already has a login in that system.
 *
 * This dashboard only needs a two-way split, not the client's full four-role
 * model: "admin" sees everything (the full nav, including $ pages -- Cost of
 * Gain, Lot Scorecard, Market Position), "rancher" gets the read-only,
 * no-dollars view at /rancher.html. `crew` never sees dollars there either
 * (their own security-model.md: "crew can record what happened in the field
 * but not ... see money"), so crew maps to "rancher"; everyone else (office,
 * owner, accountant) maps to "admin".
 */

export const CLIENT_ROLES = ["crew", "office", "owner", "accountant"];

export function isClientRole(value) {
  return typeof value === "string" && CLIENT_ROLES.includes(value);
}

export const TIERS = ["admin", "rancher"];

export function tierForRole(role) {
  return role === "crew" ? "rancher" : "admin";
}
