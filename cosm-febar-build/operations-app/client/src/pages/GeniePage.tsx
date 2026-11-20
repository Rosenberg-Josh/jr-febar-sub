import { useEffect, useState } from 'react';
import { GenieChat, Badge, Card, CardContent } from '@databricks/appkit-ui/react';
import { Sparkles, ShieldCheck, Info } from 'lucide-react';

const EXAMPLES = [
  'Which content drove the most ticket revenue last month?',
  'Top F&B items by revenue at Cosm Los Angeles',
  'How many unique customers visited in the last 90 days?',
  'Compare ticket sales by channel across venues',
];

export function GeniePage() {
  const [who, setWho] = useState<{ email: string | null; user: string | null } | null>(null);

  useEffect(() => {
    fetch('/api/whoami')
      .then((r) => r.json())
      .then(setWho)
      .catch(() => setWho(null));
  }, []);

  const identity = who?.email || who?.user;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Ask Cosm
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            A natural-language assistant over Cosm content, sales and customers, powered by the{' '}
            <span className="font-mono">Cosm Content, Sales and Customers</span> Genie space.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 self-start md:self-auto">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          {identity ? `Signed in as ${identity}` : 'Runs with your Databricks access'}
        </Badge>
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 border border-border/70 rounded-lg px-3.5 py-2.5">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <p>
          Answers are AI-generated from your question using your own Databricks permissions. Each
          answer includes the SQL Genie ran — review it before acting on the results.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <Card className="border-border/70 xl:col-span-1 h-max">
          <CardContent className="py-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Try asking
            </div>
            <ul className="space-y-2.5">
              {EXAMPLES.map((q) => (
                <li key={q} className="text-sm text-foreground/90 leading-snug">
                  “{q}”
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border/70 xl:col-span-3 overflow-hidden">
          <div className="h-[calc(100vh-20rem)] min-h-[520px]">
            <GenieChat alias="default" placeholder="Ask about content, sales, or customers…" />
          </div>
        </Card>
      </div>
    </div>
  );
}
