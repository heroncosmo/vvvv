import { runStatefulCronGroupHandler } from "./_handler.js";

export async function GET(request: Request) {
  return runStatefulCronGroupHandler("media-cleanup", request);
}
