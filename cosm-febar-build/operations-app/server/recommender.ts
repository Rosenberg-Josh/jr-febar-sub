import { sql, getExecutionContext } from '@databricks/appkit';
import { APP_SCHEMA, type AppkitLike, type Row, type WorkspaceClientLike } from './appkit-types.js';

const EXPERIMENT_ID = process.env.MLFLOW_EXPERIMENT_ID ?? '';

export interface TrainParams {
  venue: string; // 'ALL' | 'COSM-LA' | 'COSM-DAL'
  days: number;
  minSupport: number; // minimum co-occurrence count
}

export interface Rule {
  antecedent_id: string;
  antecedent_name: string;
  consequent_id: string;
  consequent_name: string;
  support: number;
  confidence: number;
  lift: number;
  pair_count: number;
}

export interface TrainResult {
  run_id: string | null;
  experiment_id: string;
  run_url: string | null;
  mlflow_logged: boolean;
  mlflow_error?: string;
  baskets: number;
  warehouse_baskets: number;
  app_baskets: number;
  distinct_items: number;
  rules_generated: number;
  avg_lift: number;
  max_lift: number;
  avg_confidence: number;
  coverage: number;
  rules: Rule[];
  venue: string;
  days: number;
  min_support: number;
  trained_at: string;
}

function asNum(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function asStr(v: unknown): string {
  return v == null ? '' : String(v);
}

type Counts = { total: number; items: Map<string, number>; pairs: Map<string, number> };

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

// Historical baskets from the lakehouse (warehouse), aggregated server-side.
async function warehouseCounts(appkit: AppkitLike, p: TrainParams): Promise<Counts> {
  const useVenue = p.venue !== 'ALL';
  const venueFilter = useVenue ? 'AND t.venue_id = :venue' : '';
  const params: Record<string, unknown> = useVenue
    ? { days: sql.int(p.days), venue: sql.string(p.venue) }
    : { days: sql.int(p.days) };

  const basketCte = `
    WITH b AS (
      SELECT DISTINCT ti.transaction_id, ti.item_id
      FROM jr_febar_catalog.sales.fnb_transaction_items ti
      JOIN jr_febar_catalog.sales.fnb_transactions t ON ti.transaction_id = t.transaction_id
      WHERE t.transaction_ts >= DATEADD(DAY, -:days, CURRENT_TIMESTAMP())
        ${venueFilter}
    )`;

  const itemsRes = await appkit.analytics.query(
    `${basketCte}
     SELECT 'ITEM' AS kind, item_id AS a, CAST(NULL AS STRING) AS b, COUNT(*) AS cnt
     FROM b GROUP BY item_id
     UNION ALL
     SELECT 'TOTAL' AS kind, CAST(NULL AS STRING) AS a, CAST(NULL AS STRING) AS b,
            COUNT(DISTINCT transaction_id) AS cnt FROM b`,
    params,
  );

  const pairsRes = await appkit.analytics.query(
    `${basketCte}
     SELECT x.item_id AS a, y.item_id AS b, COUNT(*) AS cnt
     FROM b x JOIN b y ON x.transaction_id = y.transaction_id AND x.item_id < y.item_id
     GROUP BY x.item_id, y.item_id`,
    params,
  );

  const counts: Counts = { total: 0, items: new Map(), pairs: new Map() };
  for (const r of itemsRes.data) {
    if (asStr(r.kind) === 'TOTAL') counts.total = asNum(r.cnt);
    else counts.items.set(asStr(r.a), asNum(r.cnt));
  }
  for (const r of pairsRes.data) {
    counts.pairs.set(pairKey(asStr(r.a), asStr(r.b)), asNum(r.cnt));
  }
  return counts;
}

// Incremental baskets written by the app itself (operational, Postgres).
async function appCounts(appkit: AppkitLike, p: TrainParams): Promise<Counts> {
  const counts: Counts = { total: 0, items: new Map(), pairs: new Map() };
  let baskets: Row[];
  try {
    const res = await appkit.lakebase.query(
      `SELECT transaction_id, item_id
       FROM ${APP_SCHEMA}.order_items
       WHERE created_at >= NOW() - ($1 || ' days')::interval`,
      [String(p.days)],
    );
    baskets = res.rows;
  } catch {
    return counts;
  }
  const byTxn = new Map<string, Set<string>>();
  for (const r of baskets) {
    const txn = asStr(r.transaction_id);
    const item = asStr(r.item_id);
    if (!byTxn.has(txn)) byTxn.set(txn, new Set());
    byTxn.get(txn)!.add(item);
  }
  for (const items of byTxn.values()) {
    counts.total += 1;
    const arr = [...items];
    for (const it of arr) counts.items.set(it, (counts.items.get(it) ?? 0) + 1);
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const k = pairKey(arr[i], arr[j]);
        counts.pairs.set(k, (counts.pairs.get(k) ?? 0) + 1);
      }
    }
  }
  return counts;
}

