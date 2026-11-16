import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ParentContext } from "./auth/session";
import { db } from "./db";
import { notFound } from "./http";

/**
 * Which children a signed-in parent can see and manage.
 * The owner sees every child in the family; other parents only see children
 * they've been assigned to (or created themselves).
 */
export function childWhere(parent: Pick<ParentContext, "familyId" | "userId" | "isOwner">): Prisma.ChildWhereInput {
  return parent.isOwner ? { familyId: parent.familyId } : { familyId: parent.familyId, access: { some: { parentUserId: parent.userId } } };
}

/** Children whose phone-line callers a paired device may show: those its parent manages. */
export function deviceChildWhere(device: { familyId: string; parentUserId: string }): Prisma.ChildWhereInput {
  return { familyId: device.familyId, callingEnabled: true, access: { some: { parentUserId: device.parentUserId } } };
}

export async function getOwnedChild(childId: string, parent: ParentContext) {
  const child = await db.child.findFirst({ where: { id: childId, ...childWhere(parent) } });
  if (!child) throw notFound("That child profile doesn't exist.");
  return child;
}

export async function getOwnedTalkingPoint(id: string, parent: ParentContext) {
  const tp = await db.talkingPoint.findFirst({ where: { id, child: childWhere(parent) } });
  if (!tp) throw notFound("That talking point doesn't exist.");
  return tp;
}

export async function getOwnedMemory(id: string, parent: ParentContext) {
  const m = await db.memory.findFirst({ where: { id, child: childWhere(parent) } });
  if (!m) throw notFound("That memory doesn't exist.");
  return m;
}

export async function getOwnedWish(id: string, parent: ParentContext) {
  const w = await db.wishListItem.findFirst({ where: { id, child: childWhere(parent) } });
  if (!w) throw notFound("That wish doesn't exist.");
  return w;
}

export async function getOwnedCall(id: string, parent: ParentContext) {
  const c = await db.call.findFirst({ where: { id, child: childWhere(parent) } });
  if (!c) throw notFound("That call doesn't exist.");
  return c;
}

/** Validates that every id is a parent in this family. */
export async function validParentIds(ids: string[], familyId: string) {
  const unique = [...new Set(ids)];
  const found = await db.parentUser.findMany({ where: { id: { in: unique }, familyId }, select: { id: true } });
  return found.map((p) => p.id);
}

export function toDateOrNull(s: string | null | undefined): Date | null | undefined {
  if (s === undefined) return undefined;
  if (s === null || s === "") return null;
  // Expire at the end of that day (UTC) so "expires Dec 20" still covers Dec 20.
  return new Date(`${s}T23:59:59.000Z`);
}
