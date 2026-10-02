import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createUserClient } from '@/lib/supabase-server';
import {
  downloadFolderImages,
  parseSizeFromName,
  DriveConfigError,
} from '@/lib/google-drive';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest, { params }: { params: { folderId: string } }) {
  const userClient = createUserClient(req);
  if (!userClient) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const { folderId } = params;
  if (!folderId) {
    return NextResponse.json({ error: 'Folder ID is required.' }, { status: 400 });
  }

  let body: { analyze?: boolean; folderName?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body is optional
  }

  try {
    // 1. Check if this folder is already imported by this user
    const { data: existing } = await userClient
      .from('sneaker_items')
      .select('id')
      .eq('drive_folder_id', folderId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'This folder has already been imported.', itemId: existing.id },
        { status: 409 }
      );
    }

    // 2. Get the user's ID from their session
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Could not determine user identity.' }, { status: 401 });
    }

    // 3. Download all images from the Drive folder
    const images = await downloadFolderImages(folderId);

    // 4. Parse size from folder name if present
    const folderName = body.folderName || '';
    const size = parseSizeFromName(folderName);

    // 5. Parse inventory number from folder name
    const invMatch = folderName.match(/^\s*[nN][-_]?(\d{3})\b/i);
    const inventoryNumber = invMatch ? `n${invMatch[1]}` : null;

    // 6. Create the item — use service role client for the insert so we can
    //    set user_id explicitly (the userClient won't let us set user_id
    //    since WITH CHECK requires auth.uid() = user_id, and the default
    //    auth.uid() will fill it correctly, but we want to be explicit).
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: item, error: itemErr } = await adminClient
      .from('sneaker_items')
      .insert({
        status: 'needs_review',
        drive_folder_id: folderId,
        inventory_number: inventoryNumber,
        notes: folderName,
        size: size,
        user_id: userId,
      })
      .select()
      .single();

    if (itemErr || !item) {
      console.error('Drive import: item create failed:', itemErr);
      return NextResponse.json(
        { error: 'Could not create the item. Please try again.' },
        { status: 500 }
      );
    }

    // 7. Upload each image to storage and insert into sneaker_images
    let heroPublicUrl: string | null = null;

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const ext = img.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${item.id}/${Date.now()}-${i}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadErr } = await adminClient.storage
        .from('sneaker-images')
        .upload(path, img.buffer, {
          contentType: img.mimeType,
          upsert: false,
        });

      if (uploadErr) {
        console.error('Drive import: storage upload failed for', img.name, uploadErr);
        continue;
      }

      const { data: urlData } = adminClient.storage
        .from('sneaker-images')
        .getPublicUrl(path);

      const label = i === 0 ? 'hero' : img.label;

      const { error: dbErr } = await adminClient
        .from('sneaker_images')
        .insert({
          item_id: item.id,
          storage_path: path,
          public_url: urlData.publicUrl,
          label,
          sort_order: i,
          user_id: userId,
        });

      if (dbErr) {
        console.error('Drive import: image insert failed for', img.name, dbErr);
        continue;
      }

      if (i === 0) heroPublicUrl = urlData.publicUrl;
    }

    // 8. Set hero image URL on the item
    if (heroPublicUrl) {
      await adminClient
        .from('sneaker_items')
        .update({ hero_image_url: heroPublicUrl })
        .eq('id', item.id);
    }

    // 9. If analyze is requested, trigger the edge function pipeline
    if (body.analyze) {
      const token = req.headers.get('authorization')?.startsWith('Bearer ')
        ? req.headers.get('authorization')!.slice(7)
        : null;

      const edgeSlugs = ['detect-category', 'identify-sneaker', 'condition-sneaker', 'comps-sneaker', 'listings-sneaker'];
      const analysisErrors: string[] = [];

      for (const slug of edgeSlugs) {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/${slug}/${item.id}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          });
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            analysisErrors.push(`${slug}: ${d.error || res.status}`);
          }
        } catch (err) {
          analysisErrors.push(`${slug}: ${err instanceof Error ? err.message : 'network error'}`);
        }
      }

      if (analysisErrors.length > 0) {
        return NextResponse.json({
          itemId: item.id,
          inventoryNumber,
          photoCount: images.length,
          analysisErrors,
          warning: 'Item created with photos, but some analysis steps failed.',
        });
      }
    }

    return NextResponse.json({
      itemId: item.id,
      inventoryNumber,
      photoCount: images.length,
      analyzed: !!body.analyze,
    });
  } catch (err) {
    if (err instanceof DriveConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error('Drive import failed:', err);
    const message = err instanceof Error ? err.message : 'Import failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
