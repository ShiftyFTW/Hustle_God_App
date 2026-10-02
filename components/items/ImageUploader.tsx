'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Loader2, Tag } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ImageLabel, IMAGE_LABELS, SneakerImage } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  itemId: string;
  images: SneakerImage[];
  onImagesChange: (images: SneakerImage[]) => void;
}

const LABEL_COLORS: Record<ImageLabel, string> = {
  hero: 'bg-blue-900/50 text-blue-300',
  side: 'bg-cyan-900/50 text-cyan-300',
  back: 'bg-violet-900/50 text-violet-300',
  outsole: 'bg-amber-900/50 text-amber-300',
  size_tag: 'bg-green-900/50 text-green-300',
  box_label: 'bg-teal-900/50 text-teal-300',
  flaw: 'bg-red-900/50 text-red-300',
  insole: 'bg-orange-900/50 text-orange-300',
  other: 'bg-zinc-700 text-zinc-300',
};

export default function ImageUploader({ itemId, images, onImagesChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File, label: ImageLabel = 'other') => {
      const ext = file.name.split('.').pop();
      const path = `${itemId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('sneaker-images')
        .upload(path, file, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('sneaker-images')
        .getPublicUrl(path);

      const { data: imgData, error: dbError } = await supabase
        .from('sneaker_images')
        .insert({
          item_id: itemId,
          storage_path: path,
          public_url: urlData.publicUrl,
          label,
          sort_order: images.length,
        })
        .select()
        .single();

      if (dbError) throw dbError;
      return imgData as SneakerImage;
    },
    [itemId, images.length]
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      const newImages: SneakerImage[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const img = await uploadFile(file, 'other');
        newImages.push(img);
      }
      onImagesChange([...images, ...newImages]);
      // Set hero if first image
      if (images.length === 0 && newImages.length > 0) {
        await supabase
          .from('sneaker_images')
          .update({ label: 'hero' })
          .eq('id', newImages[0].id);
        await supabase
          .from('sneaker_items')
          .update({ hero_image_url: newImages[0].public_url, status: 'needs_review' })
          .eq('id', itemId);
      }
      setUploading(false);
    },
    [images, itemId, onImagesChange, uploadFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleLabelChange = useCallback(
    async (imageId: string, label: ImageLabel) => {
      await supabase.from('sneaker_images').update({ label }).eq('id', imageId);
      const updated = images.map((img) => (img.id === imageId ? { ...img, label } : img));
      onImagesChange(updated);
      // Update hero_image_url if setting as hero
      if (label === 'hero') {
        const img = images.find((i) => i.id === imageId);
        if (img) {
          await supabase
            .from('sneaker_items')
            .update({ hero_image_url: img.public_url })
            .eq('id', itemId);
        }
      }
    },
    [images, itemId, onImagesChange]
  );

  const handleDelete = useCallback(
    async (image: SneakerImage) => {
      await supabase.storage.from('sneaker-images').remove([image.storage_path]);
      await supabase.from('sneaker_images').delete().eq('id', image.id);
      const updated = images.filter((i) => i.id !== image.id);
      onImagesChange(updated);
    },
    [images, onImagesChange]
  );

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
          dragOver
            ? 'border-primary bg-primary/5'
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
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Uploading photos...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">
              Drop photos here or click to upload
            </p>
            <p className="text-xs text-muted-foreground">
              JPG, PNG, WEBP — multiple files supported
            </p>
          </div>
        )}
      </div>

      {/* Photo grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {images.map((img) => (
            <div key={img.id} className="group relative">
              <div className="aspect-square rounded-lg overflow-hidden border border-border bg-card">
                <img
                  src={img.public_url}
                  alt={img.label}
                  className="w-full h-full object-cover"
                />
              </div>
              {/* Label badge */}
              <div className="mt-1.5">
                <Select
                  value={img.label}
                  onValueChange={(v) => handleLabelChange(img.id, v as ImageLabel)}
                >
                  <SelectTrigger className="h-6 text-[10px] px-1.5 py-0">
                    <span className={cn('px-1 py-0.5 rounded text-[10px] font-medium', LABEL_COLORS[img.label])}>
                      {IMAGE_LABELS[img.label]}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(IMAGE_LABELS) as [ImageLabel, string][]).map(([v, l]) => (
                      <SelectItem key={v} value={v} className="text-xs">
                        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium mr-2', LABEL_COLORS[v])}>
                          {l}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Delete button */}
              <button
                onClick={() => handleDelete(img)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {images.length > 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Tag className="w-3 h-3" />
          {images.length} photo{images.length !== 1 ? 's' : ''} uploaded — label each for best AI results
        </p>
      )}
    </div>
  );
}
