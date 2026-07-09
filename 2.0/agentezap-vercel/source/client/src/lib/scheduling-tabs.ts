export const schedulingTabs = [
  "appointments",
  "services",
  "professionals",
  "google-calendar",
  "config",
  "exceptions",
] as const;

export type SchedulingTabValue = (typeof schedulingTabs)[number];

const schedulingTabSet = new Set<string>(schedulingTabs);
const defaultSchedulingTab: SchedulingTabValue = "appointments";

export function getSchedulingTabFromSearch(search: string): SchedulingTabValue {
  const normalizedSearch = search.startsWith("?") ? search : `?${search}`;
  const params = new URLSearchParams(normalizedSearch);
  const requestedTab = params.get("tab");

  if (requestedTab && schedulingTabSet.has(requestedTab)) {
    return requestedTab as SchedulingTabValue;
  }

  return defaultSchedulingTab;
}

export function buildSchedulingTabUrl(tab: SchedulingTabValue): string {
  const params = new URLSearchParams(window.location.search);

  if (tab === defaultSchedulingTab) {
    params.delete("tab");
  } else {
    params.set("tab", tab);
  }

  const nextSearch = params.toString();
  return nextSearch ? `${window.location.pathname}?${nextSearch}` : window.location.pathname;
}
