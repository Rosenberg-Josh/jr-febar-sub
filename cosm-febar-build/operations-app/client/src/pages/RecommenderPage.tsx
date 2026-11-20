import { useCallback, useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  Button,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Separator,
  Spinner,
  Alert,
  AlertTitle,
  AlertDescription,
} from '@databricks/appkit-ui/react';
import { Sparkles, ArrowRight, FlaskConical, ExternalLink, TriangleAlert } from 'lucide-react';
import { useFilters, VENUE_OPTIONS, venueLabel } from '../lib/filters';
import { KpiCard, SectionHeading } from '../components/ui-bits';
import { count, num, pct, dateTime } from '../lib/format';

interface Rule {
  antecedent_id: string;
  antecedent_name: string;
  consequent_id: string;
  consequent_name: string;
  support: number;
  confidence: number;
  lift: number;
  pair_count: number;
}

interface TrainResult {
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

interface RunRow {
  run_id: string;
  baskets: number;
  rules: number;
  avg_lift: number;
  venue: string;
  window_days: number;
  min_support: number;
  warehouse_baskets: number;
  app_baskets: number;
  mlflow_logged: boolean;
  status: string;
  created_at: string;
}

const SUPPORT_OPTIONS = [5, 10, 25, 50, 100];

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function RecommenderPage() {
  const filters = useFilters();
  const [venue, setVenue] = useState(filters.venue);
  const [days, setDays] = useState(filters.days);
  const [minSupport, setMinSupport] = useState(10);

  const [result, setResult] = useState<TrainResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RunRow[]>([]);
  const [showAll, setShowAll] = useState(false);

  const loadState = useCallback(async () => {
    try {
      const [state, runs] = await Promise.all([
        fetch('/api/recommender/state').then((r) => r.json()),
        fetch('/api/recommender/runs').then((r) => r.json()),
      ]);
      setHistory(Array.isArray(runs.runs) ? runs.runs : []);
      if (state.lastRun && Array.isArray(state.rules) && state.rules.length > 0) {
        const lr = state.lastRun;
        const rules: Rule[] = state.rules.map((r: Record<string, unknown>) => ({
          antecedent_id: String(r.antecedent_id),
          antecedent_name: String(r.antecedent_name),
          consequent_id: String(r.consequent_id),
          consequent_name: String(r.consequent_name),
          support: toNum(r.support),
          confidence: toNum(r.confidence),
          lift: toNum(r.lift),
          pair_count: toNum(r.pair_count),
        }));
        setResult((prev) =>
          prev ?? {
            run_id: String(lr.run_id ?? ''),
            experiment_id: String(lr.experiment_id ?? ''),
            run_url: null,
            mlflow_logged: Boolean(lr.mlflow_logged),
            baskets: toNum(lr.baskets),
            warehouse_baskets: toNum(lr.warehouse_baskets),
            app_baskets: toNum(lr.app_baskets),
            distinct_items: toNum(lr.distinct_items),
            rules_generated: toNum(lr.rules),
            avg_lift: toNum(lr.avg_lift),
            max_lift: Math.max(...rules.map((x) => x.lift), 0),
            avg_confidence: rules.reduce((s, x) => s + x.confidence, 0) / rules.length,
            coverage: 0,
            rules,
            venue: String(lr.venue ?? 'ALL'),
            days: toNum(lr.window_days),
            min_support: toNum(lr.min_support),
            trained_at: String(lr.created_at ?? ''),
          },
        );
      }
    } catch {
      // best effort
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  async function train() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/recommender/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue, days, minSupport }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error || 'Training failed.');
        return;
      }
      setResult(body as TrainResult);
      void loadState();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setRunning(false);
    }
  }

  const byItem = result ? groupByItem(result.rules) : [];
  const shownRules = result ? (showAll ? result.rules : result.rules.slice(0, 15)) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          FnB Item Recommender
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Train a market-basket affinity model on transaction history and log the run to the{' '}
          <span className="font-mono">FnB Item Recommender Training</span> MLflow experiment.
        </p>
      </div>

      <Card className="border-border/70">
        <CardContent className="py-5">
          <div className="flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="grid grid-cols-3 gap-3 flex-1">
              <div className="space-y-1.5">
                <Label>Venue</Label>
                <Select value={venue} onValueChange={setVenue}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VENUE_OPTIONS.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Training window</Label>
                <Select value={String(days)} onValueChange={(v) => setDays(parseInt(v, 10))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[7, 30, 90, 180, 365].map((d) => (
                      <SelectItem key={d} value={String(d)}>Last {d} days</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Min. co-occurrence</Label>
                <Select value={String(minSupport)} onValueChange={(v) => setMinSupport(parseInt(v, 10))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUPPORT_OPTIONS.map((s) => <SelectItem key={s} value={String(s)}>{s} baskets</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={train} disabled={running} className="lg:w-56">
              {running ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {running ? 'Training…' : 'Run training'}
            </Button>
          </div>
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2 mt-3">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {!result && !running && (
        <Card className="border-border/70 border-dashed">
          <CardContent className="py-14 text-center">
            <FlaskConical className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              No model trained yet. Pick a window and run training to generate item pairings.
            </p>
          </CardContent>
        </Card>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KpiCard label="Baskets analyzed" value={count(result.baskets, { compact: true })} sub={`${count(result.distinct_items)} menu items`} />
            <KpiCard label="Pairings found" value={count(result.rules_generated)} accent sub="Association rules" />
            <KpiCard label="Avg lift" value={num(result.avg_lift)} sub={`max ${num(result.max_lift)}`} />
            <KpiCard label="Avg confidence" value={pct(result.avg_confidence)} sub="Top pairings" />
            <KpiCard label="Item coverage" value={result.coverage ? pct(result.coverage) : '—'} sub="Items with a pairing" />
          </div>

          <Card className="border-border/70">
            <CardContent className="py-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">MLflow run</span>
                {result.mlflow_logged ? (
                  <Badge className="bg-success/15 text-success border-success/30">logged</Badge>
                ) : (
                  <Badge variant="outline" className="text-warning border-warning/40">not logged</Badge>
                )}
              </div>
              {result.run_id && (
                <span className="font-mono text-xs text-muted-foreground">{result.run_id}</span>
              )}
              {result.run_url && (
                <a href={result.run_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  Open in MLflow <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <span className="text-muted-foreground">
                {venueLabel(result.venue)} · last {result.days} days · {count(result.warehouse_baskets, { compact: true })} historical
                {result.app_baskets > 0 && <> + {count(result.app_baskets)} in-app</> } baskets
              </span>
              {result.trained_at && (
                <span className="text-muted-foreground ml-auto">trained {dateTime(result.trained_at)}</span>
              )}
            </CardContent>
          </Card>

          {!result.mlflow_logged && result.mlflow_error && (
            <Alert className="border-warning/40 bg-warning/5">
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>Model trained, experiment logging skipped</AlertTitle>
              <AlertDescription>{result.mlflow_error}</AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="pairings">
            <TabsList>
              <TabsTrigger value="pairings">Pairings</TabsTrigger>
              <TabsTrigger value="byitem">Recommendations by item</TabsTrigger>
              <TabsTrigger value="history">Run history</TabsTrigger>
            </TabsList>

            <TabsContent value="pairings">
              <Card className="border-border/70">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between px-5 py-3">
                    <SectionHeading title="Item pairings" description="Ranked by lift — how much more likely the pair is than chance." />
                    {result.rules.length > 15 && (
                      <Button variant="ghost" size="sm" onClick={() => setShowAll((s) => !s)}>
                        {showAll ? 'Show top 15' : `Show all ${result.rules.length}`}
                      </Button>
                    )}
                  </div>
                  <Separator />
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>If a guest orders</TableHead>
                          <TableHead>They also order</TableHead>
                          <TableHead className="text-right">Confidence</TableHead>
                          <TableHead className="text-right">Lift</TableHead>
                          <TableHead className="text-right">Support</TableHead>
                          <TableHead className="text-right">Co-orders</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shownRules.map((r, i) => (
                          <TableRow key={`${r.antecedent_id}-${r.consequent_id}-${i}`}>
                            <TableCell className="font-medium">{r.antecedent_name}</TableCell>
                            <TableCell>
                              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                <ArrowRight className="h-3.5 w-3.5" /> {r.consequent_name}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{pct(r.confidence)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              <Badge
                                variant="outline"
                                className={r.lift >= 1 ? 'text-success border-success/30' : 'text-muted-foreground'}
                              >
                                {num(r.lift)}×
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">{pct(r.support, 2)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">{count(r.pair_count)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="byitem">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {byItem.map((g) => (
                  <Card key={g.name} className="border-border/70">
                    <CardContent className="py-4">
                      <div className="text-sm font-semibold text-foreground mb-2">{g.name}</div>
                      <div className="text-xs text-muted-foreground mb-3">Suggest alongside</div>
                      <ul className="space-y-2">
                        {g.suggestions.map((s) => (
                          <li key={s.consequent_id} className="flex items-center justify-between text-sm">
                            <span className="text-foreground">{s.consequent_name}</span>
                            <Badge variant="outline" className={s.lift >= 1 ? 'text-success border-success/30' : 'text-muted-foreground'}>
                              {num(s.lift)}× · {pct(s.confidence, 0)}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="history">
              <Card className="border-border/70">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Trained</TableHead>
                          <TableHead>Venue</TableHead>
                          <TableHead className="text-right">Window</TableHead>
                          <TableHead className="text-right">Baskets</TableHead>
                          <TableHead className="text-right">Pairings</TableHead>
                          <TableHead className="text-right">Avg lift</TableHead>
                          <TableHead>MLflow</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                              No runs recorded yet.
                            </TableCell>
                          </TableRow>
                        )}
                        {history.map((h) => (
                          <TableRow key={h.run_id}>
                            <TableCell className="text-muted-foreground">{dateTime(h.created_at)}</TableCell>
                            <TableCell>{venueLabel(h.venue)}</TableCell>
                            <TableCell className="text-right tabular-nums">{toNum(h.window_days)}d</TableCell>
                            <TableCell className="text-right tabular-nums">{count(toNum(h.baskets), { compact: true })}</TableCell>
                            <TableCell className="text-right tabular-nums">{count(toNum(h.rules))}</TableCell>
                            <TableCell className="text-right tabular-nums">{num(toNum(h.avg_lift))}</TableCell>
                            <TableCell>
                              {h.mlflow_logged ? (
                                <Badge className="bg-success/15 text-success border-success/30">logged</Badge>
                              ) : (
                                <Badge variant="outline">local</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function groupByItem(rules: Rule[]): { name: string; suggestions: Rule[] }[] {
  const map = new Map<string, Rule[]>();
  for (const r of rules) {
    if (!map.has(r.antecedent_name)) map.set(r.antecedent_name, []);
    map.get(r.antecedent_name)!.push(r);
  }
  return [...map.entries()]
    .map(([name, rs]) => ({
      name,
      suggestions: rs.sort((a, b) => b.confidence - a.confidence).slice(0, 4),
    }))
    .sort((a, b) => b.suggestions[0].lift - a.suggestions[0].lift)
    .slice(0, 9);
}
