export type RuntimeLogFilterable = {
  event: string;
  message: string;
  level: string;
};

export function filterRuntimeLogs<T extends RuntimeLogFilterable>(logs: T[], filter: string) {
  const normalized = filter.trim().toLowerCase();
  if (!normalized) return logs;
  return logs.filter(log => `${log.event} ${log.message} ${log.level}`.toLowerCase().includes(normalized));
}

export function formatRuntimeLogFilterHint(filter: string) {
  return filter.trim() ? `Filtering events for “${filter.trim()}”` : "Showing all runtime events";
}
