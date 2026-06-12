export type SubscriberPrefs = {
  isActive: boolean;
  receiveAll: boolean;
  categories: string[];
  educationLevels: string[];
  experienceLevels: string[];
  jobTypes: string[];
  requireRemote: boolean;
  requireInternship: boolean;
};

export type MatchableJob = {
  category?: string | null;
  educationLevel?: string | null;
  experienceLevel?: string | null;
  jobType?: string | null;
  isRemote?: boolean;
  isInternship?: boolean;
};

function includesCaseInsensitive(values: string[], candidate: string): boolean {
  const needle = candidate.toLowerCase();
  return values.some((value) => value.toLowerCase() === needle);
}

export function subscriberHasFilters(subscriber: SubscriberPrefs): boolean {
  return (
    subscriber.receiveAll ||
    subscriber.categories.length > 0 ||
    subscriber.educationLevels.length > 0 ||
    subscriber.experienceLevels.length > 0 ||
    subscriber.jobTypes.length > 0 ||
    subscriber.requireRemote ||
    subscriber.requireInternship
  );
}

export function jobMatchesSubscriber(subscriber: SubscriberPrefs, job: MatchableJob): boolean {
  if (!subscriber.isActive) return false;
  if (subscriber.receiveAll) return true;
  if (!subscriberHasFilters(subscriber)) return false;

  if (subscriber.categories.length > 0) {
    if (!job.category || !includesCaseInsensitive(subscriber.categories, job.category)) {
      return false;
    }
  }

  if (subscriber.educationLevels.length > 0) {
    if (!job.educationLevel || !includesCaseInsensitive(subscriber.educationLevels, job.educationLevel)) {
      return false;
    }
  }

  if (subscriber.experienceLevels.length > 0) {
    if (!job.experienceLevel || !includesCaseInsensitive(subscriber.experienceLevels, job.experienceLevel)) {
      return false;
    }
  }

  if (subscriber.jobTypes.length > 0) {
    if (!job.jobType || !includesCaseInsensitive(subscriber.jobTypes, job.jobType)) {
      return false;
    }
  }

  if (subscriber.requireRemote && !job.isRemote) return false;
  if (subscriber.requireInternship && !job.isInternship) return false;

  return true;
}
