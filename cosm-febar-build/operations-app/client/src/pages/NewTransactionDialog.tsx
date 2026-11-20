import { useMemo, useState } from 'react';
import {
  useAnalyticsQuery,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Button,
  Input,
  Label,
  Badge,
  Separator,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@databricks/appkit-ui/react';
import { Plus, Minus, ShoppingCart } from 'lucide-react';
import { OUTLETS, PAYMENT_METHODS, VENUE_OPTIONS } from '../lib/filters';
import { usd } from '../lib/format';

const TAX_RATE = 0.095;

interface MenuItem {
  item_id: string;
  item_name: string;
  item_category: string;
  price: number;
}

export interface CreatedTxn {
  transaction_id: string;
  total_amount: number;
}

export function NewTransactionDialog({ onCreated }: { onCreated: (txn: CreatedTxn) => void }) {
  const menu = useAnalyticsQuery('menu_items');
  const [open, setOpen] = useState(false);
  const [venue, setVenue] = useState<'COSM-LA' | 'COSM-DAL'>('COSM-LA');
  const [outlet, setOutlet] = useState<string>(OUTLETS[0]);
  const [payment, setPayment] = useState<string>(PAYMENT_METHODS[0]);
  const [customer, setCustomer] = useState('');
  const [tip, setTip] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = (menu.data ?? []) as MenuItem[];
  const grouped = useMemo(() => {
    const m = new Map<string, MenuItem[]>();
    for (const it of items) {
      if (!m.has(it.item_category)) m.set(it.item_category, []);
      m.get(it.item_category)!.push(it);
    }
    return [...m.entries()];
  }, [items]);

  const selected = items
    .filter((it) => (qty[it.item_id] ?? 0) > 0)
    .map((it) => ({ ...it, quantity: qty[it.item_id] }));
  const subtotal = selected.reduce((s, it) => s + it.price * it.quantity, 0);
  const tax = subtotal * TAX_RATE;
  const tipNum = Math.max(0, parseFloat(tip) || 0);
  const total = subtotal + tax + tipNum;

  function bump(id: string, delta: number) {
    setQty((q) => {
      const next = Math.max(0, (q[id] ?? 0) + delta);
      return { ...q, [id]: next };
    });
  }

  function reset() {
    setQty({});
    setTip('');
    setCustomer('');
    setError(null);
  }

  async function submit() {
    if (selected.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venue,
          outlet,
          payment_method: payment,
          customer_id: customer || undefined,
          tip: tipNum,
          items: selected.map((it) => ({
            item_id: it.item_id,
            item_name: it.item_name,
            quantity: it.quantity,
            price: it.price,
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error === 'no_access' ? 'The sales database is not connected yet.' : body?.error || 'Could not record the transaction.');
        return;
      }
      onCreated({
        transaction_id: body.transaction.transaction_id,
        total_amount: body.transaction.total_amount,
      });
      reset();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          New transaction
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Record a F&B transaction</DialogTitle>
          <DialogDescription>
            Build an order basket. It's written to sales.transactionsdb and feeds the item
            recommender.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label>Venue</Label>
            <Select value={venue} onValueChange={(v) => setVenue(v as typeof venue)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VENUE_OPTIONS.filter((v) => v.id !== 'ALL').map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.short}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 col-span-1">
            <Label>Outlet</Label>
            <Select value={outlet} onValueChange={setOutlet}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {OUTLETS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Payment</Label>
            <Select value={payment} onValueChange={setPayment}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tip">Tip (USD)</Label>
            <Input id="tip" inputMode="decimal" placeholder="0.00" value={tip} onChange={(e) => setTip(e.target.value)} />
          </div>
        </div>

        <Separator />

        <ScrollArea className="flex-1 -mx-1 px-1 max-h-[38vh]">
          {menu.loading && <div className="text-sm text-muted-foreground py-6 text-center">Loading menu…</div>}
          {menu.error && <div className="text-sm text-destructive py-6 text-center">Couldn't load the menu.</div>}
          <div className="space-y-4">
            {grouped.map(([cat, list]) => (
              <div key={cat}>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  {cat}
                </div>
                <div className="space-y-1">
                  {list.map((it) => {
                    const q = qty[it.item_id] ?? 0;
                    return (
                      <div
                        key={it.item_id}
                        className={`flex items-center gap-3 rounded-md px-2.5 py-1.5 ${q > 0 ? 'bg-accent/60' : 'hover:bg-accent/30'}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-foreground truncate">{it.item_name}</div>
                        </div>
                        <div className="text-sm text-muted-foreground tabular-nums w-14 text-right">
                          {usd(Number(it.price))}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => bump(it.item_id, -1)} disabled={q === 0} aria-label={`Remove ${it.item_name}`}>
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="w-5 text-center text-sm tabular-nums">{q}</span>
                          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => bump(it.item_id, 1)} aria-label={`Add ${it.item_name}`}>
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <Separator />

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShoppingCart className="h-4 w-4" />
            <Badge variant="secondary">{selected.reduce((s, it) => s + it.quantity, 0)} items</Badge>
          </div>
          <div className="flex gap-5 tabular-nums">
            <span className="text-muted-foreground">Subtotal {usd(subtotal)}</span>
            <span className="text-muted-foreground">Tax {usd(tax)}</span>
            <span className="font-semibold text-foreground">Total {usd(total)}</span>
          </div>
        </div>

        {error && <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</div>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={selected.length === 0 || submitting}>
            {submitting && <Spinner className="h-4 w-4" />}
            Record transaction · {usd(total)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
