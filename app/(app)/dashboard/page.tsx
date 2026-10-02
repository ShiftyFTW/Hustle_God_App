'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Plus,
  LayoutGrid,
  List,
  RefreshCw,
  Search,
  Package,
  DollarSign,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  SneakerItem,
  ItemStatus,
  STATUS_LABELS,
  STATUS_COLORS,
  CONDITION_LABELS,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const STATUS_ORDER: ItemStatus[] = [
  'draft',
  'needs_photos',
  'needs_review',
  'ready_to_list',
  'listed',
  'sold',
  'delisted',
];

function StatsBar({ items }: { items: SneakerItem[] }) {
  const total = items.length;
  const listed = items.filter((i) => i.status === 'listed').length;
  const readyToList = items.filter((i) => i.status === 'ready_to_list').length;
  const needsAttention = items.filter((i) =>
    ['needs_photos', 'needs_review'].includes(i.status)
  ).length;
  const totalValue = items
    .filter((i) => i.list_price)
    .reduce((sum, i) => sum + (i.list_price || 0), 0);

  const stats = [
    { label: 'Total Inventory', value: total, icon: Package, color: 'text-blue-400' },
    { label: 'Active Listings', value: listed, icon: TrendingUp, color: 'text-emerald-400' },
    { label: 'Ready to List', value: readyToList, icon: DollarSign, color: 'text-amber-400' },
    { label: 'Needs Attention', value: needsAttention, icon: AlertCircle, color: 'text-orange-400' },
    {
      label: 'Inventory Value',
      value: `$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 0 })}`,
      icon: DollarSign,
      color: 'text-green-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
      {stats.map(({ label, value, icon: Icon, color }) => (
        <div
          key={label}
          className="stat-card bg-card border border-border rounded-xl p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <Icon className={cn('w-4 h-4', color)} />
          </div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: ItemStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        STATUS_COLORS[status]
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function TableView({ items }: { items: SneakerItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Package className="w-12 h-12 text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground font-medium">No items found</p>
        <p className="text-sm text-muted-foreground/60 mt-1">
          Create your first item to get started
        </p>
        <Link href="/items/new">
          <Button className="mt-4" size="sm">
            <Plus className="w-4 h-4 mr-2" />
            New Item
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-card/50">
            {['ID', 'Thumbnail', 'Brand / Model', 'Style Code', 'Size', 'Condition', 'Price', 'Status', 'Platforms', ''].map(
              (h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr
              key={item.id}
              className={cn(
                'border-b border-border/60 hover:bg-accent/40 transition-colors',
                i % 2 === 0 ? 'bg-background' : 'bg-card/30'
              )}
            >
              <td className="px-4 py-3 font-mono text-xs text-primary font-semibold whitespace-nowrap">
                {item.item_id}
              </td>
              <td className="px-4 py-3">
                {item.hero_image_url ? (
                  <img
                    src={item.hero_image_url}
                    alt={item.model || 'Sneaker'}
                    className="w-12 h-12 object-cover rounded-lg border border-border"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg border border-border bg-card flex items-center justify-center">
                    <Package className="w-5 h-5 text-muted-foreground/40" />
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                <p className="font-medium text-foreground">
                  {item.brand || <span className="text-muted-foreground">—</span>}
                </p>
                <p className="text-muted-foreground text-xs">
                  {item.model || item.nickname || '—'}
                </p>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                {item.style_code || '—'}
              </td>
              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                {item.size || '—'}
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                {item.condition_grade ? CONDITION_LABELS[item.condition_grade] : '—'}
              </td>
              <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">
                {item.list_price ? `$${item.list_price.toFixed(0)}` : '—'}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={item.status} />
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  {item.ebay_listing_url && (
                    <a
                      href={item.ebay_listing_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] bg-amber-900/40 text-amber-300 px-1.5 py-0.5 rounded"
                    >
                      eBay
                    </a>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <Link href={`/items/${item.id}`}>
                  <Button variant="ghost" size="sm" className="h-7 text-xs">
                    View
                  </Button>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardView({ items }: { items: SneakerItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Package className="w-12 h-12 text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground font-medium">No items found</p>
        <Link href="/items/new">
          <Button className="mt-4" size="sm">
            <Plus className="w-4 h-4 mr-2" />
            New Item
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {items.map((item) => (
        <Link key={item.id} href={`/items/${item.id}`} className="group">
          <div className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5">
            <div className="aspect-square bg-accent/30 relative">
              {item.hero_image_url ? (
                <img
                  src={item.hero_image_url}
                  alt={item.model || 'Sneaker'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-10 h-10 text-muted-foreground/30" />
                </div>
              )}
              <div className="absolute top-2 left-2">
                <span className="font-mono text-[10px] bg-background/80 backdrop-blur-sm text-primary px-1.5 py-0.5 rounded border border-border font-semibold">
                  {item.item_id}
                </span>
              </div>
              <div className="absolute top-2 right-2">
                <StatusBadge status={item.status} />
              </div>
            </div>
            <div className="p-3">
              <p className="text-xs font-semibold text-foreground truncate">
                {item.brand} {item.model}
                {!item.brand && !item.model && (
                  <span className="text-muted-foreground">Unknown Sneaker</span>
                )}
              </p>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                {item.nickname || item.style_code || 'No details yet'}
              </p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">
                  {item.size ? `Sz ${item.size}` : '—'}
                </span>
                <span className="text-sm font-bold text-foreground">
                  {item.list_price ? `$${item.list_price.toFixed(0)}` : '—'}
                </span>
              </div>
            </div>
          </div>
        </Link>
      ))}
      <Link href="/items/new" className="group">
        <div className="bg-card border border-dashed border-border rounded-xl aspect-square flex flex-col items-center justify-center hover:border-primary/40 hover:bg-accent/30 transition-all duration-200 cursor-pointer">
          <Plus className="w-8 h-8 text-muted-foreground/40 group-hover:text-primary transition-colors" />
          <p className="text-xs text-muted-foreground mt-2 group-hover:text-foreground transition-colors">
            New Item
          </p>
        </div>
      </Link>
    </div>
  );
}

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<SneakerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'table' | 'card'>('table');
  const [search, setSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState<ItemStatus | 'all'>(
    (searchParams.get('status') as ItemStatus) || 'all'
  );

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('sneaker_items')
      .select('*')
      .order('created_at', { ascending: false });
    setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = items.filter((item) => {
    const matchStatus = activeStatus === 'all' || item.status === activeStatus;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      item.item_id.toLowerCase().includes(q) ||
      (item.inventory_number || '').toLowerCase().includes(q) ||
      (item.brand || '').toLowerCase().includes(q) ||
      (item.model || '').toLowerCase().includes(q) ||
      (item.style_code || '').toLowerCase().includes(q) ||
      (item.nickname || '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const countByStatus = (s: ItemStatus) => items.filter((i) => i.status === s).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {items.length} item{items.length !== 1 ? 's' : ''} tracked
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Link href="/items/new">
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              New Item
            </Button>
          </Link>
        </div>
      </div>

      <StatsBar items={items} />

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by inventory #, brand, model, style code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setActiveStatus('all')}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              activeStatus === 'all'
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            All ({items.length})
          </button>
          {STATUS_ORDER.map((s) => {
            const count = countByStatus(s);
            if (count === 0) return null;
            return (
              <button
                key={s}
                onClick={() => setActiveStatus(s)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  activeStatus === s
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                {STATUS_LABELS[s]} ({count})
              </button>
            );
          })}
        </div>
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setView('table')}
            className={cn(
              'p-2 rounded-md transition-colors',
              view === 'table'
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView('card')}
            className={cn(
              'p-2 rounded-md transition-colors',
              view === 'card'
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : view === 'table' ? (
        <TableView items={filtered} />
      ) : (
        <CardView items={filtered} />
      )}
    </div>
  );
}
