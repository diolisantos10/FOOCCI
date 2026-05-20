/**
 * Short code generation for tracking link short URLs (/r/[code]).
 *
 * Charset excludes visually ambiguous characters: 0 O 1 I l
 * giving 32 symbols × 7 chars = ~34 billion unique codes.
 */

import { prisma } from "@/lib/prisma";

const CHARSET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_LEN = 7;

function generate(): string {
  let code = "";
  for (let i = 0; i < CODE_LEN; i++) {
    code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return code;
}

export async function generateUniqueShortCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generate();
    const existing = await prisma.trackingLink.findUnique({
      where:  { shortCode: code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new Error("Could not generate unique short code after 20 attempts");
}
