'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Loader2, ArrowRight, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function NewItemPage() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    setUploading(true);
    setError('');

    try {
      // 1. Create a bare item record — no manual info needed
      const { data: item, error: itemErr } = await supabase
        .from('sneaker_items')
        .insert({ status: 'needs_photos' })
        .select()
        .single();

      if (itemErr || !item) {
        const detail = itemErr?.message || 'Unknown error';
        throw new Error(`Could not create the item: ${detail}`);
      }

      // 2. Upload each photo to storage + record in DB
      let heroPublicUrl: string | null = null;

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const ext = file.name.split('.').pop();
        const path = `${item.id}/${Date.now()}-${i}-${Math.random().toString(36).slice(2)}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from('sneaker-images')
          .upload(path, file, { upsert: false });

        if (uploadErr) throw new Error(`Photo upload failed: ${uploadErr.message}`);

        const { data: urlData } = supabase.storage
          .from('sneaker-images')
          .getPublicUrl(path);

        const { error: dbErr } = await supabase
          .from('sneaker_images')
          .insert({
            item_id: item.id,
            storage_path: path,
            public_url: urlData.publicUrl,
            label: i === 0 ? 'hero' : 'other',
            sort_order: i,
          });

        if (dbErr) throw new Error(`Photo record failed: ${dbErr.message}`);

        if (i === 0) heroPublicUrl = urlData.publicUrl;
      }

      // 3. Set hero image + flip status so the AI pipeline can run
      if (heroPublicUrl) {
        await supabase
          .from('sneaker_items')
          .update({ hero_image_url: heroPublicUrl, status: 'needs_review' })
          .eq('id', item.id);
      }

      // 4. Go straight to the item detail page
      router.push(`/items/${item.id}`);
    } catch (err) {
      console.error('Quick upload failed:', err);
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setUploading(false);
    }
  }, [router]);

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Add New Item</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload photos and the AI will identify everything for you. No typing needed.
        </p>
      </div>

      {error && (
        <div className="mb-4 bg-destructive/10 border border-destructive/20 rounded-xl p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Drop zone — the only thing on the page */}
      <div
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200',
          uploading && 'pointer-events-none opacity-80',
          dragOver
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-border hover:border-primary/50 hover:bg-accent/30'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">Creating item and uploading photos...</p>
            <p className="text-xs text-muted-foreground">This only takes a moment</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">
                Drop photos here or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                JPG, PNG, WEBP — multiple files at once
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
              <ArrowRight className="w-3 h-3" />
              Item is created automatically, then AI takes over
            </div>
          </div>
        )}
      </div>

      {/* Secondary option for manual entry */}
      <div className="mt-4 flex items-center justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/items/new/details')}
          className="text-muted-foreground gap-1.5"
        >
          <Package className="w-3.5 h-3.5" />
          Or enter details manually first
        </Button>
      </div>
    </div>
  );
}
