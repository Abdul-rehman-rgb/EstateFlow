import { db, Row, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, idParam, readJson } from "@/lib/http";
import { ApiError, nowIso, str } from "@/lib/util";
import { requirePerm } from "@/lib/permissions";
import { assertStatus, canTransition, listingExpiry, transitionError, visibleProperty } from "@/lib/properties";

/**
 * Listing workflow:
 *  - submit:  agent sends a draft for internal review        (draft/expired -> pending_approval)
 *  - approve: manager publishes the listing                  (pending_approval -> active)
 *  - reject:  manager returns it to draft with a note        (pending_approval -> draft)
 *  - status:  manual status change along allowed transitions (e.g. active -> reserved, sold, rented)
 */
export const POST = api(async (req, user, p) => {
  const id = idParam(p.id);
  const prop = await visibleProperty(user, id) as Row | undefined;
  if (!prop) throw new ApiError(404, "Property not found.");
  const body = await readJson(req);
  const action = str(body.action) ?? "status";
  const note = str(body.note);

  if (action === "submit") {
    requirePerm(user, "properties:write");
    if (!canTransition(prop.status, "pending_approval")) throw new ApiError(409, `Cannot submit a ${prop.status} listing.`);
    await tx(async () => {
      await db().prepare("UPDATE properties SET status = 'pending_approval', updated_at = ? WHERE id = ?").run(nowIso(), id);
      await audit(user.id, "submit_listing", "property", id);
    });
  } else if (action === "approve" || action === "reject") {
    requirePerm(user, "properties:approve");
    if (prop.status !== "pending_approval") throw new ApiError(409, "Only listings pending approval can be reviewed.");
    await tx(async () => {
      if (action === "approve") {
        await db().prepare("UPDATE properties SET status = 'active', approved_by = ?, listing_expires_at = ?, updated_at = ? WHERE id = ?")
          .run(user.id, await listingExpiry(), nowIso(), id);
      } else {
        await db().prepare("UPDATE properties SET status = 'draft', updated_at = ? WHERE id = ?").run(nowIso(), id);
      }
      await audit(user.id, action === "approve" ? "approve_listing" : "reject_listing", "property", id, { note });
    });
  } else if (action === "status") {
    requirePerm(user, "properties:write");
    const to = assertStatus(body.status);
    if (!canTransition(prop.status, to)) {
      const err = transitionError(prop.status, to);
      throw new ApiError(err.status, err.message, err.extra);
    }
    if (to === "active") requirePerm(user, "properties:approve");
    await tx(async () => {
      if (to === "active") {
        await db().prepare("UPDATE properties SET status = 'active', listing_expires_at = ?, updated_at = ? WHERE id = ?")
          .run(await listingExpiry(), nowIso(), id);
      } else {
        await db().prepare("UPDATE properties SET status = ?, updated_at = ? WHERE id = ?").run(to, nowIso(), id);
      }
      await audit(user.id, "status_change", "property", id, { from: prop.status, to, note });
    });
  } else {
    throw new ApiError(400, "Unknown action. Use submit, approve, reject or status.");
  }
  return await db().prepare("SELECT * FROM properties WHERE id = ?").get(id);
});
