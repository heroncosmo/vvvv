import { runStatefulCronGroupHandler } from "./_handler.js";

export async function GET(request: Request) {
  return runStatefulCronGroupHandler("daily-contact-sync", request);
}
