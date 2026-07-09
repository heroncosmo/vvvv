import { runStatefulCronGroupHandler } from "./_handler.js";

export async function GET(request: Request) {
  return runStatefulCronGroupHandler("policy-audit", request);
}

export async function POST(request: Request) {
  return runStatefulCronGroupHandler("policy-audit", request);
}
