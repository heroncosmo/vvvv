import {
  getStatefulJobCronGroup,
  isAuthorizedVercelCronRequest,
  triggerStatefulJobCronGroup,
} from "../../../server/statefulJobCron.js";

export async function runStatefulCronGroupHandler(groupId: string, request: Request): Promise<Response> {
  const group = getStatefulJobCronGroup(groupId);
  if (!group) {
    return Response.json(
      {
        success: false,
        message: `Unknown stateful cron group: ${groupId}`,
      },
      { status: 404 },
    );
  }

  if (!isAuthorizedVercelCronRequest(request)) {
    return Response.json(
      {
        success: false,
        message: "Unauthorized cron request",
      },
      { status: 401 },
    );
  }

  try {
    const dispatchResult = await triggerStatefulJobCronGroup(group, { async: true });
    let parsedBody: unknown = null;

    try {
      parsedBody = dispatchResult.bodyText ? JSON.parse(dispatchResult.bodyText) : null;
    } catch {
      parsedBody = dispatchResult.bodyText || null;
    }

    return Response.json(
      {
        success: dispatchResult.ok,
        cronGroup: group.id,
        jobs: group.jobs,
        targetUrl: dispatchResult.targetUrl,
        dispatchStatus: dispatchResult.status,
        dispatchBody: parsedBody,
      },
      { status: dispatchResult.ok ? 200 : dispatchResult.status },
    );
  } catch (error: any) {
    return Response.json(
      {
        success: false,
        cronGroup: group.id,
        jobs: group.jobs,
        message: error?.message || "Failed to dispatch stateful cron group",
      },
      { status: 500 },
    );
  }
}
