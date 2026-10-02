import { NextRequest, NextResponse } from 'next/server';
import { createUserClient } from '@/lib/supabase-server';
import { listInventoryFolders, DriveConfigError } from '@/lib/google-drive';

export async function GET(req: NextRequest) {
  const supabase = createUserClient(req);
  if (!supabase) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  try {
    const folders = await listInventoryFolders();

    // Check which folders are already imported
    const folderIds = folders.map((f) => f.id);
    const { data: existing } = await supabase
      .from('sneaker_items')
      .select('id, drive_folder_id, inventory_number, status')
      .in('drive_folder_id', folderIds);

    const importedMap = new Map<string, { itemId: string; status: string }>();
    for (const row of existing || []) {
      if (row.drive_folder_id) {
        importedMap.set(row.drive_folder_id, { itemId: row.id, status: row.status });
      }
    }

    const result = folders.map((f) => ({
      ...f,
      imported: importedMap.has(f.id),
      itemId: importedMap.get(f.id)?.itemId || null,
      itemStatus: importedMap.get(f.id)?.status || null,
    }));

    return NextResponse.json({ folders: result });
  } catch (err) {
    if (err instanceof DriveConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error('Drive folder list failed:', err);
    return NextResponse.json(
      { error: 'Could not connect to Google Drive. Check service account permissions.' },
      { status: 500 }
    );
  }
}
