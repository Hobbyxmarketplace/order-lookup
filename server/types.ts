export interface LookupResult {
  invoice: string;
  grading_company: string;
  status: string;
  status_date: string | null;
  submission_number: string | null;
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
