import "server-only";
import { db } from "./db";
import { notFound } from "./http";

/** Server-side authorization helpers: every lookup is scoped to the parent's family. */
export async function getOwnedChild(childId: string, familyId: string) {
  const child = await db.child.findFirst({ where: { id: childId, familyId } });
  if (!child) throw notFound("That child profile doesn't exist.");
  return child;
}

export async function getOwnedTalkingPoint(id: string, familyId: string) {
  const tp = await db.talkingPoint.findFirst({ where: { id, child: { familyId } } });
  if (!tp) throw notFound("That talking point doesn't exist.");
  return tp;
}

export async function getOwnedMemory(id: string, familyId: string) {
  const m = await db.memory.findFirst({ where: { id, child: { familyId } } });
  if (!m) throw notFound("That memory doesn't exist.");
  return m;
}

export async function getOwnedCall(id: string, familyId: string) {
  const c = await db.call.findFirst({ where: { id, child: { familyId } } });
  if (!c) throw notFound("That call doesn't exist.");
  return c;
}

export function toDateOrNull(s: string | null | undefined): Date | null | undefined {
  if (s === undefined) return undefined;
  if (s === null || s === "") return null;
  // Expire at the end of that day (UTC) so "expires Dec 20" still covers Dec 20.
  return new Date(`${s}T23:59:59.000Z`);
}
