'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, FolderDown, Zap, CheckCircle2, ExternalLink, AlertCircle, Loader2, CloudDownload } from 'lucide-react';
import { supabase, getAuthToken } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface DriveFolder {
  id: string;
  name: string;
  inventoryNumber: string;
  photoCount: number;
  thumbnailUrl: string | null;
  imported: boolean;
  itemId: string | null;
  itemStatus: string | null;
}

type RowStatus = 'idle' | 'importing' | 'analyzing' | 'done' | 'error';

export default function ImportPage() {
  const router = useRouter();
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});
  const [rowMessage, setRowMessage] = useState<Record<string, string>>({});
  const [importingAll, setImportingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/import/drive', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not load Drive folders.');
        setFolders([]);
      } else {
        setFolders(data.folders || []);
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function importFolder(folder: DriveFolder, analyze: boolean) {
    setRowStatus((s) => ({ ...s, [folder.id]: analyze ? 'analyzing' : 'importing' }));
    setRowMessage((s) => ({ ...s, [folder.id]: '' }));

    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/import/drive/${folder.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ analyze, folderName: folder.name }),
      });
      const data = await res.json();

      if (res.status === 409) {
        setRowStatus((s) => ({ ...s, [folder.id]: 'error' }));
        setRowMessage((s) => ({ ...s, [folder.id]: 'Already imported' }));
        return;
      }

      if (!res.ok) {
        setRowStatus((s) => ({ ...s, [folder.id]: 'error' }));
        setRowMessage((s) => ({ ...s, [folder.id]: data.error || 'Import failed' }));
        return;
      }

      setRowStatus((s) => ({ ...s, [folder.id]: 'done' }));
      const msg = data.analyzed
        ? `Imported + analyzed (${data.photoCount} photos)`
        : data.analysisErrors
        ? `Imported with ${data.photoCount} photos. Some analysis failed.`
        : `Imported (${data.photoCount} photos)`;
      setRowMessage((s) => ({ ...s, [folder.id]: msg }));

      // Update folder list to mark as imported
      setFolders((prev) =>
        prev.map((f) =>
          f.id === folder.id
            ? { ...f, imported: true, itemId: data.itemId, itemStatus: 'needs_review' }
            : f
        )
      );
    } catch {
      setRowStatus((s) => ({ ...s, [folder.id]: 'error' }));
      setRowMessage((s) => ({ ...s, [folder.id]: 'Network error' }));
    }
  }

  async function importAllNew() {
    setImportingAll(true);
    const newFolders = folders.filter((f) => !f.imported && rowStatus[f.id] !== 'done');
    for (const folder of newFolders) {
      await importFolder(folder, true);
    }
    setImportingAll(false);
  }

  const newCount = folders.filter((f) => !f.imported).length;
  const importedCount = folders.length - newCount;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Import from Google Drive</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {folders.length > 0
              ? `${newCount} new folder${newCount !== 1 ? 's' : ''} ready · ${importedCount} already imported`
              : 'Connect your Drive to import inventory photos'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
          {newCount > 0 && (
            <Button size="sm" onClick={importAllNew} disabled={importingAll || loading}>
              {importingAll ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CloudDownload className="w-4 h-4 mr-2" />
              )}
              Import All New ({newCount})
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-300">Could not connect to Drive</p>
            <p className="text-xs text-amber-400/80 mt-1">{error}</p>
            <p className="text-xs text-amber-400/60 mt-2">
              Make sure GOOGLE_SERVICE_ACCOUNT_JSON and DRIVE_ACTIVE_FOLDER_ID are set as
              environment variables, and that the service account has access to the folder.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : folders.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderDown className="w-12 h-12 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground font-medium">No inventory folders found</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Folders must start with an inventory number (e.g. n070, N-001)
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {folders.map((folder) => {
            const status = rowStatus[folder.id] || 'idle';
            const msg = rowMessage[folder.id] || '';
            const isWorking = status === 'importing' || status === 'analyzing';

            return (
              <div
                key={folder.id}
                className={cn(
                  'bg-card border rounded-xl p-4 flex items-center gap-4 transition-colors',
                  folder.imported || status === 'done'
                    ? 'border-emerald-700/30'
                    : isWorking
                    ? 'border-primary/40'
                    : 'border-border'
                )}
              >
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-lg overflow-hidden border border-border bg-secondary/50 shrink-0 flex items-center justify-center">
                  {folder.thumbnailUrl ? (
                    <img src={folder.thumbnailUrl} alt={folder.name} className="w-full h-full object-cover" />
                  ) : (
                    <FolderDown className="w-6 h-6 text-muted-foreground/40" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      {folder.inventoryNumber}
                    </span>
                    <p className="text-sm font-medium text-foreground truncate">{folder.name}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">{folder.photoCount} photos</span>
                    {folder.imported || status === 'done' ? (
                      <span className="text-xs text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Imported
                      </span>
                    ) : (
                      <span className="text-xs text-blue-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> New
                      </span>
                    )}
                  </div>
                  {msg && (
                    <p
                      className={cn(
                        'text-xs mt-1',
                        status === 'error' ? 'text-destructive' : status === 'done' ? 'text-emerald-400' : 'text-muted-foreground'
                      )}
                    >
                      {msg}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {isWorking ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-xs">{status === 'analyzing' ? 'Analyzing...' : 'Importing...'}</span>
                    </div>
                  ) : folder.imported || status === 'done' ? (
                    folder.itemId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/items/${folder.itemId}`)}
                        className="gap-1.5"
                      >
                        View Item <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    )
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => importFolder(folder, false)}
                        disabled={importingAll}
                        className="gap-1.5"
                      >
                        <FolderDown className="w-3.5 h-3.5" /> Import
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => importFolder(folder, true)}
                        disabled={importingAll}
                        className="gap-1.5"
                      >
                        <Zap className="w-3.5 h-3.5" /> Import &amp; Analyze
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
