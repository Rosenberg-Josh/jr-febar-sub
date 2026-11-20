import {
  useAnalyticsQuery,
  AreaChart,
  BarChart,
  DonutChart,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { useFilters, venueLabel, windowLabel } from '../lib/filters';
import { VenueWindowFilter } from '../App';
import { KpiCard, SectionHeading, ChartFrame } from '../components/ui-bits';
import { usd, count } from '../lib/format';

export function OverviewPage() {
  const { venue, days } = useFilters();
  const params = { venue: sql.string(venue), days: sql.number(days) };

  const kpi = useAnalyticsQuery('venue_kpis', params);
  const row = kpi.data?.[0];
  const money = (v: unknown) => usd(Number(v ?? 0), { compact: true });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Venue performance
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {venueLabel(venue)} · {windowLabel(days).toLowerCase()}
          </p>
        </div>
        <VenueWindowFilter />
      </div>

      {kpi.error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3">
          Couldn't load venue metrics: {kpi.error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <KpiCard label="F&B revenue" value={money(row?.fnb_revenue)} loading={kpi.loading} accent sub="Food & beverage" />
        <KpiCard label="F&B orders" value={count(Number(row?.fnb_orders ?? 0), { compact: true })} loading={kpi.loading} sub="Completed orders" />
        <KpiCard label="Avg order" value={usd(Number(row?.avg_order_value ?? 0))} loading={kpi.loading} sub="Per F&B order" />
        <KpiCard label="Tips" value={money(row?.total_tips)} loading={kpi.loading} sub="Total gratuity" />
        <KpiCard label="Ticket revenue" value={money(row?.ticket_revenue)} loading={kpi.loading} sub="Box office" />
        <KpiCard label="Tickets sold" value={count(Number(row?.tickets_sold ?? 0), { compact: true })} loading={kpi.loading} sub="Admissions" />
      </div>

      <section>
        <SectionHeading
          title="F&B revenue trend"
          description="Daily food & beverage revenue across the selected window."
        />
        <ChartFrame title="Revenue by day" description="USD, gross of tax and tips">
          <AreaChart
            queryKey="fnb_revenue_trend"
            parameters={params}
            xKey="day"
            yKey="revenue"
            colorPalette="categorical"
            smooth
            height={300}
            valueFormatter={(v) => usd(Number(v), { compact: true })}
          />
        </ChartFrame>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartFrame title="Outlet performance" description="Revenue by F&B outlet">
          <BarChart
            queryKey="outlet_performance"
            parameters={params}
            xKey="outlet"
            yKey="revenue"
            colorPalette="categorical"
            height={300}
            valueFormatter={(v) => usd(Number(v), { compact: true })}
          />
        </ChartFrame>
        <ChartFrame title="Payment mix" description="Orders by payment method">
          <DonutChart
            queryKey="payment_mix"
            parameters={params}
            xKey="payment_method"
            yKey="orders"
            colorPalette="categorical"
            showLegend
            height={300}
            valueFormatter={(v) => count(Number(v), { compact: true })}
          />
        </ChartFrame>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartFrame title="Top menu items" description="Best sellers by revenue">
          <BarChart
            queryKey="top_items"
            parameters={params}
            xKey="item_name"
            yKey="revenue"
            orientation="horizontal"
            colorPalette="sequential"
            height={380}
            valueFormatter={(v) => usd(Number(v), { compact: true })}
          />
        </ChartFrame>
        <ChartFrame title="Ticket sales channels" description="Box office revenue by channel">
          <BarChart
            queryKey="ticket_channels"
            parameters={params}
            xKey="channel"
            yKey="revenue"
            colorPalette="categorical"
            height={380}
            valueFormatter={(v) => usd(Number(v), { compact: true })}
          />
        </ChartFrame>
      </section>

      <section>
        <SectionHeading title="Order volume by hour" description="When guests order F&B during the day." />
        <ChartFrame title="Orders by hour of day" description="Count of F&B orders, 0–23h">
          <BarChart
            queryKey="hourly_pattern"
            parameters={params}
            xKey="hour"
            yKey="orders"
            colorPalette="sequential"
            height={260}
            valueFormatter={(v) => count(Number(v))}
          />
        </ChartFrame>
      </section>
    </div>
  );
}
