export type NormalizedJob = {
  source: string;
  externalId: string;
  title: string;
  company: string;
  location: string | null;
  description: string | null;
  url: string | null;
  salary: unknown | null;
  postedAt: string | null;
  workMode: string | null;
};

export type JobSearchQuery = {
  keywords: string;
  location?: string;
  page?: number;
};

export interface JobProvider {
  search(query: JobSearchQuery): Promise<NormalizedJob[]>;
}
