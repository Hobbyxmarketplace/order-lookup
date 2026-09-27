export interface LookupResult {
  invoice: string;
  grading_company: string;
  status: string;
  status_date: string | null;
  submission_number: string | null;

  owner_email: string | null;
  owner_login: string | null;
  owner_display_name: string | null;
  owner_phone: string | null;
  owner_registered: string | null;

  date_arrived: string | null;
  date_completed: string | null;
  pickup_ready_at: string | null;
  pickup_date: string | null;

  service_level: string | null;
  is_reholder_or_crc: boolean;

  // Only populated when status = 'Ready for Pickup'. Null for statuses where
  // the card isn't physically in the store yet or has already left.
  zone: { id: number; name: string } | null;

  // Shipment label, pre-formatted server-side to the app's display format.
  shipment: string | null;

  // Turnaround / estimated completion (nullable — some orders have single date).
  turnaround_days: number | null;
  turnaround_days_high: number | null;
  estimated_completion: string | null;
  estimated_completion_upper: string | null;

  // True when today's date is past the upper-bound estimated completion AND
  // the order is not yet Ready for Pickup / Picked Up.
  is_delayed: boolean;
}

export interface TableInfo {
  name: string;
  rows: number | null;
}

export interface ColumnInfo {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  IS_NULLABLE: string;
  COLUMN_KEY: string;
}

export interface TableData {
  table: string;
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  capped: number;
}
