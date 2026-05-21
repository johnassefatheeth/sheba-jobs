function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatPostedFreshness(value?: Date | string | null): string {
  if (!value) return "—";
  const posted = new Date(value);
  if (Number.isNaN(posted.getTime())) return "—";

  const today = startOfLocalDay(new Date());
  const postedDay = startOfLocalDay(posted);
  const dayDiff = Math.round((today.getTime() - postedDay.getTime()) / 86_400_000);

  if (dayDiff <= 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return `${dayDiff} days ago`;
  if (dayDiff < 30) {
    const weeks = Math.floor(dayDiff / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }
  if (dayDiff < 365) {
    const months = Math.floor(dayDiff / 30);
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }
  const years = Math.floor(dayDiff / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}
