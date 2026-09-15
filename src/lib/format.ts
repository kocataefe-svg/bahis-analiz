export function formatKickoffTime(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  }).format(new Date(iso));
}

export function formatDayHeading(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "Europe/Istanbul",
  }).format(new Date(iso));
}

export function formatTimeOnly(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  }).format(new Date(iso));
}

export function formatShortDateTime(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  }).format(new Date(iso));
}

export function formatRelativeUpdate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) {
    return "az once guncellendi";
  }
  if (diffHours < 48) {
    return `${diffHours} saat once guncellendi`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} gun once guncellendi`;
}
