import { useCallback, useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
  Button,
  Alert,
  AlertTitle,
  AlertDescription,
  Skeleton,
  Separator,
} from '@databricks/appkit-ui/react';
import { RefreshCw, Lock, Radio, Copy, Check } from 'lucide-react';
import { NewTransactionDialog, type CreatedTxn } from './NewTransactionDialog';
import { usd, dateTime, timeAgo } from '../lib/format';

interface Status {
  accessible: boolean;
  columns: string[];
  grantSql: string | null;
  spRole: string;
  error: string | null;
}

type Row = Record<string, unknown>;

const FEED_COLUMNS: { key: string; label: string; render?: (v: unknown, r: Row) => React.ReactNode }[] = [
  { key: 'transaction_ts', label: 'Time', render: (v) => <span className="text-muted-foreground">{dateTime(v)}</span> },
  { key: 'transaction_id', label: 'Transaction', render: (v) => <span className="font-mono text-xs">{String(v)}</span> },
  { key: 'venue_id', label: 'Venue', render: (v) => <Badge variant="outline">{String(v).replace('COSM-', '')}</Badge> },
  { key: 'outlet', label: 'Outlet' },
  { key: 'payment_method', label: 'Payment' },
  { key: 'subtotal', label: 'Subtotal', render: (v) => <span className="tabular-nums">{usd(Number(v))}</span> },
  { key: 'tip', label: 'Tip', render: (v) => <span className="tabular-nums text-muted-foreground">{usd(Number(v))}</span> },
  { key: 'total_amount', label: 'Total', render: (v) => <span className="tabular-nums font-medium">{usd(Number(v))}</span> },
];

export function LiveTransactionsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const s: Status = await fetch('/api/transactions/status').then((r) => r.json());
      setStatus(s);
      if (s.accessible) {
        const t = await fetch('/api/transactions?limit=100').then((r) => r.json());
        setRows(Array.isArray(t.transactions) ? t.transactions : []);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function onCreated(txn: CreatedTxn) {
    setConfirmation(`Transaction ${txn.transaction_id} recorded · ${usd(txn.total_amount)}`);
    void load();
  }

  function copyGrant() {
    if (!status?.grantSql) return;
    void navigator.clipboard?.writeText(status.grantSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const columns = status?.accessible
    ? FEED_COLUMNS.filter((c) => status.columns.includes(c.key))
    : [];
  const activeColumns = columns.length > 0 ? columns : FEED_COLUMNS;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            Live transactions
            {status?.accessible && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                <Radio className="h-3.5 w-3.5 animate-pulse" /> live
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Point-of-sale feed from the <span className="font-mono">sales.transactionsdb</span>{' '}
            operational database.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {status?.accessible && <NewTransactionDialog onCreated={onCreated} />}
        </div>
      </div>

      <div aria-live="polite" className="sr-only">
        {confirmation}
      </div>
      {confirmation && (
        <div className="flex items-center gap-2 text-sm text-success bg-success/10 border border-success/30 rounded-lg px-4 py-2.5">
          <Check className="h-4 w-4" />
          {confirmation}
        </div>
      )}

      {loading && (
        <Card className="border-border/70">
          <CardContent className="py-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
      )}

      {!loading && status && !status.accessible && (
        <Alert className="border-warning/40 bg-warning/5">
          <Lock className="h-4 w-4" />
          <AlertTitle>Connect the sales database to go live</AlertTitle>
          <AlertDescription>
            <div className="space-y-3 mt-1">
              <p>
                This app's service principal can reach the <span className="font-mono">cosmdb</span>{' '}
                Postgres project, but it hasn't been granted access to the{' '}
                <span className="font-mono">sales</span> schema yet. As the project owner, run this
                once in the Lakebase SQL editor (database <span className="font-mono">cosm-transactions</span>):
              </p>
              <div className="relative">
                <pre className="text-xs bg-background/80 border border-border rounded-md p-3 overflow-x-auto font-mono whitespace-pre-wrap">
{status.grantSql}
                </pre>
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={copyGrant}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Then press Refresh. The live feed and new-transaction writes will activate
                immediately — no redeploy needed.
              </p>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {!loading && status?.accessible && (
        <Card className="border-border/70">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-muted-foreground">
                {rows.length} most recent {rows.length === 1 ? 'transaction' : 'transactions'}
              </span>
              {rows[0]?.transaction_ts != null && (
                <span className="text-xs text-muted-foreground">
                  latest {timeAgo(rows[0].transaction_ts)}
                </span>
              )}
            </div>
            <Separator />
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {activeColumns.map((c) => (
                      <TableHead key={c.key}>{c.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={activeColumns.length} className="text-center text-muted-foreground py-10">
                        No transactions yet. Record the first one to see it here.
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((r, i) => (
                    <TableRow key={String(r.transaction_id ?? i)}>
                      {activeColumns.map((c) => (
                        <TableCell key={c.key}>
                          {c.render ? c.render(r[c.key], r) : String(r[c.key] ?? '—')}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
