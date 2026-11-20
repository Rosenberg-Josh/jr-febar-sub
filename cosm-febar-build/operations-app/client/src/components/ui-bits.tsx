import type { ReactNode } from 'react';
import { Card, CardContent, Skeleton } from '@databricks/appkit-ui/react';

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  loading,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
  accent?: boolean;
}) {
  return (
    <Card className="shadow-sm border-border/70">
      <CardContent className="py-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        {loading ? (
          <Skeleton className="h-8 w-28 mt-2" />
        ) : (
          <div
            className={`mt-1.5 text-3xl font-semibold tabular-nums ${
              accent ? 'text-primary' : 'text-foreground'
            }`}
          >
            {value}
          </div>
        )}
        {sub && !loading && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function ChartFrame({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`shadow-sm border-border/70 min-w-0 ${className ?? ''}`}>
      <CardContent className="py-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
