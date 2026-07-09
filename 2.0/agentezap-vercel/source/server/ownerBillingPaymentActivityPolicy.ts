export function getBillingPaymentActivityWindowStart(
  metadata: Record<string, any>,
  dueDate: Date,
): Date {
  const rawDaysBefore = Number(metadata.daysBefore);
  const rawDaysAfter = Number(metadata.daysAfter);
  const cycleOffsetDays = Number.isFinite(rawDaysBefore)
    ? Math.max(0, rawDaysBefore)
    : Number.isFinite(rawDaysAfter)
      ? Math.max(0, rawDaysAfter)
      : 0;
  const lookbackDays = Math.max(21, cycleOffsetDays + 3);
  return new Date(dueDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
}
