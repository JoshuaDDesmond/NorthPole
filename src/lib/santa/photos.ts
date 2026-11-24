import "server-only";
import { z } from "zod";
import { env } from "../env";

const resultSchema = z.object({
  description: z.string().max(600),
  safeForSanta: z.boolean(),
  concernNote: z.string().max(300),
});
export type PhotoReview = z.infer<typeof resultSchema>;

const INSTRUCTIONS = `A child is sending a picture to Santa Claus during a family Christmas phone line. Look at the picture and return:
1. description: one or two warm, concrete sentences describing what's in it, so Santa can talk about it as if he's looking at it ("A hand-drawn poster of Santa's sleigh over a snowy house, with 'Merry Christmas' in red marker and three reindeer"). Mention any readable writing, colors and the main things shown. If it's a photo of a person, describe what they're doing or wearing, not who they are or what they look like physically. Never guess anyone's identity, age or location.
2. safeForSanta: false only if the picture shows something a parent should see first: injury, danger, nudity, weapons, personal documents (addresses, IDs, cards), or anything upsetting. Otherwise true.
3. concernNote: one neutral sentence for the parent if safeForSanta is false, else "".`;

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["description", "safeForSanta", "concernNote"],
  properties: {
    description: { type: "string" },
    safeForSanta: { type: "boolean" },
    concernNote: { type: "string" },
  },
} as const;

/**
 * Describes a child's picture for Santa and checks it's fine to share. The image goes to OpenAI
 * only for this request and isn't stored there (store: false). Returns null if it can't be done.
 */
export async function reviewPhoto(image: Uint8Array, mimeType: string, safetyId: string, caption = ""): Promise<PhotoReview | null> {
  const key = env.openaiApiKey;
  if (!key) return null;
  try {
    const res = await fetch(`${env.openaiBaseUrl}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "OpenAI-Safety-Identifier": safetyId },
      body: JSON.stringify({
        model: env.visionModel,
        instructions: INSTRUCTIONS,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: caption
                  ? `Here's the picture the child sent to Santa. The child says it's: "${caption}". Use that to name what it is (for example the game, show or character), and describe it.`
                  : "Here's the picture the child sent to Santa.",
              },
              { type: "input_image", image_url: `data:${mimeType};base64,${Buffer.from(image).toString("base64")}` },
            ],
          },
        ],
        store: false,
        text: { format: { type: "json_schema", name: "photo_review", strict: true, schema: jsonSchema } },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.error(`[photo] review failed with status ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { output?: { content?: { type: string; text?: string }[] }[] };
    const text = body.output?.flatMap((o) => o.content ?? []).find((c) => c.type === "output_text" && c.text)?.text;
    return text ? resultSchema.parse(JSON.parse(text)) : null;
  } catch {
    console.error("[photo] could not review a picture");
    return null;
  }
}
