import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../db";
import { env } from "../env";
import { unauthorized } from "../http";
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
  };
}

/** For route handlers: throws 401 when no valid parent session. */
export async function requireParent(): Promise<ParentContext> {
  const parent = await getParent();
  if (!parent) throw unauthorized();
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
};

export async function createFamilyDevice(familyId: string, accessVersion: number, label: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + FAMILY_DEVICE_DAYS * 86400_000);
  await db.familyDevice.create({
    data: { familyId, tokenHash: hashToken(token), label, accessVersion, expiresAt },
  });
  (await cookies()).set(FAMILY_COOKIE, token, { ...cookieBase(), expires: expiresAt });
}

export async function getFamilyDevice(): Promise<FamilyDeviceContext | null> {
  const token = (await cookies()).get(FAMILY_COOKIE)?.value;
  if (!token) return null;
  const device = await db.familyDevice.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { family: { select: { familyAccessVersion: true } } },
  });
  if (!device || device.revokedAt) return null;
  if (device.expiresAt.getTime() < Date.now()) return null;
  // Changing the family access code invalidates every previously paired device.
  if (device.accessVersion !== device.family.familyAccessVersion) return null;
  if (Date.now() - device.lastSeenAt.getTime() > 10 * 60_000) {
    await db.familyDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return { deviceId: device.id, familyId: device.familyId };
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
