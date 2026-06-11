'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Contact, Tag, ContactTag } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Search,
  Plus,
  Upload,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Users,
  ChevronLeft,
  ChevronRight,
  X,
  Tag as TagIcon,
  TagsIcon,
} from 'lucide-react';
import { ContactForm } from '@/components/contacts/contact-form';
import { ContactDetailView } from '@/components/contacts/contact-detail-view';
import { ImportModal } from '@/components/contacts/import-modal';

const PAGE_SIZE = 25;

interface ContactWithTags extends Contact {
  tags?: Tag[];
}

export default function ContactsPage() {
  const supabase = createClient();

  const [contacts, setContacts] = useState<ContactWithTags[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // True when the user clicked "Select all N contacts" (across all pages)
  const [selectingAll, setSelectingAll] = useState(false);

  // Tag filter (multi-select) — shows contacts matching ANY selected tag
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  // "No tag added" filter — shows contacts with zero tags. Mutually
  // exclusive with selectedTagIds (the two modes don't compose).
  const [noTagFilter, setNoTagFilter] = useState(false);

  // Delete by tag
  const [deleteByTagOpen, setDeleteByTagOpen] = useState(false);
  const [deleteByTagId, setDeleteByTagId] = useState<string>('');
  const [deleteByTagCount, setDeleteByTagCount] = useState<number | null>(null);
  const [deleteByTagCounting, setDeleteByTagCounting] = useState(false);
  const [deleteByTagDeleting, setDeleteByTagDeleting] = useState(false);

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editContactTags, setEditContactTags] = useState<ContactTag[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailContactId, setDetailContactId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Single delete
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk delete
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState<{ done: number; total: number } | null>(null);

  // Tags map for display
  const [tagsMap, setTagsMap] = useState<Record<string, Tag>>({});

  // ── Derived selection state ───────────────────────────────────────
  const allPageSelected =
    contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id));
  const somePageSelected =
    !allPageSelected && contacts.some((c) => selectedIds.has(c.id));
  const selectionCount = selectingAll ? totalCount : selectedIds.size;

  // ── Data fetching ─────────────────────────────────────────────────
  const fetchTags = useCallback(async () => {
    const { data } = await supabase.from('tags').select('*');
    if (data) {
      const map: Record<string, Tag> = {};
      data.forEach((t) => (map[t.id] = t));
      setTagsMap(map);
    }
  }, [supabase]);

  const fetchContacts = useCallback(async () => {
    setLoading(true);

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // When tags are selected, first resolve which contacts carry any of them
    let tagMatchIds: string[] | null = null;
    if (selectedTagIds.size > 0) {
      const { data: ctRows } = await supabase
        .from('contact_tags')
        .select('contact_id')
        .in('tag_id', Array.from(selectedTagIds));
      tagMatchIds = Array.from(new Set((ctRows ?? []).map((r) => r.contact_id)));
      if (tagMatchIds.length === 0) {
        setContacts([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }
    }

    // "No tag added" — exclude any contact that carries at least one tag
    let untaggedExcludeIds: string[] | null = null;
    if (noTagFilter) {
      const { data: ctRows } = await supabase.from('contact_tags').select('contact_id');
      untaggedExcludeIds = Array.from(new Set((ctRows ?? []).map((r) => r.contact_id)));
    }

    let query = supabase
      .from('contacts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (tagMatchIds) {
      query = query.in('id', tagMatchIds);
    }
    if (untaggedExcludeIds && untaggedExcludeIds.length > 0) {
      query = query.not('id', 'in', `(${untaggedExcludeIds.join(',')})`);
    }

    if (search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`name.ilike.${term},phone.ilike.${term},email.ilike.${term}`);
    }

    const { data, count, error } = await query;

    if (error) {
      toast.error('Failed to load contacts');
      setLoading(false);
      return;
    }

    setTotalCount(count ?? 0);

    if (!data || data.length === 0) {
      setContacts([]);
      setLoading(false);
      return;
    }

    const contactIds = data.map((c) => c.id);
    const { data: contactTags } = await supabase
      .from('contact_tags')
      .select('contact_id, tag_id')
      .in('contact_id', contactIds);

    const tagsByContact: Record<string, string[]> = {};
    contactTags?.forEach((ct) => {
      if (!tagsByContact[ct.contact_id]) tagsByContact[ct.contact_id] = [];
      tagsByContact[ct.contact_id].push(ct.tag_id);
    });

    const enriched: ContactWithTags[] = data.map((c) => ({
      ...c,
      tags: (tagsByContact[c.id] ?? []).map((tid) => tagsMap[tid]).filter(Boolean),
    }));

    setContacts(enriched);
    setLoading(false);
  }, [supabase, page, search, selectedTagIds, noTagFilter, tagsMap]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Clear selection when page, search, or tag filter changes
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectingAll(false);
  }, [page, search, selectedTagIds, noTagFilter]);

  // Reset to page 0 when the tag filter changes
  useEffect(() => {
    setPage(0);
  }, [selectedTagIds, noTagFilter]);

  function toggleTagFilter(tagId: string) {
    setNoTagFilter(false);
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  function toggleNoTagFilter() {
    setSelectedTagIds(new Set());
    setNoTagFilter((prev) => !prev);
  }

  const allTags = Object.values(tagsMap).sort((a, b) => a.name.localeCompare(b.name));

  // ── Selection handlers ────────────────────────────────────────────
  function toggleOne(id: string, e: React.MouseEvent | React.ChangeEvent) {
    e.stopPropagation();
    setSelectingAll(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllPage(e: React.ChangeEvent<HTMLInputElement>) {
    e.stopPropagation();
    setSelectingAll(false);
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        contacts.forEach((c) => next.delete(c.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        contacts.forEach((c) => next.add(c.id));
        return next;
      });
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setSelectingAll(false);
  }

  // ── CRUD handlers ─────────────────────────────────────────────────
  function openAddForm() {
    setEditContact(null);
    setEditContactTags([]);
    setFormOpen(true);
  }

  async function openEditForm(contact: Contact) {
    const { data } = await supabase
      .from('contact_tags')
      .select('*')
      .eq('contact_id', contact.id);
    setEditContact(contact);
    setEditContactTags(data ?? []);
    setFormOpen(true);
  }

  function openDetail(contactId: string) {
    setDetailContactId(contactId);
    setDetailOpen(true);
  }

  function confirmDelete(contact: Contact) {
    setDeleteTarget(contact);
    setDeleteConfirmOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('contacts').delete().eq('id', deleteTarget.id);
    if (error) {
      toast.error('Failed to delete contact');
    } else {
      toast.success('Contact deleted');
      fetchContacts();
    }
    setDeleting(false);
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  }

  // Deleting tens of thousands of contacts in one DELETE statement
  // cascades to their conversations/messages and reliably hits
  // Supabase's statement timeout, which surfaced to users as a generic
  // "Failed to delete contacts" error. Batching keeps each request small
  // enough to complete well within the timeout.
  const BULK_DELETE_BATCH = 500;

  async function deleteIdsInBatches(ids: string[], total: number, doneSoFar = 0) {
    let done = doneSoFar;
    for (let i = 0; i < ids.length; i += BULK_DELETE_BATCH) {
      const chunk = ids.slice(i, i + BULK_DELETE_BATCH);
      const { error } = await supabase.from('contacts').delete().in('id', chunk);
      if (error) throw error;
      done += chunk.length;
      setBulkDeleteProgress({ done, total });
    }
    return done;
  }

  async function handleBulkDelete() {
    setBulkDeleting(true);
    setBulkDeleteProgress({ done: 0, total: selectionCount });
    try {
      let totalDeleted = 0;

      if (selectingAll) {
        if (selectedTagIds.size > 0) {
          const { data: ctRows, error: ctError } = await supabase
            .from('contact_tags')
            .select('contact_id')
            .in('tag_id', Array.from(selectedTagIds));
          if (ctError) throw ctError;
          const tagMatchIds = Array.from(new Set((ctRows ?? []).map((r) => r.contact_id)));
          totalDeleted = await deleteIdsInBatches(tagMatchIds, tagMatchIds.length);
        } else {
          // Page through contacts matching the current search/no-tag
          // filter, deleting each batch as we go, until none remain.
          let taggedIds: string[] = [];
          if (noTagFilter) {
            const { data: ctRows, error: ctError } = await supabase.from('contact_tags').select('contact_id');
            if (ctError) throw ctError;
            taggedIds = Array.from(new Set((ctRows ?? []).map((r) => r.contact_id)));
          }
          const total = selectionCount;
          while (true) {
            let selectQuery = supabase.from('contacts').select('id').limit(BULK_DELETE_BATCH);
            if (search.trim()) {
              const term = `%${search.trim()}%`;
              selectQuery = selectQuery.or(`name.ilike.${term},phone.ilike.${term},email.ilike.${term}`);
            }
            if (taggedIds.length > 0) {
              selectQuery = selectQuery.not('id', 'in', `(${taggedIds.join(',')})`);
            }
            const { data: rows, error: selError } = await selectQuery;
            if (selError) throw selError;
            if (!rows || rows.length === 0) break;
            const ids = rows.map((r) => r.id);
            totalDeleted = await deleteIdsInBatches(ids, total, totalDeleted);
          }
        }
      } else {
        const ids = Array.from(selectedIds);
        totalDeleted = await deleteIdsInBatches(ids, ids.length);
      }

      toast.success(`${totalDeleted} contact${totalDeleted !== 1 ? 's' : ''} deleted`);
      setSelectedIds(new Set());
      setSelectingAll(false);
      setBulkDeleteOpen(false);
      setPage(0);
      fetchContacts();
    } catch (err) {
      console.error('Bulk delete failed:', err);
      toast.error(
        err instanceof Error ? `Failed to delete contacts: ${err.message}` : 'Failed to delete contacts'
      );
    } finally {
      setBulkDeleting(false);
      setBulkDeleteProgress(null);
    }
  }

  // ── Delete by tag ─────────────────────────────────────────────────
  function openDeleteByTag() {
    setDeleteByTagId('');
    setDeleteByTagCount(null);
    setDeleteByTagOpen(true);
  }

  async function handleDeleteByTagPick(tagId: string) {
    setDeleteByTagId(tagId);
    setDeleteByTagCount(null);
    setDeleteByTagCounting(true);
    const { count } = await supabase
      .from('contact_tags')
      .select('contact_id', { count: 'exact', head: true })
      .eq('tag_id', tagId);
    setDeleteByTagCount(count ?? 0);
    setDeleteByTagCounting(false);
  }

  async function handleDeleteByTag() {
    if (!deleteByTagId) return;
    setDeleteByTagDeleting(true);
    try {
      const { data: ctRows, error: ctError } = await supabase
        .from('contact_tags')
        .select('contact_id')
        .eq('tag_id', deleteByTagId);
      if (ctError) throw ctError;

      const ids = Array.from(new Set((ctRows ?? []).map((r) => r.contact_id)));
      if (ids.length > 0) {
        const { error } = await supabase.from('contacts').delete().in('id', ids);
        if (error) throw error;
      }

      toast.success(`${ids.length} contact${ids.length !== 1 ? 's' : ''} deleted`);
      setDeleteByTagOpen(false);
      setDeleteByTagId('');
      setDeleteByTagCount(null);
      clearSelection();
      setPage(0);
      fetchContacts();
    } catch {
      toast.error('Failed to delete contacts');
    } finally {
      setDeleteByTagDeleting(false);
    }
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNext = page < totalPages - 1;
  const hasPrev = page > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contacts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your contact list.{' '}
            {totalCount > 0 && `${totalCount} total contacts.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={openDeleteByTag}
            disabled={allTags.length === 0}
            className="border-border text-foreground/70 hover:bg-muted"
          >
            <TagsIcon className="size-4" />
            Delete by Tag
          </Button>
          <Button
            variant="outline"
            onClick={() => setImportOpen(true)}
            className="border-border text-foreground/70 hover:bg-muted"
          >
            <Upload className="size-4" />
            Import
          </Button>
          <Button
            onClick={openAddForm}
            className="bg-foreground hover:bg-foreground/90 text-background"
          >
            <Plus className="size-4" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Search + tag filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search by name, phone, or email..."
            className="pl-8 bg-card border-border text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                className="border-border text-foreground/70 hover:bg-muted"
              />
            }
          >
            <TagIcon className="size-4" />
            Filter by tag
            {(selectedTagIds.size > 0 || noTagFilter) && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-foreground text-background text-[10px] font-medium size-4">
                {noTagFilter ? 1 : selectedTagIds.size}
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="bg-card border-border min-w-48">
            <DropdownMenuCheckboxItem
              checked={noTagFilter}
              closeOnClick={false}
              onCheckedChange={toggleNoTagFilter}
              className="text-foreground/70 focus:bg-muted focus:text-foreground"
            >
              <span className="inline-block size-2 rounded-full border border-muted-foreground" />
              No tag added
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator className="bg-muted" />
            {allTags.length === 0 ? (
              <DropdownMenuLabel>No tags yet</DropdownMenuLabel>
            ) : (
              allTags.map((tag) => (
                <DropdownMenuCheckboxItem
                  key={tag.id}
                  checked={selectedTagIds.has(tag.id)}
                  closeOnClick={false}
                  onCheckedChange={() => toggleTagFilter(tag.id)}
                  className="text-foreground/70 focus:bg-muted focus:text-foreground"
                >
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </DropdownMenuCheckboxItem>
              ))
            )}
            {(selectedTagIds.size > 0 || noTagFilter) && (
              <>
                <DropdownMenuSeparator className="bg-muted" />
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedTagIds(new Set());
                    setNoTagFilter(false);
                  }}
                  className="text-foreground/70 focus:bg-muted focus:text-foreground"
                >
                  <X className="size-4" />
                  Clear filter
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {(selectedTagIds.size > 0 || noTagFilter) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {noTagFilter && (
              <button
                onClick={toggleNoTagFilter}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground/70 transition-opacity hover:opacity-70"
              >
                No tag added
                <X className="size-3" />
              </button>
            )}
            {Array.from(selectedTagIds).map((tagId) => {
              const tag = tagsMap[tagId];
              if (!tag) return null;
              return (
                <button
                  key={tagId}
                  onClick={() => toggleTagFilter(tagId)}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-70"
                  style={{ backgroundColor: tag.color + '20', color: tag.color }}
                >
                  {tag.name}
                  <X className="size-3" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bulk action bar — visible only when contacts are selected */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-2.5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-foreground">
              {selectionCount} contact{selectionCount !== 1 ? 's' : ''} selected
            </span>

            {/* "Select all N" prompt — shown when entire current page is ticked
                but more contacts exist on other pages */}
            {allPageSelected && !selectingAll && totalCount > contacts.length && (
              <button
                onClick={() => setSelectingAll(true)}
                className="text-xs text-foreground underline underline-offset-2 hover:opacity-70 transition-opacity"
              >
                Select all {totalCount} contacts
              </button>
            )}

            {selectingAll && (
              <span className="text-xs text-muted-foreground">
                All {totalCount} contacts will be deleted.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="size-3.5" />
              Delete {selectionCount}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={clearSelection}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {/* Select-all checkbox */}
              <TableHead className="w-10 pl-4">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = somePageSelected;
                  }}
                  onChange={toggleSelectAllPage}
                  aria-label="Select all on this page"
                  className="h-4 w-4 cursor-pointer rounded border-border accent-foreground"
                />
              </TableHead>
              <TableHead className="text-muted-foreground">Name</TableHead>
              <TableHead className="text-muted-foreground">Phone</TableHead>
              <TableHead className="text-muted-foreground hidden md:table-cell">Email</TableHead>
              <TableHead className="text-muted-foreground hidden lg:table-cell">Company</TableHead>
              <TableHead className="text-muted-foreground hidden md:table-cell">Tags</TableHead>
              <TableHead className="text-muted-foreground hidden lg:table-cell">Created</TableHead>
              <TableHead className="text-muted-foreground w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-border">
                <TableCell colSpan={8} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="size-6 animate-spin text-foreground" />
                    <p className="text-sm text-muted-foreground">Loading contacts...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : contacts.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={8} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {search ? 'No contacts match your search.' : 'No contacts yet.'}
                    </p>
                    {!search && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={openAddForm}
                        className="mt-2 border-border text-foreground/70 hover:bg-muted"
                      >
                        <Plus className="size-3.5" />
                        Add your first contact
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((contact) => {
                const isSelected = selectedIds.has(contact.id);
                return (
                  <TableRow
                    key={contact.id}
                    className={`border-border cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-muted/60 hover:bg-muted/80'
                        : 'hover:bg-card/50'
                    }`}
                    onClick={() => openDetail(contact.id)}
                  >
                    {/* Per-row checkbox */}
                    <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => toggleOne(contact.id, e)}
                        aria-label={`Select ${contact.name || contact.phone}`}
                        className="h-4 w-4 cursor-pointer rounded border-border accent-foreground"
                      />
                    </TableCell>
                    <TableCell className="text-foreground font-medium">
                      {contact.name || (
                        <span className="text-muted-foreground italic">Unnamed</span>
                      )}
                    </TableCell>
                    <TableCell className="text-foreground/70 font-mono text-xs">
                      {contact.phone}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden md:table-cell text-sm">
                      {contact.email || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden lg:table-cell text-sm">
                      {contact.company || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {contact.tags && contact.tags.length > 0 ? (
                          contact.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag.id}
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{
                                backgroundColor: tag.color + '20',
                                color: tag.color,
                              }}
                            >
                              {tag.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                        {contact.tags && contact.tags.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{contact.tags.length - 3}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs hidden lg:table-cell">
                      {new Date(contact.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={(e) => e.stopPropagation()}
                            />
                          }
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-card border-border">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditForm(contact);
                            }}
                            className="text-foreground/70 focus:bg-muted focus:text-foreground"
                          >
                            <Pencil className="size-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-muted" />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmDelete(contact);
                            }}
                          >
                            <Trash2 className="size-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of{' '}
            {totalCount}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasPrev}
              onClick={() => setPage((p) => p - 1)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs text-muted-foreground px-2">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Dialogs ───────────────────────────────────────────────── */}

      <ContactForm
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={editContact}
        contactTags={editContactTags}
        onSaved={() => {
          fetchContacts();
          fetchTags();
        }}
      />

      <ContactDetailView
        open={detailOpen}
        onOpenChange={setDetailOpen}
        contactId={detailContactId}
        onUpdated={fetchContacts}
      />

      <ImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={fetchContacts}
      />

      {/* Single delete confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-card border-border text-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Delete Contact</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Are you sure you want to delete{' '}
              <span className="text-foreground font-medium">
                {deleteTarget?.name || deleteTarget?.phone}
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-card border-border">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              className="border-border text-foreground/70 hover:bg-muted"
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="bg-card border-border text-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Delete {selectionCount} Contact{selectionCount !== 1 ? 's' : ''}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {selectingAll ? (
                <>
                  This will permanently delete{' '}
                  <span className="text-foreground font-medium">all {totalCount} contacts</span>
                  {search.trim() && (
                    <>
                      {' '}matching{' '}
                      <span className="text-foreground font-medium">&quot;{search}&quot;</span>
                    </>
                  )}
                  {noTagFilter && (
                    <>
                      {' '}with{' '}
                      <span className="text-foreground font-medium">no tag added</span>
                    </>
                  )}
                  {selectedTagIds.size > 0 && (
                    <>
                      {' '}tagged{' '}
                      <span className="text-foreground font-medium">
                        {Array.from(selectedTagIds)
                          .map((id) => tagsMap[id]?.name)
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                    </>
                  )}
                  . Their conversations and messages will remain.
                </>
              ) : (
                <>
                  This will permanently delete{' '}
                  <span className="text-foreground font-medium">
                    {selectionCount} contact{selectionCount !== 1 ? 's' : ''}
                  </span>
                  . Their conversations and messages will remain. This action cannot be undone.
                </>
              )}
            </DialogDescription>
            {bulkDeleteProgress && (
              <p className="mt-2 text-xs text-muted-foreground">
                Deleting {bulkDeleteProgress.done} of {bulkDeleteProgress.total}…
              </p>
            )}
          </DialogHeader>
          <DialogFooter className="bg-card border-border">
            <Button
              variant="outline"
              onClick={() => setBulkDeleteOpen(false)}
              className="border-border text-foreground/70 hover:bg-muted"
              disabled={bulkDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
            >
              {bulkDeleting && <Loader2 className="size-4 animate-spin" />}
              Delete {selectionCount}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete by tag */}
      <Dialog open={deleteByTagOpen} onOpenChange={setDeleteByTagOpen}>
        <DialogContent className="bg-card border-border text-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Delete Contacts by Tag</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Pick a tag to permanently delete every contact carrying it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Select
              value={deleteByTagId}
              onValueChange={(v) => handleDeleteByTagPick(v as string)}
            >
              <SelectTrigger className="w-full bg-card border-border text-foreground">
                <SelectValue placeholder="Select a tag..." />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {allTags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id} className="text-foreground/70">
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {deleteByTagId && (
              <p className="text-sm text-muted-foreground">
                {deleteByTagCounting ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin" /> Counting matching contacts...
                  </span>
                ) : (
                  <>
                    This will permanently delete{' '}
                    <span className="text-foreground font-medium">
                      {deleteByTagCount ?? 0} contact{(deleteByTagCount ?? 0) !== 1 ? 's' : ''}
                    </span>{' '}
                    tagged{' '}
                    <span className="text-foreground font-medium">
                      &quot;{tagsMap[deleteByTagId]?.name}&quot;
                    </span>
                    . Their conversations and messages will remain. This action cannot be undone.
                  </>
                )}
              </p>
            )}
          </div>

          <DialogFooter className="bg-card border-border">
            <Button
              variant="outline"
              onClick={() => setDeleteByTagOpen(false)}
              className="border-border text-foreground/70 hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteByTag}
              disabled={!deleteByTagId || deleteByTagCounting || deleteByTagDeleting || (deleteByTagCount ?? 0) === 0}
            >
              {deleteByTagDeleting && <Loader2 className="size-4 animate-spin" />}
              Delete{deleteByTagCount != null ? ` ${deleteByTagCount}` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
