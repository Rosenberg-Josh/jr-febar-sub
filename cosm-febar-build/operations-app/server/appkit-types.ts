// Minimal structural types for the AppKit handles we use in route modules.
export type Row = Record<string, unknown>;

export interface PgResult {
  rows: Row[];
  fields?: { name: string }[];
}

export interface WorkspaceRequest {
  method: string;
  path: string;
  query?: Record<string, string>;
  headers?: Headers;
  body?: string;
}

export interface WorkspaceClientLike {
  request(req: WorkspaceRequest): Promise<Response>;
  getHost(): Promise<string>;
}

export interface AppkitLike {
  lakebase: { query(text: string, params?: unknown[]): Promise<PgResult> };
  analytics: {
    query(q: string, params?: Record<string, unknown>): Promise<{ data: Row[] }>;
  };
}

export const SALES_TABLE = 'sales.transactionsdb';
export const APP_SCHEMA = 'cosm_ops';
export const TAX_RATE = 0.095;
export const VENUES = ['COSM-LA', 'COSM-DAL'] as const;
