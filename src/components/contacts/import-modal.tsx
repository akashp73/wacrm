'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import type { Tag } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, Loader2, CheckCircle, XCircle, Plus, X } from 'lucide-react';

const DEFAULT_TAG_COLOR = '#3b82f6';

interface ComboTag {
  id?: string;
  name: string;
  color: string;
  isNew?: boolean;
}

// ─── Tag combobox: pick existing tags or type to create new ones ─────

function TagCombobox({
  availableTags,
  selected,
  onChange,
}: {
  availableTags: Tag[];
  selected: ComboTag[];
  onChange: (tags: ComboTag[]) => void;
}) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);

  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  const matches = availableTags.filter(
    (t) => t.name.toLowerCase().includes(lower) && !selected.some((s) => s.id === t.id),
  );
  const exactMatch =
    availableTags.some((t) => t.name.toLowerCase() === lower) ||
    selected.some((s) => s.name.toLowerCase() === lower);

  function addExisting(tag: Tag) {
    onChange([...selected, { id: tag.id, name: tag.name, color: tag.color }]);
    setInput('');
  }

  function addNew() {
    if (!trimmed || exactMatch) return;
    onChange([...selected, { name: trimmed, color: DEFAULT_TAG_COLOR, isNew: true }]);
    setInput('');
  }

  function remove(idx: number) {
    onChange(selected.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((tag, i) => (
            <span
              key={`${tag.id ?? 'new'}-${tag.name}-${i}`}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: tag.color + '20', color: tag.color }}
            >
              {tag.name}
              {tag.isNew && <span className="opacity-60">(new)</span>}
              <button type="button" onClick={() => remove(i)} className="hover:opacity-70">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (matches.length > 0) addExisting(matches[0]);
              else addNew();
            }
          }}
          placeholder="Search or create a tag..."
          className="bg-card border-border text-foreground placeholder:text-muted-foreground"
        />

        {open && (matches.length > 0 || (trimmed && !exactMatch)) && (
          <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-md ring-1 ring-foreground/10">
            {matches.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addExisting(tag)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground/70 hover:bg-muted transition-colors"
              >
                <span className="inline-block size-2 rounded-full" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </button>
            ))}
            {trimmed && !exactMatch && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={addNew}
                className="flex w-full items-center gap-2 border-t border-border/50 px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
              >
                <Plus className="size-3.5" />
                Create tag: &quot;{trimmed}&quot;
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

interface ParsedRow {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = headerLine.split(',').map((h) => h.trim().toLowerCase().replace(/["']/g, ''));

  const phoneIdx = headers.indexOf('phone');
  if (phoneIdx === -1) return [];

  const nameIdx = headers.indexOf('name');
  const emailIdx = headers.indexOf('email');
  const companyIdx = headers.indexOf('company');

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV parse (handles quoted fields)
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const phone = values[phoneIdx]?.replace(/["']/g, '').trim();
    if (!phone) continue;

    rows.push({
      phone,
      name: nameIdx >= 0 ? values[nameIdx]?.replace(/["']/g, '').trim() || undefined : undefined,
      email: emailIdx >= 0 ? values[emailIdx]?.replace(/["']/g, '').trim() || undefined : undefined,
      company:
        companyIdx >= 0 ? values[companyIdx]?.replace(/["']/g, '').trim() || undefined : undefined,
    });
  }

  return rows;
}

export function ImportModal({ open, onOpenChange, onImported }: ImportModalProps) {
  const supabase = createClient();
  const { ownerId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; failed: number } | null>(null);

  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<ComboTag[]>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase.from('tags').select('*').order('name');
      if (data) setAvailableTags(data);
    })();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function reset() {
    setFile(null);
    setParsedRows([]);
    setResult(null);
    setSelectedTags([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleOpenChange(open: boolean) {
    if (!open) reset();
    onOpenChange(open);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setResult(null);

    const text = await selected.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      toast.error('No valid rows found. Ensure CSV has a "phone" column header.');
      setParsedRows([]);
      return;
    }

    setParsedRows(rows);
  }

  async function handleImport() {
    if (parsedRows.length === 0) return;
    setImporting(true);

    try {
      if (!ownerId) throw new Error('Not authenticated');

      // Create any newly-typed tags first so we have ids to assign
      const tagIds: string[] = [];
      for (const t of selectedTags) {
        if (t.id) {
          tagIds.push(t.id);
          continue;
        }
        const { data: created, error: tagErr } = await supabase
          .from('tags')
          .insert({ user_id: ownerId, name: t.name, color: t.color })
          .select('id')
          .single();
        if (tagErr || !created) throw tagErr ?? new Error(`Failed to create tag "${t.name}"`);
        tagIds.push(created.id);
      }

      let imported = 0;
      let failed = 0;
      const importedIds: string[] = [];

      // Batch insert in chunks of 50
      const chunkSize = 50;
      for (let i = 0; i < parsedRows.length; i += chunkSize) {
        const chunk = parsedRows.slice(i, i + chunkSize);
        const rows = chunk.map((row) => ({
          user_id: ownerId,
          phone: row.phone,
          name: row.name || null,
          email: row.email || null,
          company: row.company || null,
        }));

        const { data, error } = await supabase
          .from('contacts')
          .insert(rows)
          .select('id');

        if (error) {
          // Try individual inserts for this chunk
          for (const row of rows) {
            const { data: single, error: singleErr } = await supabase
              .from('contacts')
              .insert(row)
              .select('id')
              .single();
            if (singleErr || !single) {
              failed++;
            } else {
              imported++;
              importedIds.push(single.id);
            }
          }
        } else {
          imported += data?.length ?? chunk.length;
          (data ?? []).forEach((c) => importedIds.push(c.id));
        }
      }

      // Assign the selected tags to every contact that was imported
      if (tagIds.length > 0 && importedIds.length > 0) {
        const tagRows = importedIds.flatMap((contactId) =>
          tagIds.map((tagId) => ({ contact_id: contactId, tag_id: tagId })),
        );
        const tagChunkSize = 200;
        for (let i = 0; i < tagRows.length; i += tagChunkSize) {
          await supabase.from('contact_tags').insert(tagRows.slice(i, i + tagChunkSize));
        }
      }

      setResult({ imported, failed });
      if (imported > 0) {
        toast.success(`${imported} contact${imported !== 1 ? 's' : ''} imported`);
        onImported();
      }
      if (failed > 0) {
        toast.error(`${failed} contact${failed !== 1 ? 's' : ''} failed to import`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Import failed';
      toast.error(message);
    } finally {
      setImporting(false);
    }
  }

  const preview = parsedRows.slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-card border-border text-foreground sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">Import Contacts</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Upload a CSV file with a &quot;phone&quot; column (required). Optional columns:
            name, email, company.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 cursor-pointer hover:border-foreground/50 transition-colors"
          >
            {file ? (
              <>
                <FileText className="size-8 text-foreground" />
                <p className="text-sm text-foreground/70">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} detected
                </p>
              </>
            ) : (
              <>
                <Upload className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Click to upload CSV file
                </p>
                <p className="text-xs text-muted-foreground">
                  CSV with &quot;phone&quot; column required
                </p>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Tag assignment */}
          {parsedRows.length > 0 && !result && (
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Tags (optional)
              </Label>
              <p className="text-xs text-muted-foreground">
                Select existing tags or type a new name to create one — applied to every imported contact.
              </p>
              <TagCombobox
                availableTags={availableTags}
                selected={selectedTags}
                onChange={setSelectedTags}
              />
            </div>
          )}

          {/* Preview table */}
          {preview.length > 0 && !result && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase dark:text-muted-foreground tracking-wider">
                Preview (first {preview.length} rows)
              </p>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted">
                      <th className="px-3 py-1.5 text-left text-muted-foreground font-medium">Phone</th>
                      <th className="px-3 py-1.5 text-left text-muted-foreground font-medium">Name</th>
                      <th className="px-3 py-1.5 text-left text-muted-foreground font-medium">Email</th>
                      <th className="px-3 py-1.5 text-left text-muted-foreground font-medium">Company</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-t border-border/50">
                        <td className="px-3 py-1.5 text-foreground/70">{row.phone}</td>
                        <td className="px-3 py-1.5 text-foreground/70">{row.name || '-'}</td>
                        <td className="px-3 py-1.5 text-foreground/70">{row.email || '-'}</td>
                        <td className="px-3 py-1.5 text-foreground/70">{row.company || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedRows.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  ...and {parsedRows.length - 5} more rows
                </p>
              )}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="rounded-lg border border-border p-4 space-y-2">
              <p className="text-sm font-medium text-foreground">Import Complete</p>
              <div className="flex items-center gap-4">
                {result.imported > 0 && (
                  <div className="flex items-center gap-1.5 text-foreground text-sm">
                    <CheckCircle className="size-4" />
                    {result.imported} imported
                  </div>
                )}
                {result.failed > 0 && (
                  <div className="flex items-center gap-1.5 text-red-400 text-sm">
                    <XCircle className="size-4" />
                    {result.failed} failed
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="bg-card border-border">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="border-border text-foreground/70 hover:bg-muted"
          >
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button
              type="button"
              disabled={parsedRows.length === 0 || importing}
              onClick={handleImport}
              className="bg-foreground hover:bg-foreground/90 text-background"
            >
              {importing && <Loader2 className="size-4 animate-spin" />}
              Import {parsedRows.length > 0 ? `${parsedRows.length} Contacts` : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