function mergeCounts(a: Counts, b: Counts): Counts {
  const out: Counts = { total: a.total + b.total, items: new Map(a.items), pairs: new Map(a.pairs) };
  for (const [k, v] of b.items) out.items.set(k, (out.items.get(k) ?? 0) + v);
  for (const [k, v] of b.pairs) out.pairs.set(k, (out.pairs.get(k) ?? 0) + v);
  return out;
}

async function menuNames(appkit: AppkitLike): Promise<Map<string, string>> {
  const res = await appkit.analytics.query(
    `SELECT item_id, item_name FROM jr_febar_catalog.sales.fnb_menu_items`,
  );
  const m = new Map<string, string>();
  for (const r of res.data) m.set(asStr(r.item_id), asStr(r.item_name));
  return m;
}

function buildRules(counts: Counts, names: Map<string, string>, minSupport: number): Rule[] {
  const rules: Rule[] = [];
  const total = counts.total || 1;
  for (const [key, pairCount] of counts.pairs) {
    if (pairCount < minSupport) continue;
    const [a, b] = key.split('\u0000');
    const ca = counts.items.get(a) ?? 0;
    const cb = counts.items.get(b) ?? 0;
    if (ca === 0 || cb === 0) continue;
    const support = pairCount / total;
    // Two directional rules per co-occurring pair.
    for (const [ant, con, cAnt, cCon] of [
      [a, b, ca, cb],
      [b, a, cb, ca],
    ] as [string, string, number, number][]) {
      const confidence = pairCount / cAnt;
      const lift = (pairCount * total) / (cAnt * cCon);
      rules.push({
        antecedent_id: ant,
        antecedent_name: names.get(ant) ?? ant,
        consequent_id: con,
        consequent_name: names.get(con) ?? con,
        support,
        confidence,
        lift,
        pair_count: pairCount,
      });
    }
  }
  rules.sort((x, y) => y.lift - x.lift || y.confidence - x.confidence);
  return rules;
}

