import { APP_SCHEMA, SALES_TABLE, TAX_RATE, type AppkitLike, type Row } from './appkit-types.js';

// Service-principal Postgres role (used only to render the grant instructions).
export const SP_ROLE = '50d42876-e6fe-452f-ad38-edc4b3987e2b';

export function grantSql(): string {
  return [
    `GRANT USAGE ON SCHEMA sales TO "${SP_ROLE}";`,
    `GRANT SELECT, INSERT ON ${SALES_TABLE} TO "${SP_ROLE}";`,
  ].join('\n');
}

export interface SalesAccess {
  accessible: boolean;
  columns: string[];
  error?: string;
}

// Detect whether the app's service principal can read the existing sales table,
// and learn its real column names from the result descriptor (works even when
// information_schema is not visible to the role).
export async function checkSalesAccess(appkit: AppkitLike): Promise<SalesAccess> {
  try {
    const result = await appkit.lakebase.query(`SELECT * FROM ${SALES_TABLE} LIMIT 0`);
    const columns = (result.fields ?? []).map((f) => f.name);
    return { accessible: true, columns };
  } catch (e) {
    return { accessible: false, columns: [], error: e instanceof Error ? e.message : String(e) };
  }
}

function pickTimestampColumn(columns: string[]): string | null {
  const lower = columns.map((c) => c.toLowerCase());
  const preferred = ['transaction_ts', 'purchase_ts', 'created_at', 'order_ts'];
  for (const p of preferred) {
    const i = lower.indexOf(p);
    if (i >= 0) return columns[i];
  }
  const fuzzy = columns.find((c) => /ts$|_time$|timestamp|date/i.test(c));
  return fuzzy ?? null;
}

export async function listTransactions(
  appkit: AppkitLike,
  access: SalesAccess,
  limit: number,
): Promise<Row[]> {
  const tsCol = pickTimestampColumn(access.columns);
  const order = tsCol ? `ORDER BY "${tsCol}" DESC` : '';
  const result = await appkit.lakebase.query(
    `SELECT * FROM ${SALES_TABLE} ${order} LIMIT $1`,
    [limit],
  );
  return result.rows;
}

export interface NewTxnInput {
  venue_id: string;
  outlet: string;
  payment_method: string;
  customer_id?: string;
  tip?: number;
  items: { item_id: string; item_name: string; quantity: number; price: number }[];
}

export interface WrittenTxn {
  transaction_id: string;
  order_id: string;
  venue_id: string;
  outlet: string;
  customer_id: string;
  showtime_id: string;
  payment_method: string;
  subtotal: number;
  tax: number;
  tip: number;
  total_amount: number;
  transaction_ts: string;
}

function rid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e4)
    .toString(36)
    .toUpperCase()}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildTxn(input: NewTxnInput): WrittenTxn {
  const subtotal = round2(input.items.reduce((s, it) => s + it.price * it.quantity, 0));
  const tax = round2(subtotal * TAX_RATE);
  const tip = round2(input.tip ?? 0);
  const total = round2(subtotal + tax + tip);
  const now = new Date();
  const venueShort = input.venue_id.replace('COSM-', '');
  const stamp =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0');
  return {
    transaction_id: rid('FNB'),
    order_id: rid('ORD'),
    venue_id: input.venue_id,
    outlet: input.outlet,
    customer_id: input.customer_id?.trim() || `CUST-APP-${Math.floor(Math.random() * 1e6)}`,
    showtime_id: `SHW-${venueShort}-${stamp}`,
    payment_method: input.payment_method,
    subtotal,
    tax,
    tip,
    total_amount: total,
    transaction_ts: now.toISOString(),
  };
}

// Insert the header into the existing sales table, writing only the columns that
// actually exist (the table schema is discovered at runtime).
export async function insertTransaction(
  appkit: AppkitLike,
  txn: WrittenTxn,
  availableColumns: string[],
): Promise<void> {
  const available = new Set(availableColumns);
  const record: Record<string, string | number> = {
    transaction_id: txn.transaction_id,
    order_id: txn.order_id,
    venue_id: txn.venue_id,
    outlet: txn.outlet,
    customer_id: txn.customer_id,
    showtime_id: txn.showtime_id,
    payment_method: txn.payment_method,
    subtotal: txn.subtotal,
    tax: txn.tax,
    tip: txn.tip,
    total_amount: txn.total_amount,
    transaction_ts: txn.transaction_ts,
  };
  const cols = Object.keys(record).filter((c) => available.has(c));
  if (cols.length === 0) {
    throw new Error('None of the generated columns match the sales table schema.');
  }
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const params = cols.map((c) => record[c]);
  await appkit.lakebase.query(
    `INSERT INTO ${SALES_TABLE} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders.join(', ')})`,
    params,
  );
}

// Store the item basket in an app-owned schema so new transactions feed training.
export async function insertBasket(
  appkit: AppkitLike,
  transactionId: string,
  items: NewTxnInput['items'],
): Promise<void> {
  for (const it of items) {
    await appkit.lakebase.query(
      `INSERT INTO ${APP_SCHEMA}.order_items (transaction_id, item_id, quantity, line_total)
       VALUES ($1, $2, $3, $4)`,
      [transactionId, it.item_id, it.quantity, round2(it.price * it.quantity)],
    );
  }
}
