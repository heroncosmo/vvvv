const RETRY_DELAY_MINUTES = 15;

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function getStatusJobFailureState(params: {
  recurrenceType: string | null | undefined;
  now: Date;
  errorMessage: string;
}) {
  if (params.recurrenceType === "once") {
    return {
      lastError: params.errorMessage,
      nextRunAt: null,
      status: "failed" as const,
      isActive: false,
      updatedAt: params.now,
    };
  }

  return {
    lastError: params.errorMessage,
    nextRunAt: addMinutes(params.now, RETRY_DELAY_MINUTES),
    status: "active" as const,
    isActive: true,
    updatedAt: params.now,
  };
}