async function mlflowRequest(
  client: WorkspaceClientLike,
  method: string,
  path: string,
  body?: unknown,
): Promise<Row> {
  const res = await client.request({
    method,
    path,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MLflow ${path} ${res.status}: ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as Row) : {};
}

interface MlflowLog {
  run_id: string | null;
  run_url: string | null;
  logged: boolean;
  error?: string;
}

async function logToMlflow(result: TrainResult): Promise<MlflowLog> {
  if (!EXPERIMENT_ID) {
    return { run_id: null, run_url: null, logged: false, error: 'MLFLOW_EXPERIMENT_ID not set' };
  }
  const ctx = getExecutionContext();
  const client = ctx?.client as WorkspaceClientLike | undefined;
  if (!client) return { run_id: null, run_url: null, logged: false, error: 'No workspace client' };

  try {
    const now = Date.now();
    const runName = `fnb-item-recommender-${new Date(now).toISOString().replace(/[:.]/g, '-')}`;
    const created = await mlflowRequest(client, 'POST', '/api/2.0/mlflow/runs/create', {
      experiment_id: EXPERIMENT_ID,
      start_time: now,
      run_name: runName,
      tags: [{ key: 'mlflow.runName', value: runName }],
    });
    const run = (created.run as Row | undefined)?.info as Row | undefined;
    const runId = asStr(run?.run_id);
    if (!runId) throw new Error('No run_id returned');

    const params = [
      ['algorithm', 'market-basket-affinity'],
      ['venue', result.venue],
      ['window_days', String(result.days)],
      ['min_support', String(result.min_support)],
      ['baskets', String(result.baskets)],
      ['warehouse_baskets', String(result.warehouse_baskets)],
      ['app_baskets', String(result.app_baskets)],
      ['distinct_items', String(result.distinct_items)],
    ].map(([key, value]) => ({ key, value }));

    const metrics = [
      ['rules_generated', result.rules_generated],
      ['avg_lift', result.avg_lift],
      ['max_lift', result.max_lift],
      ['avg_confidence', result.avg_confidence],
      ['item_coverage', result.coverage],
    ].map(([key, value]) => ({ key, value: Number(value), timestamp: now, step: 0 }));

    await mlflowRequest(client, 'POST', '/api/2.0/mlflow/runs/log-batch', {
      run_id: runId,
      params,
      metrics,
    });
    await mlflowRequest(client, 'POST', '/api/2.0/mlflow/runs/update', {
      run_id: runId,
      status: 'FINISHED',
      end_time: Date.now(),
    });

    let runUrl: string | null = null;
    try {
      const host = await client.getHost();
      runUrl = `${host}/ml/experiments/${EXPERIMENT_ID}/runs/${runId}`;
    } catch {
      runUrl = null;
    }
    return { run_id: runId, run_url: runUrl, logged: true };
  } catch (e) {
    return {
      run_id: null,
      run_url: null,
      logged: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function persist(appkit: AppkitLike, result: TrainResult): Promise<void> {
  try {
    await appkit.lakebase.query(
      `INSERT INTO ${APP_SCHEMA}.training_runs
       (run_id, experiment_id, baskets, distinct_items, rules, warehouse_baskets, app_baskets,
        min_support, avg_lift, venue, window_days, status, mlflow_logged)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        result.run_id ?? `local-${Date.now()}`,
        result.experiment_id,
        result.baskets,
        result.distinct_items,
        result.rules_generated,
        result.warehouse_baskets,
        result.app_baskets,
        result.min_support,
        result.avg_lift,
        result.venue,
        result.days,
        result.mlflow_logged ? 'FINISHED' : 'LOCAL',
        result.mlflow_logged,
      ],
    );
    await appkit.lakebase.query(`DELETE FROM ${APP_SCHEMA}.recommender_rules`);
    for (const r of result.rules) {
      await appkit.lakebase.query(
        `INSERT INTO ${APP_SCHEMA}.recommender_rules
         (run_id, antecedent_id, antecedent_name, consequent_id, consequent_name,
          support, confidence, lift, pair_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          result.run_id ?? 'local',
          r.antecedent_id,
          r.antecedent_name,
          r.consequent_id,
          r.consequent_name,
          r.support,
          r.confidence,
          r.lift,
          r.pair_count,
        ],
      );
    }
  } catch {
    // Persistence is best-effort; the run result is still returned to the client.
  }
}

export async function trainRecommender(appkit: AppkitLike, p: TrainParams): Promise<TrainResult> {
  const [wh, appc, names] = await Promise.all([
    warehouseCounts(appkit, p),
    appCounts(appkit, p),
    menuNames(appkit),
  ]);
  const merged = mergeCounts(wh, appc);
  const allRules = buildRules(merged, names, p.minSupport);
  const rules = allRules.slice(0, 50);

  const lifts = rules.map((r) => r.lift);
  const confs = rules.map((r) => r.confidence);
  const covered = new Set(rules.map((r) => r.antecedent_id));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const result: TrainResult = {
    run_id: null,
    experiment_id: EXPERIMENT_ID,
    run_url: null,
    mlflow_logged: false,
    baskets: merged.total,
    warehouse_baskets: wh.total,
    app_baskets: appc.total,
    distinct_items: merged.items.size,
    rules_generated: rules.length,
    avg_lift: Number(avg(lifts).toFixed(4)),
    max_lift: Number((lifts.length ? Math.max(...lifts) : 0).toFixed(4)),
    avg_confidence: Number(avg(confs).toFixed(4)),
    coverage: merged.items.size ? Number((covered.size / merged.items.size).toFixed(4)) : 0,
    rules,
    venue: p.venue,
    days: p.days,
    min_support: p.minSupport,
    trained_at: new Date().toISOString(),
  };

  const log = await logToMlflow(result);
  result.run_id = log.run_id;
  result.run_url = log.run_url;
  result.mlflow_logged = log.logged;
  if (log.error) result.mlflow_error = log.error;

  await persist(appkit, result);
  return result;
}
