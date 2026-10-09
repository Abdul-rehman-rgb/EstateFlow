import { db, Row, setting } from "./db";
import { ApiError, int, nowIso, num, oneOf, str, addDays, bool } from "./util";
import { inventoryScope, type CurrentUser } from "./permissions";

export const PROPERTY_STATUSES = [
  "draft", "pending_approval", "active", "reserved", "under_offer", "rented", "sold", "expired", "archived",
] as const;
export const CATEGORIES = ["residential", "commercial", "land"] as const;
export const LISTING_TYPES = ["sale", "rent"] as const;
export const SALE_MODES = ["secondary", "off_plan"] as const;

/** Allowed manual status moves. Approvals and deal outcomes use dedicated routes. */
const TRANSITIONS: Record<string, string[]> = {
  draft: ["pending_approval", "archived"],
  pending_approval: ["active", "draft"],
  active: ["reserved", "under_offer", "rented", "sold", "expired", "archived"],
  reserved: ["active", "under_offer", "sold", "rented"],
  under_offer: ["active", "sold", "rented"],
  expired: ["pending_approval", "archived"],
  sold: ["archived"],
  rented: ["archived", "active"],
  archived: ["draft"],
};

export function propertyInput(body: Row, partial: boolean) {
  const out: Row = {};
  const has = (k: string) => !partial || body[k] !== undefined;
  if (has("title")) {
    const t = str(body.title);
    if (!t) throw new ApiError(400, "Property title is required.");
    out.title = t;
  }
  if (has("category")) out.category = oneOf(body.category ?? "residential", CATEGORIES, "category");
  if (has("listing_type")) out.listing_type = oneOf(body.listing_type ?? "sale", LISTING_TYPES, "listing type");
  if (has("sale_mode")) out.sale_mode = oneOf(body.sale_mode ?? "secondary", SALE_MODES, "sale mode");
  if (has("price")) out.price = num(body.price);
  if (has("currency")) out.currency = str(body.currency) ?? "AED";
  if (has("size_sqft")) out.size_sqft = num(body.size_sqft);
  if (has("bedrooms")) out.bedrooms = int(body.bedrooms);
  if (has("bathrooms")) out.bathrooms = int(body.bathrooms);
  if (has("floor")) out.floor = str(body.floor);
  if (has("view")) out.view = str(body.view);
  if (has("amenities")) out.amenities = str(body.amenities);
  if (has("emirate")) out.emirate = str(body.emirate) ?? "Dubai";
  if (has("location")) out.location = str(body.location);
  if (has("description")) out.description = str(body.description);
  if (has("owner_name")) out.owner_name = str(body.owner_name);
  if (has("owner_phone")) out.owner_phone = str(body.owner_phone);
  if (has("owner_instructions")) out.owner_instructions = str(body.owner_instructions);
  if (has("agreed_price")) out.agreed_price = num(body.agreed_price);
  if (has("exclusive")) out.exclusive = bool(body.exclusive) ? 1 : 0;
  if (has("permit_number")) out.permit_number = str(body.permit_number);
  if (has("permit_expiry")) out.permit_expiry = body.permit_expiry ? new Date(String(body.permit_expiry)).toISOString() : null;
  return out;
}

export function nextRef(id: number) {
  return `PRP-${String(id).padStart(5, "0")}`;
}

export async function listingExpiry(from = nowIso()) {
  return addDays(from, Number(await setting("listing_validity_days")));
}

export function canTransition(from: string, to: string) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export async function visibleProperty(user: CurrentUser, id: number): Promise<Row | undefined> {
  const scope = inventoryScope(user);
  return await db().prepare(`SELECT * FROM properties WHERE id = ? AND ${scope.sql}`).get(id, ...scope.params) as Row | undefined;
}

export function assertStatus(v: unknown) {
  return oneOf(v, PROPERTY_STATUSES, "status");
}

export function transitionError(from: string, to: string) {
  return new ApiError(409, `Cannot move a listing from "${from}" to "${to}".`, { allowed: TRANSITIONS[from] ?? [] });
}
