import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).optional();

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200);

export const setupSchema = z.object({
  setupToken: z.string().min(1).max(500),
  familyName: text(80).min(1),
  name: text(80).min(1),
  email: z.string().trim().toLowerCase().email().max(200),
  password: passwordSchema,
  timezone: text(64).min(1),
});

const idList = z.array(z.string().min(1).max(64)).max(50);

export const addParentSchema = z.object({
  name: text(80).min(1),
  email: z.string().trim().toLowerCase().email().max(200),
  password: passwordSchema,
  role: z.enum(["OWNER", "PARENT"]).default("PARENT"),
  childIds: idList.default([]),
});

export const parentPatchSchema = z.object({
  name: text(80).min(1).optional(),
  role: z.enum(["OWNER", "PARENT"]).optional(),
  childIds: idList.optional(),
  temporaryPassword: passwordSchema.optional(),
});

export const meSchema = z.object({
  consent: z.boolean().optional(),
  name: text(80).min(1).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const familyAccessSchema = z.object({
  code: z.string().trim().min(1).max(100),
  label: optText(60),
});

export const accessCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(6, "Use at least 6 characters for the family access code.")
    .max(100),
});

export const customFieldSchema = z.object({ label: text(60).min(1), value: text(1000) });

export const childSchema = z.object({
  firstName: text(60).min(1, "First name is required."),
  nickname: optText(60),
  age: z.number().int().min(1).max(19).nullable().optional(),
  birthday: optText(60),
  parents: optText(500),
  siblings: optText(500),
  pets: optText(500),
  school: optText(200),
  sportsAndTeams: optText(1000),
  hobbies: optText(1000),
  favoriteActivities: optText(1000),
  accomplishments: optText(1500),
  challengesAndGoals: optText(1500),
  christmasWishes: optText(1000),
  traditions: optText(1500),
  otherDetails: optText(3000),
  customFields: z.array(customFieldSchema).max(20).optional(),
  topicsToAvoid: optText(1000),
  nextCallInstructions: optText(1000),
  callingEnabled: z.boolean().optional(),
  /** Owner only: which parents manage this child. */
  parentIds: idList.optional(),
});
export const childPatchSchema = childSchema.partial();

export const talkingPointSchema = z.object({
  topic: text(120).min(1, "Topic is required."),
  details: text(1500).min(1, "Add a few details for Santa."),
  priority: z.enum(["HIGH", "NORMAL", "LOW"]).default("NORMAL"),
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.")
    .nullable()
    .optional(),
  enabled: z.boolean().default(true),
});
export const talkingPointPatchSchema = talkingPointSchema.partial();

export const memoryCreateSchema = z.object({ content: text(400).min(1) });
export const memoryPatchSchema = z.object({
  content: text(400).min(1).optional(),
  status: z.enum(["APPROVED"]).optional(),
});

export const personalitySchema = z.object({
  voice: text(40).min(1).optional(),
  customVoiceId: text(120).nullable().optional(),
  humor: z.number().int().min(1).max(5).optional(),
  energy: z.number().int().min(1).max(5).optional(),
  northPoleReferences: z.number().int().min(1).max(5).optional(),
  conversationLength: z.enum(["SHORT", "MEDIUM", "LONG"]).optional(),
  topicsToAvoid: optText(1500),
  nextCallInstructions: optText(1500),
});

export const familySettingsSchema = z.object({
  name: text(80).min(1).optional(),
  timezone: text(64).min(1).optional(),
  callingEnabled: z.boolean().optional(),
  maxCallMinutes: z.number().int().min(1).max(60).optional(),
  dailyMinutesPerChild: z.number().int().min(1).max(240).optional(),
  generateMemoryProposals: z.boolean().optional(),
  ambientSound: z.boolean().optional(),
});

export const callSummaryPatchSchema = z.object({
  summary: text(1000).optional(),
  approve: z.boolean().optional(),
  clearSafetyFlag: z.boolean().optional(),
});

const transcriptTurn = z.object({ role: z.enum(["child", "santa"]), text: z.string().max(4000) });
export const transcriptSchema = z.array(transcriptTurn).max(400);

export const callStartSchema = z.object({
  childId: z.string().min(1).max(64),
  sdp: z.string().min(10).max(40_000),
  resumeOfCallId: z.string().max(64).optional(),
  resumeTranscript: transcriptSchema.optional(),
});

export const callEndSchema = z.object({
  reason: z.enum(["user_hangup", "time_limit", "connection_lost", "error", "page_closed", "cancelled", "server_stop"]),
  durationSec: z.number().int().min(0).max(4 * 3600).optional(),
  transcript: transcriptSchema.optional(),
});

export const dataDeletionSchema = z.object({
  scope: z.enum(["call_history", "memories", "all_child_data", "everything"]),
  confirm: z.literal("DELETE"),
});

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }, "Use a full web link starting with https://");

export const wishSchema = z.object({
  title: text(160).min(1, "What's the wish?"),
  details: optText(500),
  link: z.union([httpUrl, z.literal("")]).nullable().optional(),
  notes: optText(1000),
  topWish: z.boolean().optional(),
  purchased: z.boolean().optional(),
  santaCanMention: z.boolean().optional(),
});
export const wishPatchSchema = wishSchema.partial().extend({ approved: z.literal(true).optional() });
