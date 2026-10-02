'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ITEM_TYPE_LABELS, ItemType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function NewItemDetailsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    item_type: 'general_unknown' as ItemType,
    brand: '',
    model: '',
    product_name: '',
    notes: '',
  });

  async function handleCreate() {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('sneaker_items')
      .insert({
        item_type: form.item_type,
        brand: form.brand || null,
        model: form.model || null,
        product_name: form.product_name || null,
        notes: form.notes || null,
        status: 'draft',
      })
      .select()
      .single();

    if (err || !data) {
      console.error('item create failed:', err);
      setError('Could not create the item. Please try again.');
      setLoading(false);
      return;
    }

    router.push(`/items/${data.id}?tab=photos`);
  }

  return (
    <div className="max-w-xl">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/items/new')}
        className="mb-4 gap-1.5 text-muted-foreground"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to upload
      </Button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Manual Entry</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All fields optional — you can fill in details now and upload photos on the next screen.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="item_type">Item Category</Label>
          <Select value={form.item_type} onValueChange={(v) => setForm({ ...form, item_type: v as ItemType })}>
            <SelectTrigger id="item_type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ITEM_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">AI will auto-detect from photos — override here if you already know</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="brand">Brand</Label>
            <Input id="brand" placeholder="Nike, Apple, DeWalt..." value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="model">Model</Label>
            <Input id="model" placeholder="Model or series name..." value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="product_name">Product Name</Label>
          <Input id="product_name" placeholder="Full product name (optional)..." value={form.product_name}
            onChange={(e) => setForm({ ...form, product_name: e.target.value })} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" placeholder="Any notes about this item..." value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} className="resize-none" rows={3} />
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <Button onClick={handleCreate} disabled={loading} className="w-full">
          <Plus className="w-4 h-4 mr-2" />
          {loading ? 'Creating...' : 'Create Item & Add Photos'}
        </Button>
      </div>
    </div>
  );
}
