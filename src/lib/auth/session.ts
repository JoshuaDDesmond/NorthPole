import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../db";
import { env } from "../env";
import { forbidden, unauthorized } from "../http";
import { hashToken, newToken } from "./password";

export const PARENT_COOKIE = "np_parent";
export const FAMILY_COOKIE = "np_family";
const PARENT_SESSION_HOURS = 12;
const FAMILY_DEVICE_DAYS = 120;

function cookieBase() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax" as const,
    path: "/",
  };
}

/* ----------------------------- Parent sessions ---------------------------- */

export type ParentContext = {
  userId: string;
  familyId: string;
  name: string;
  email: string;
  role: "OWNER" | "PARENT";
  isOwner: boolean;
  mustChangePassword: boolean;
};

export async function createParentSession(userId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + PARENT_SESSION_HOURS * 3600_000);
  await db.parentSession.create({ data: { id: hashToken(token), userId, expiresAt } });
  await db.parentUser.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  (await cookies()).set(PARENT_COOKIE, token, { ...cookieBase(), expires: expiresAt });
}

export async function destroyParentSession() {
  const jar = await cookies();
  const token = jar.get(PARENT_COOKIE)?.value;
  if (token) await db.parentSession.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(PARENT_COOKIE);
}

export async function getParent(): Promise<ParentContext | null> {
  const token = (await cookies()).get(PARENT_COOKIE)?.value;
  if (!token) return null;
  const session = await db.parentSession.findUnique({
    where: { id: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.parentSession.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await db.parentSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return {
    userId: session.user.id,
    familyId: session.user.familyId,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
    isOwner: session.user.role === "OWNER",
    mustChangePassword: session.user.mustChangePassword,
  };
}

/** For route handlers: throws 401 when no valid parent session. */
export async function requireParent(): Promise<ParentContext> {
  const parent = await getParent();
  if (!parent) throw unauthorized();
  return parent;
}

/** Owner-only actions (family-wide settings, managing other parents). */
export async function requireOwner(): Promise<ParentContext> {
  const parent = await requireParent();
  if (!parent.isOwner) throw forbidden("Only the family owner can change this.");
  return parent;
}

/** For server pages: redirects to the login screen. */
export async function requireParentPage(): Promise<ParentContext> {
  const parent = await getParent();
  if (!parent) redirect("/parent/login");
  return parent;
}

/* ------------------------- Family (child) devices ------------------------- */

export type FamilyDeviceContext = {
  deviceId: string;
  familyId: string;
  /** The parent whose device code paired this device. The device shows only their children. */
  parentUserId: string;
};

export async function createFamilyDevice(parent: { id: string; familyId: string; accessVersion: number }, label: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + FAMILY_DEVICE_DAYS * 86400_000);
  await db.familyDevice.create({
    data: { familyId: parent.familyId, parentUserId: parent.id, tokenHash: hashToken(token), label, accessVersion: parent.accessVersion, expiresAt },
  });
  (await cookies()).set(FAMILY_COOKIE, token, { ...cookieBase(), expires: expiresAt });
}

export async function getFamilyDevice(): Promise<FamilyDeviceContext | null> {
  const token = (await cookies()).get(FAMILY_COOKIE)?.value;
  if (!token) return null;
  const device = await db.familyDevice.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { parentUser: { select: { accessVersion: true } } },
  });
  if (!device || device.revokedAt) return null;
  if (device.expiresAt.getTime() < Date.now()) return null;
  // Changing a parent's device code invalidates every device paired with the old one.
  if (device.accessVersion !== device.parentUser.accessVersion) return null;
  if (Date.now() - device.lastSeenAt.getTime() > 10 * 60_000) {
    await db.familyDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return { deviceId: device.id, familyId: device.familyId, parentUserId: device.parentUserId };
}

export async function requireFamilyDevice(): Promise<FamilyDeviceContext> {
  const device = await getFamilyDevice();
  if (!device) throw unauthorized("This device isn't connected to the North Pole line yet.");
  return device;
}

export async function forgetFamilyDevice() {
  const jar = await cookies();
  const token = jar.get(FAMILY_COOKIE)?.value;
  if (token) {
    await db.familyDevice.updateMany({ where: { tokenHash: hashToken(token) }, data: { revokedAt: new Date() } });
  }
  jar.delete(FAMILY_COOKIE);
}
