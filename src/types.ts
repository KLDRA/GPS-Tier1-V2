export type ActivityType = 'travel' | 'work';

export interface Client {
  id: string;
  name: string;
  address?: string;
}

export interface Activity {
  id: string;
  type: ActivityType;
  clientId: string;
  startTime: string; // ISO string
  endTime?: string; // ISO string
  notes?: string;
}

export interface ActivityWithClient extends Activity {
  clientName: string;
}
