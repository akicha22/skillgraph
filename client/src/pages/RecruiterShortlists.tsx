import { Alert, Badge, Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Textarea } from "../components/ui/Field";
import { EmptyState, Skeleton } from "../components/ui/Feedback";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight, Lock, Plus, Trash2 } from "lucide-react";
import DashboardLayout from "../layouts/DashboardLayout";
import {
  createShortlist,
  deleteShortlist,
  getShortlist,
  listShortlists,
  removeShortlistEntry,
  renameShortlist,
  saveShortlistNote,
} from "../services/assessments";
import type { ShortlistDetail, ShortlistSummary } from "../types/assessments";

/**
 * A recruiter's shortlists: named lists of submitted candidates with a note per candidate.
 * Notes are private to the owning recruiter; the server never sends them anywhere else.
 */
export default function RecruiterShortlists() {
  const [params, setParams] = useSearchParams();
  const [shortlists, setShortlists] = useState<ShortlistSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [detail, setDetail] = useState<ShortlistDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [removingEntryId, setRemovingEntryId] = useState<string | null>(null);
  const [deletingList, setDeletingList] = useState(false);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  // The selected list lives in the URL, so a shortlist can be linked to directly.
  const selectedId = params.get("list") ?? shortlists?.[0]?.id ?? "";
  const loadedDetail = detail?.id === selectedId ? detail : null;

  useEffect(() => {
    let cancelled = false;
    listShortlists()
      .then((data) => {
        if (!cancelled) setShortlists(data.shortlists);
      })
      .catch((err) => {
        if (!cancelled) setListError(err instanceof Error ? err.message : "Could not load your shortlists.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    getShortlist(selectedId)
      .then((loaded) => {
        if (cancelled) return;
        setDetail(loaded);
        setDetailError(null);
        setNoteError(null);
        setSavedEntryId(null);
        setNoteDrafts(Object.fromEntries(loaded.entries.map((entry) => [entry.id, entry.note])));
        setRenameOpen(false);
        setRenameDraft(loaded.name);
        setRenameError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setDetail(null);
        setDetailError(err instanceof Error ? err.message : "Could not load this shortlist.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function refreshList() {
    const data = await listShortlists();
    setShortlists(data.shortlists);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createShortlist(newName.trim());
      setShortlists((prev) => [created.shortlist, ...(prev ?? [])]);
      setNewName("");
      setParams({ list: created.shortlist.id });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create this shortlist.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveNote(entryId: string) {
    if (!selectedId) return;
    setSavingEntryId(entryId);
    setNoteError(null);
    setSavedEntryId(null);
    try {
      const updated = await saveShortlistNote(selectedId, entryId, noteDrafts[entryId] ?? "");
      setDetail(updated);
      setNoteDrafts(Object.fromEntries(updated.entries.map((entry) => [entry.id, entry.note])));
      setSavedEntryId(entryId);
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Could not save this note.");
    } finally {
      setSavingEntryId(null);
    }
  }

  async function handleRemoveEntry(entryId: string, candidateName: string) {
    if (!selectedId) return;
    if (!window.confirm(`Remove ${candidateName} from this shortlist? The note is deleted too.`)) {
      return;
    }
    setRemovingEntryId(entryId);
    setNoteError(null);
    try {
      await removeShortlistEntry(selectedId, entryId);
      setDetail(await getShortlist(selectedId));
      await refreshList();
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Could not remove this candidate.");
    } finally {
      setRemovingEntryId(null);
    }
  }

  async function handleRename(event: FormEvent) {
    event.preventDefault();
    if (!selectedId || !loadedDetail) return;
    const name = renameDraft.trim();
    if (!name || name === loadedDetail.name) return;
    setSavingRename(true);
    setRenameError(null);
    try {
      const updated = await renameShortlist(selectedId, name);
      setDetail(updated);
      setRenameDraft(updated.name);
      setRenameOpen(false);
      await refreshList();
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Could not rename this shortlist.");
    } finally {
      setSavingRename(false);
    }
  }

  async function handleDeleteList() {
    if (!selectedId || !loadedDetail) return;
    if (!window.confirm(`Delete the shortlist "${loadedDetail.name}" and all its notes?`)) return;
    setDeletingList(true);
    setDetailError(null);
    try {
      await deleteShortlist(selectedId);
      setDetail(null);
      setParams({});
      await refreshList();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Could not delete this shortlist.");
    } finally {
      setDeletingList(false);
    }
  }

  return (
    <DashboardLayout>
      <Card>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-slate-900">Shortlists</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Group candidates you want to revisit. A note belongs to this list only and is visible to
          you alone — it is never shown to the candidate or attached to their assessment.
        </p>

        <form onSubmit={(event) => void handleCreate(event)} className="mt-4 flex flex-wrap items-end gap-2">
          <label className="flex-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              New shortlist
            </span>
            <Input
              value={newName}
              onChange={(event) => {
                setNewName(event.target.value);
                setCreateError(null);
              }}
              placeholder="e.g. Data analyst — shortlist"
              maxLength={80}
              className="mt-1"
            />
          </label>
          <Button
            type="submit"
            disabled={creating || !newName.trim()}
            variant="primary" size="sm"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {creating ? "Creating…" : "Create shortlist"}
          </Button>
        </form>
        {createError && <p className="mt-2 text-sm text-rose-700">{createError}</p>}
      </Card>

      {listError && (
        <Alert tone="error">{listError}</Alert>
      )}

      {shortlists !== null && shortlists.length === 0 ? (
        <Card><EmptyState title="No shortlists yet" text="Create one above, then add candidates from their submission pages." /></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside><Card className="p-3 sm:p-3">
            <h2 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Your lists
            </h2>
            {shortlists === null ? (
              <div role="status" className="mt-3"><span className="sr-only">Loading…</span><Skeleton className="h-16" /></div>
            ) : (
              <ul className="space-y-1">
                {shortlists.map((shortlist) => {
                  const current = shortlist.id === selectedId;
                  return (
                    <li key={shortlist.id}>
                      <button
                        type="button"
                        onClick={() => setParams({ list: shortlist.id })}
                        className={`min-h-11 flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm ${
                          current
                            ? "bg-indigo-50 font-medium text-indigo-700"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="truncate">{shortlist.name}</span>
                        <span className="shrink-0 text-xs text-slate-500">
                          {shortlist.entryCount}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card></aside>

          <div className="space-y-4">
            {detailError && (
              <Alert tone="error">{detailError}</Alert>
            )}

            {selectedId && !loadedDetail && !detailError && (
              <div role="status" className="mt-3"><span className="sr-only">Loading shortlist…</span><Skeleton className="h-16" /></div>
            )}

            {loadedDetail && (
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {renameOpen ? (
                      <form
                        onSubmit={(event) => void handleRename(event)}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <Input
                          value={renameDraft}
                          onChange={(event) => {
                            setRenameDraft(event.target.value);
                            setRenameError(null);
                          }}
                          maxLength={80}
                          aria-label="Shortlist name"
                          className="mt-1"
                        />
                        <Button
                          type="submit"
                          disabled={
                            savingRename ||
                            !renameDraft.trim() ||
                            renameDraft.trim() === loadedDetail.name
                          }
                          variant="primary" size="sm"
                        >
                          {savingRename ? "Saving…" : "Save name"}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            setRenameOpen(false);
                            setRenameDraft(loadedDetail.name);
                            setRenameError(null);
                          }}
                          variant="secondary" size="sm"
                        >
                          Cancel
                        </Button>
                      </form>
                    ) : (
                      <h2 className="text-lg font-semibold text-slate-900">{loadedDetail.name}</h2>
                    )}
                    {renameError && <p className="mt-1 text-sm text-rose-700">{renameError}</p>}
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <Lock className="h-3.5 w-3.5" aria-hidden />
                      Private to you · {loadedDetail.entries.length}{" "}
                      {loadedDetail.entries.length === 1 ? "candidate" : "candidates"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => {
                      setRenameOpen(true);
                      setRenameDraft(loadedDetail.name);
                      setRenameError(null);
                    }}
                    variant="secondary" size="sm"
                  >
                    Rename
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleDeleteList()}
                    disabled={deletingList}
                    variant="danger" size="sm"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    {deletingList ? "Deleting…" : "Delete list"}
                  </Button>
                  </div>
                </div>

                {noteError && <p className="mt-2 text-sm text-rose-700">{noteError}</p>}

                {loadedDetail.entries.length === 0 ? (
                  <EmptyState title="No candidates on this list yet" text="Open a submitted attempt and use Add to shortlist." />
                ) : (
                  <table role="table" aria-label="Shortlisted candidates" className="mt-4 block w-full text-left md:table md:table-fixed">
                    <thead className="hidden md:table-header-group"><tr><th scope="col" className="w-1/3 p-3">Candidate</th><th scope="col" className="w-28 p-3">Score</th><th scope="col" className="p-3">Private note and actions</th></tr></thead>
                    <tbody role="rowgroup" className="block space-y-3 md:table-row-group md:space-y-0">
                    {loadedDetail.entries.map((entry) => (
                      <tr role="row" key={entry.id} className="block rounded-card border border-slate-200 bg-white shadow-card md:table-row md:rounded-none md:shadow-none">
                          <td role="cell" className="block p-3 align-top wrap-break-word md:table-cell">
                            <Link
                              to={`/recruiter/attempts/${entry.attemptId}`}
                              className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline"
                            >
                              {entry.candidate.name}
                              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                            </Link>
                            <p className="text-xs text-slate-500">{entry.candidate.email}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {entry.assessment.title} · v{entry.assessment.versionNumber} ·{" "}
                              {entry.assessment.jobTitle}
                            </p>
                          </td>
                          <td role="cell" className="block px-3 align-top md:table-cell md:py-3"><Badge tone={entry.scoredCriteria === 0 ? "neutral" : "brand"} className="tabular-nums">
                            {entry.scoredCriteria === 0
                              ? "Not marked"
                              : `${entry.awarded} / ${entry.possible}`}
                          </Badge></td>
                          <td role="cell" className="block p-3 align-top md:table-cell">
                        <label className="block">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Your private note
                          </span>
                          <Textarea
                            value={noteDrafts[entry.id] ?? ""}
                            onChange={(event) => {
                              setSavedEntryId(null);
                              setNoteError(null);
                              setNoteDrafts((prev) => ({ ...prev, [entry.id]: event.target.value }));
                            }}
                            rows={2}
                            maxLength={2000}
                            placeholder="Why keep this candidate? What to probe at interview?"
                            className="mt-1"
                          />
                        </label>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <Button
                            type="button"
                            onClick={() => void handleSaveNote(entry.id)}
                            disabled={
                              savingEntryId === entry.id ||
                              (noteDrafts[entry.id] ?? "") === entry.note
                            }
                            variant="primary" size="sm"
                          >
                            {savingEntryId === entry.id ? "Saving…" : "Save note"}
                          </Button>
                          {savedEntryId === entry.id && (
                            <span className="text-xs text-emerald-700">Note saved</span>
                          )}
                          <Button
                            type="button"
                            onClick={() => void handleRemoveEntry(entry.id, entry.candidate.name)}
                            disabled={removingEntryId === entry.id}
                            variant="danger" size="sm"
                          >
                            {removingEntryId === entry.id ? "Removing…" : "Remove from list"}
                          </Button>
                        </div>
                          </td>
                      </tr>
                    ))}
                    </tbody>
                  </table>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
