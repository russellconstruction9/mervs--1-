
export enum TaskStatus {
  PENDING = 'Pending',
  IN_PROGRESS = 'In Progress',
  BLOCKED = 'Blocked',
  COMPLETED = 'Completed'
}

export enum TaskPriority {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  CRITICAL = 'Critical'
}

export interface Task {
  id: string;
  title: string;
  description: string;
  location: string;
  assignedTo: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: number;
  image?: string;
  jobName?: string; // NEW: Linked Job Name
}

export interface TimeEntry {
  id: string;
  userId: string;
  startTime: number;
  endTime: number | null; // null if currently clocked in
  status: 'active' | 'completed';
  jobName?: string; // NEW: Field for job name
  notes?: string;
  totalPay?: number;
  isSynced?: boolean; // NEW: Tracks sync status locally
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  image?: string;
  // New fields for Optimistic UI
  status?: 'sending' | 'sent' | 'error';
  localId?: string;
}


// NOTE: App uses JobOption (below) for active job management — matches backend schema

// NEW: Admin Types
export interface UserProfile {
  id: string;
  name: string;
  rate: string;
  role: 'admin' | 'user';
  pin?: string;
  orgId?: string;  // organization the user belongs to (multi-tenant)
}

export interface JobOption {
  id: string;
  name: string;
  address: string;
  active: boolean;
}

// NEW: Push Notification Types
export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userId?: string;
  userAgent?: string;
}

// Replaced 'jobs' with 'timeclock'
export type ViewType = 'tasks' | 'timeclock' | 'calendar' | 'chat' | 'admin';

export interface SheetResponse {
  status: 'success' | 'error';
  data?: any[];
  message?: string;
}

// Icon Props
export interface IconProps {
  className?: string;
  size?: number;
  fill?: string;
  strokeWidth?: number | string;
}
