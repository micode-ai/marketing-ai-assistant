export interface AppStoreMetricsDto {
  id: string;
  projectId: string;
  date: string;
  installs: number;
  uninstalls: number;
  updates: number;
  activeDeviceInstalls: number;
  storeListingVisitors: number;
  storeListingConversions: number;
  crashes: number;
  anrs: number;
  crashRate: number;
  anrRate: number;
  averageRating: number;
  totalRatings: number;
  ratingsCount1: number;
  ratingsCount2: number;
  ratingsCount3: number;
  ratingsCount4: number;
  ratingsCount5: number;
  revenue: number | null;
  revenuePerUser: number | null;
  newSubscriptions: number | null;
  cancelledSubscriptions: number | null;
  activeSubscriptions: number | null;
}

export interface AppReviewDto {
  id: string;
  projectId: string;
  reviewId: string;
  authorName: string;
  language: string;
  starRating: number;
  text: string;
  reviewCreatedAt: string;
  replyText: string | null;
  replyCreatedAt: string | null;
  aiSuggestedReply: string | null;
  isReplied: boolean;
  metadata: Record<string, unknown> | null;
}

export interface GooglePlayStatusDto {
  connected: boolean;
  authMethod: 'oauth2' | 'service_account' | null;
  packageName: string | null;
  lastSyncAt: string | null;
  initialSyncCompleted: boolean;
  consecutiveFailures: number;
  status: 'OK' | 'ERROR' | 'SYNCING' | null;
  gcsBucketUri?: string | null;
  /** False when the plan disables the sync — figures are frozen, not current. */
  syncEnabled?: boolean;
  plan?: string | null;
  /** Date of the newest measurement, YYYY-MM-DD. */
  lastMeasuredAt?: string | null;
}

export interface GooglePlayMetricsQuery {
  projectId: string;
  startDate: string;
  endDate: string;
}

export interface GooglePlayMetricsTotals {
  installs: { value: number; change: number; trend: 'up' | 'down' | 'flat' };
  averageRating: { value: number; change: number; trend: 'up' | 'down' | 'flat' };
  revenue: { value: number | null; change: number | null; trend: 'up' | 'down' | 'flat' | null };
  crashRate: { value: number; change: number; trend: 'up' | 'down' | 'flat' };
}

export interface ConnectServiceAccountDto {
  projectId: string;
  serviceAccountKey: string;
  packageName: string;
}

export interface ReplyReviewDto {
  text: string;
}

export interface ReviewFilters {
  projectId: string;
  page?: number;
  limit?: number;
  starRating?: number;
  hasReply?: boolean;
  sortBy?: 'date' | 'rating';
  sortOrder?: 'asc' | 'desc';
}
