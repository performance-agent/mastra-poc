import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyGitHubWebhookSignature(input: {
  secret: string;
  payload: string | Buffer;
  signature256: string;
}): boolean {
  const expected = `sha256=${createHmac("sha256", input.secret).update(input.payload).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(input.signature256);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}
