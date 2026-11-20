import { createApp, analytics, server, lakebase, genie } from '@databricks/appkit';
import { z } from 'zod';
import { APP_SCHEMA, VENUES, type AppkitLike } from './appkit-types.js';
import {
  buildTxn,
  checkSalesAccess,
  grantSql,
  insertBasket,
  insertTransaction,
  listTransactions,
  SP_ROLE,
} from './transactions.js';
import { trainRecommender } from './recommender.js';

const itemSchema = z.object({
  item_id: z.string().min(1),
  item_name: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
  price: z.number().min(0).max(1000),
});

const newTxnSchema = z.object({
  venue_id: z.enum(VENUES),
  outlet: z.string().min(1).max(60),
  payment_method: z.string().min(1).max(40),
  customer_id: z.string().max(60).optional(),
  tip: z.number().min(0).max(10000).optional(),
  items: z.array(itemSchema).min(1).max(30),
});

const trainSchema = z.object({
  venue: z.string().min(1).max(20),
  days: z.number().int().min(1).max(900),
  minSupport: z.number().int().min(1).max(100000),
});

createApp({
  plugins: [analytics(), server(), lakebase(), genie()],
  async onPluginsReady(appkit) {
    const ak = appkit as AppkitLike;

    // App-owned schema (service principal owns it — no external grant needed).
    const guard = await appkit.lakebase.query(
      `SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = '${APP_SCHEMA}')
                   THEN has_schema_privilege('${APP_SCHEMA}', 'CREATE') ELSE true END AS can_ddl`,
    );
    if (guard.rows[0]?.can_ddl) {
      await appkit.lakebase.query(`
        CREATE SCHEMA IF NOT EXISTS ${APP_SCHEMA};
        CREATE TABLE IF NOT EXISTS ${APP_SCHEMA}.order_items (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          transaction_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          quantity INT NOT NULL,
          line_total DOUBLE PRECISION NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_order_items_txn ON ${APP_SCHEMA}.order_items(transaction_id);
        CREATE TABLE IF NOT EXISTS ${APP_SCHEMA}.recommender_rules (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          run_id TEXT,
          antecedent_id TEXT, antecedent_name TEXT,
          consequent_id TEXT, consequent_name TEXT,
          support DOUBLE PRECISION, confidence DOUBLE PRECISION, lift DOUBLE PRECISION,
          pair_count INT,
          trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS ${APP_SCHEMA}.training_runs (
          run_id TEXT PRIMARY KEY,
          experiment_id TEXT,
          baskets INT, distinct_items INT, rules INT,
          warehouse_baskets INT, app_baskets INT,
          min_support INT, avg_lift DOUBLE PRECISION,
          venue TEXT, window_days INT,
          status TEXT, mlflow_logged BOOLEAN,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    }

    appkit.server.extend((app) => {
      // ---- Live transactions (Lakebase: sales.transactionsdb) ----
      app.get('/api/transactions/status', async (_req, res) => {
        const access = await checkSalesAccess(ak);
        res.json({
          accessible: access.accessible,
          columns: access.columns,
          error: access.error ?? null,
          spRole: SP_ROLE,
          grantSql: access.accessible ? null : grantSql(),
          table: 'sales.transactionsdb',
        });
      });

      app.get('/api/transactions', async (req, res) => {
        const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 200);
        const access = await checkSalesAccess(ak);
        if (!access.accessible) {
          res.status(409).json({ error: 'no_access', grantSql: grantSql(), spRole: SP_ROLE });
          return;
        }
        try {
          const rows = await listTransactions(ak, access, limit);
          res.json({ transactions: rows, columns: access.columns });
        } catch (e) {
          res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
        }
      });

      app.post('/api/transactions', async (req, res) => {
        const parsed = newTxnSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'invalid_input', details: parsed.error.issues });
          return;
        }
        const access = await checkSalesAccess(ak);
        if (!access.accessible) {
          res.status(409).json({ error: 'no_access', grantSql: grantSql(), spRole: SP_ROLE });
          return;
        }
        const txn = buildTxn(parsed.data);
        try {
          await insertTransaction(ak, txn, access.columns);
          await insertBasket(ak, txn.transaction_id, parsed.data.items);
          res.status(201).json({ transaction: txn });
        } catch (e) {
          res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
        }
      });

      // ---- FnB Item Recommender training ----
      app.post('/api/recommender/train', async (req, res) => {
        const parsed = trainSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'invalid_input', details: parsed.error.issues });
          return;
        }
        try {
          const result = await trainRecommender(ak, parsed.data);
          res.json(result);
        } catch (e) {
          res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
        }
      });

      app.get('/api/recommender/state', async (_req, res) => {
        try {
          const runs = await appkit.lakebase.query(
            `SELECT * FROM ${APP_SCHEMA}.training_runs ORDER BY created_at DESC LIMIT 1`,
          );
          const rules = await appkit.lakebase.query(
            `SELECT antecedent_id, antecedent_name, consequent_id, consequent_name,
                    support, confidence, lift, pair_count
             FROM ${APP_SCHEMA}.recommender_rules
             ORDER BY lift DESC LIMIT 50`,
          );
          res.json({ lastRun: runs.rows[0] ?? null, rules: rules.rows });
        } catch (e) {
          res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
        }
      });

      // ---- Signed-in user (for the Genie assistant identity badge) ----
      app.get('/api/whoami', (req, res) => {
        res.json({
          email: req.header('x-forwarded-email') ?? null,
          user: req.header('x-forwarded-preferred-username') ?? req.header('x-forwarded-user') ?? null,
        });
      });

      app.get('/api/recommender/runs', async (_req, res) => {
        try {
          const runs = await appkit.lakebase.query(
            `SELECT * FROM ${APP_SCHEMA}.training_runs ORDER BY created_at DESC LIMIT 20`,
          );
          res.json({ runs: runs.rows });
        } catch (e) {
          res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
        }
      });
    });
  },
}).catch(console.error);
