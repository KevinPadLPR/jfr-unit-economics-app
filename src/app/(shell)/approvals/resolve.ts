import type { ApprovalLookups, LookupLot, LookupPasture, LookupRanch, LookupFieldAction, LookupMedication } from "./lookups";

/** A row from pending_field_entries, status = 'pending'. */
export interface PendingFieldEntry {
  id: string;
  entry_type: "doctoring" | "move" | "count" | "weight" | string;
  client_id: string | null;
  raw: Record<string, unknown>;
  status: string;
  review_notes: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  event_datetime: string | null;
  lot_id: string | null;
  pasture_id: string | null;
  to_pasture_id: string | null;
  field_action_id: string | null;
  tag_number: string | null;
  no_tag: boolean | null;
  head_count: number | null;
  resolved_meds: { position: number; medication_id: string; dose: number }[] | null;
  resolved_detail: { shrink_pct?: number; applies_to?: string; coverage?: string } | null;
}

export type ApprovalKind = "doctoring" | "dead" | "move" | "count" | "weight";

export interface ResolvedMed {
  position: number;
  name: string;
  med: LookupMedication | null;
  dose: number | null;
  unpriced: boolean;
  withdrawalDays: number;
  clearDate: string | null;
}

export interface ResolvedEntry {
  entry: PendingFieldEntry;
  raw: Record<string, unknown>;
  kind: ApprovalKind;
  edited: boolean;
  lot: LookupLot | null;
  ranch: LookupRanch | null;
  pasture: LookupPasture | null;
  toRanch: LookupRanch | null;
  toPasture: LookupPasture | null;
  split: { lot: LookupLot; name: string; head: number }[] | null;
  head: number | null;
  action: LookupFieldAction | null;
  tag: string;
  meds: ResolvedMed[];
  isDead: boolean;
  notHauled: boolean;
  issues: string[];
  warnings: string[];
  ready: boolean;
  // count-only
  bookHead?: number;
  diff?: number;
  // weight-only
  totGross?: number;
  grossAvg?: number | null;
  bookedAvg?: number | null;
  shrinkPct?: number | null;
  appliesTo?: string;
  coverage?: string;
  method?: string | null;
  drafts?: { head?: string; grossLb?: string }[];
}

function str(v: unknown): string {
  return String(v == null ? "" : v).trim();
}
function norm(v: unknown): string {
  return str(v).toLowerCase();
}

function chicagoDayOf(ts: string | null): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
function addDaysIso(iso: string | null, n: number): string | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Ported from approvalOverride() (index.html:10614-10655). Turns a staged row's OFFICE
 * EDITS (the resolved_* columns) into the real entities they point at. Never invents a
 * value: an unmatched id means the row it pointed at is gone or closed since the edit,
 * which is surfaced as `stale`, not silently re-inferred -- re-inferring would undo a
 * decision the office already made.
 */
function approvalOverride(entry: PendingFieldEntry, lk: ApprovalLookups) {
  const stale: string[] = [];
  const raw = entry.raw || {};

  const pick = <T,>(id: string | null, map: Map<string, T>, what: string): T | undefined => {
    if (!id) return undefined;
    const hit = map.get(id);
    if (!hit) {
      stale.push(what);
      return undefined;
    }
    return hit;
  };

  const lot = pick(entry.lot_id, lk.lotsById, "lot");
  const action = pick(entry.field_action_id, lk.actionsById, "action");
  const pasture = pick(entry.pasture_id, lk.pasturesById, "pasture");
  const toPasture = pick(entry.to_pasture_id, lk.pasturesById, "to-pasture");
  const head = entry.head_count != null ? entry.head_count : undefined;
  const tag = entry.tag_number != null && String(entry.tag_number) !== "" ? String(entry.tag_number) : undefined;

  // resolved_meds is NOT NULL DEFAULT '[]', so an untouched row carries an EMPTY array, not
  // null. Only an office edit writes it, and every edit also writes lot_id (required on the
  // edit form), so a list only overrides the cowboy's meds when the office actually edited
  // the row. Before 2026-09-26 this read Array.isArray() alone: every untouched entry
  // resolved to an empty med list and posted with no meds (167 events, 2026-09-01 to
  // 2026-09-26) -- see docs/field-entries.md.
  const officeEdited = !!(entry.lot_id || entry.field_action_id || entry.pasture_id || entry.to_pasture_id);
  const hasMedList = Array.isArray(entry.resolved_meds) && entry.resolved_meds.length > 0;
  const meds = hasMedList || (officeEdited && Array.isArray(entry.resolved_meds)) ? entry.resolved_meds : undefined;

  // "Edited" must mean THE OFFICE changed something, not merely that a column is populated:
  // the field app itself writes tag_number, head_count and event_datetime on every
  // submission, so treating any value as an edit would badge every untouched row.
  const rawHead = parseInt(String((raw as Record<string, unknown>).headCount ?? ""), 10);
  const edited =
    officeEdited ||
    hasMedList ||
    (head != null && !isNaN(rawHead) && head !== rawHead) ||
    (tag != null && String((raw as Record<string, unknown>).tagNumber ?? "") !== tag);

  return { stale, lot, action, pasture, toPasture, head, tag, meds, edited };
}

function findPasture(lk: ApprovalLookups, ranchTxt: unknown, pastTxt: unknown) {
  const ranch = lk.ranchesByName.get(norm(ranchTxt)) ?? null;
  if (!ranch) return { ranch: null, pasture: null };
  const pasture = lk.pastures.find((p) => norm(p.name) === norm(pastTxt) && p.ranch_id === ranch.id) ?? null;
  return { ranch, pasture };
}

/**
 * Ported from resolveApprovalEntry() (index.html:10657-10943). Turns one staged
 * pending_field_entries row into everything the Approvals screen needs: a BLOCKER (`issues`)
 * means the entry cannot be posted correctly and must not be selectable; a WARNING means it
 * will post, but something about it is worth seeing first (e.g. an unpriced med posts a real
 * row with a null cost).
 */
export function resolveApprovalEntry(entry: PendingFieldEntry, lk: ApprovalLookups): ResolvedEntry {
  const raw = entry.raw || {};
  const ov = approvalOverride(entry, lk);
  const edited = ov.edited;
  const missingWhen = !entry.event_datetime;
  const issues: string[] = [];
  const warnings: string[] = [];
  const isMove = entry.entry_type === "move";

  ov.stale.forEach((w) => issues.push(`the ${w} this entry was corrected to no longer exists or is closed — re-edit it`));

  // ---- Counts and test weights ----------------------------------------------------------
  if (entry.entry_type === "count" || entry.entry_type === "weight") {
    const loc = findPasture(lk, raw.ranch, raw.pasture);
    const pasture = ov.pasture ?? loc.pasture;
    const ranch = pasture ? (lk.ranchesById.get(pasture.ranch_id) ?? null) : loc.ranch;
    if (!pasture) issues.push(`pasture "${str(raw.ranch)} ${str(raw.pasture)}" not found — use Edit to set it`);
    if (missingWhen) issues.push("no usable date on this entry");

    const here = pasture ? lk.assignments.filter((a) => a.pasture_id === pasture.id) : [];
    const bookHead = here.reduce((t, a) => t + (Number(a.head_count) || 0), 0);

    if (entry.entry_type === "count") {
      const counted = entry.head_count != null ? entry.head_count : parseInt(String(raw.countedHead ?? ""), 10);
      const diff = (counted || 0) - bookHead;
      // A gap is NOT a split to re-cut: it is a death, sale or move nobody recorded.
      // Approving it would bury that, so it blocks.
      if (diff !== 0) {
        issues.push(
          `counted ${counted} against ${bookHead} on the books — ${Math.abs(diff)} ${diff > 0 ? "over" : "short"}. ` +
            `Find the missing death, sale or move first.`
        );
      }
      return {
        entry,
        raw,
        kind: "count",
        edited,
        lot: null,
        ranch,
        pasture,
        toRanch: null,
        toPasture: null,
        split: null,
        head: counted ?? null,
        bookHead,
        diff,
        action: null,
        tag: "",
        meds: [],
        isDead: false,
        notHauled: false,
        issues,
        warnings,
        ready: issues.length === 0,
      };
    }

    // weight
    const drafts = Array.isArray(raw.drafts) ? (raw.drafts as { head?: string; grossLb?: string }[]) : [];
    const totHead = drafts.reduce((t, d) => t + (parseInt(String(d.head ?? ""), 10) || 0), 0);
    const totGross = drafts.reduce((t, d) => t + (parseFloat(String(d.grossLb ?? "")) || 0), 0);
    if (!drafts.length || !totHead || !totGross) issues.push("no usable scale drafts on this entry");

    let lot = ov.lot ?? null;
    if (!lot && here.length === 1) {
      lot = lk.lotsById.get(here[0].lot_id) ?? null;
      if (lot) warnings.push(`lot ${lot.lot_number} inferred — only lot in ${pasture?.name}`);
    } else if (!lot && here.length > 1) {
      const names = here.map((a) => lk.lotsById.get(a.lot_id)?.lot_number).filter(Boolean).join(", ");
      issues.push(`${here.length} lots in ${pasture ? pasture.name : ""} (${names}) — use Edit to say which one was weighed`);
    } else if (!lot && pasture) {
      issues.push(`no open lot in ${pasture.name}`);
    }

    const det = entry.resolved_detail || {};
    const shrinkPct =
      det.shrink_pct != null ? Number(det.shrink_pct) : raw.suggestedShrinkPct != null ? Number(raw.suggestedShrinkPct) : null;
    if (shrinkPct == null || isNaN(shrinkPct)) issues.push("no shrink set — use Edit");
    else if (det.shrink_pct == null) warnings.push(`shrink defaulted to ${shrinkPct}% from "${str(raw.method) || "method not given"}" — confirm it with Edit`);
    const appliesTo = det.applies_to || "pasture";
    const coverage = det.coverage === "whole_lot" ? "whole_lot" : "sample";
    if (coverage === "whole_lot" && appliesTo === "lot") {
      warnings.push("this will become the lot’s weight anchor — its projected weight will be re-based on it");
    }
    if (appliesTo === "pasture" && lot && pasture && totHead) {
      const lotHere = here.filter((a) => a.lot_id === lot!.id).reduce((t, a) => t + (Number(a.head_count) || 0), 0);
      if (lotHere > 0 && totHead < 0.25 * lotHere) {
        warnings.push(
          `${totHead} of ${lotHere} hd (${Math.round((100 * totHead) / lotHere)}%) — under the 25% ` +
            `(${Math.ceil(0.25 * lotHere)} hd) a weighing needs to set ${pasture.name}’s weight; it will show as a note only`
        );
      }
    }
    const grossAvg = totHead ? totGross / totHead : null;
    const bookedAvg = grossAvg != null && shrinkPct != null ? grossAvg * (1 - shrinkPct / 100) : null;

    return {
      entry,
      raw,
      kind: "weight",
      edited,
      lot,
      ranch,
      pasture,
      toRanch: null,
      toPasture: null,
      split: null,
      head: totHead,
      totGross,
      grossAvg,
      bookedAvg,
      shrinkPct,
      appliesTo,
      coverage,
      method: (raw.method as string) || null,
      drafts,
      action: null,
      tag: "",
      meds: [],
      isDead: false,
      notHauled: false,
      issues,
      warnings,
      ready: issues.length === 0,
    };
  }

  // ---- Moves resolve on their own terms -------------------------------------------------
  if (isMove) {
    const fromTxt = findPasture(lk, raw.fromRanch, raw.fromPasture);
    const toTxt = findPasture(lk, raw.toRanch, raw.toPasture);
    const fromPasture = ov.pasture ?? fromTxt.pasture;
    const toPasture = ov.toPasture ?? toTxt.pasture;
    const fromRanch = fromPasture ? (lk.ranchesById.get(fromPasture.ranch_id) ?? null) : fromTxt.ranch;
    const toRanch = toPasture ? (lk.ranchesById.get(toPasture.ranch_id) ?? null) : toTxt.ranch;
    if (!fromPasture) issues.push(`from-pasture "${str(raw.fromRanch)} ${str(raw.fromPasture)}" not found — use Edit to set it`);
    if (!toPasture) issues.push(`to-pasture "${str(raw.toRanch)} ${str(raw.toPasture)}" not found — use Edit to set it`);
    const rawHead = parseInt(String(raw.headCount ?? ""), 10);
    const head = ov.head != null ? ov.head : isNaN(rawHead) ? null : rawHead;
    if (head == null || head <= 0) warnings.push("head count not given — uncounted move");

    let split: { lot: LookupLot; name: string; head: number }[] | null = null;
    if (!ov.lot && Array.isArray(raw.lotSplit) && raw.lotSplit.length) {
      const rawSplit = raw.lotSplit as { lot: string; head: string }[];
      const mapped = rawSplit.map((x) => ({
        lot: lk.lotsByName.get(norm(x.lot)) ?? null,
        name: x.lot,
        head: parseInt(String(x.head ?? ""), 10) || 0,
      }));
      mapped.filter((x) => !x.lot).forEach((x) => issues.push(`lot "${x.name}" from the field is not an open lot — use Edit to set it`));
      const filtered = mapped.filter((x): x is { lot: LookupLot; name: string; head: number } => !!x.lot && x.head > 0);
      split = filtered.length ? filtered : null;
    }

    let lot = ov.lot ?? null;
    if (!lot && !split && raw.lotNumber) {
      lot = lk.lotsByName.get(norm(raw.lotNumber)) ?? null;
      if (!lot) issues.push(`lot "${str(raw.lotNumber)}" from the field is not an open lot — use Edit to set it`);
    }
    if (fromPasture && split) {
      split.forEach((x) => {
        const a = lk.assignments.find((y) => y.pasture_id === fromPasture.id && y.lot_id === x.lot.id);
        if (!a) issues.push(`lot ${x.lot.lot_number} is not in ${fromPasture.name}`);
        else if (x.head > (a.head_count ?? 0)) {
          issues.push(`${x.head} head of ${x.lot.lot_number} exceeds the ${a.head_count} in ${fromPasture.name}`);
        }
      });
      const splitSum = split.reduce((t, x) => t + x.head, 0);
      if (head != null && head !== splitSum) issues.push(`the lot split adds to ${splitSum} but the move says ${head} head`);
    } else if (fromPasture) {
      const here = lk.assignments.filter((a) => a.pasture_id === fromPasture.id);
      if (!lot) {
        if (here.length === 1) {
          lot = lk.lotsById.get(here[0].lot_id) ?? null;
          if (lot) warnings.push(`lot ${lot.lot_number} inferred — only lot in ${fromPasture.name}`);
        } else if (here.length === 0) {
          issues.push(`no open lot in ${fromRanch?.name ?? ""} – ${fromPasture.name}`);
        } else {
          const names = here.map((a) => lk.lotsById.get(a.lot_id)?.lot_number).filter(Boolean).join(", ");
          issues.push(`${here.length} lots in ${fromPasture.name} (${names}) — use Edit to say which one moved`);
        }
      } else if (!here.some((a) => a.lot_id === lot!.id)) {
        issues.push(`lot ${lot.lot_number} is not in ${fromPasture.name}`);
      }
    }
    if (lot && !split && fromPasture && head && head > 0) {
      const a = lk.assignments.find((x) => x.pasture_id === fromPasture.id && x.lot_id === lot!.id);
      if (a && head > (a.head_count ?? 0)) {
        issues.push(`${head} head exceeds the ${a.head_count} of lot ${lot.lot_number} in that pasture`);
      }
    }
    if (missingWhen) issues.push("no usable date on this entry");

    return {
      entry,
      raw,
      kind: "move",
      edited,
      split,
      lot,
      ranch: fromRanch,
      pasture: fromPasture,
      toRanch,
      toPasture,
      head,
      action: null,
      tag: "",
      meds: [],
      isDead: false,
      notHauled: false,
      issues,
      warnings,
      ready: issues.length === 0,
    };
  }

  // ---- Doctoring and deaths --------------------------------------------------------------
  const lot = ov.lot ?? lk.lotsByName.get(norm(raw.lotNumber)) ?? null;
  if (!lot) issues.push(raw.lotNumber ? `lot "${str(raw.lotNumber)}" not found on an open lot — use Edit to set it` : "no lot given — use Edit to set it");

  // location is "Ranch - Pasture". Verified (same as the vanilla app) that no ranch or
  // pasture name contains a dash, so this split is safe.
  const locParts = str(raw.location).split(" - ");
  const locTxt = locParts.length >= 2 ? findPasture(lk, locParts[0], locParts[1]) : { ranch: null, pasture: null };
  const pasture = ov.pasture ?? locTxt.pasture;
  const ranch = pasture ? (lk.ranchesById.get(pasture.ranch_id) ?? null) : locTxt.ranch;
  if (!pasture) {
    if (!locTxt.ranch) issues.push(`ranch "${locParts[0] ?? ""}" not found — use Edit to set it`);
    else issues.push(`pasture "${locParts[1] ?? ""}" not found on ${locTxt.ranch.name} — use Edit to set it`);
  }

  const action = ov.action ?? lk.actionsByName.get(norm(raw.treatmentType)) ?? null;
  if (!action) issues.push(`action "${str(raw.treatmentType)}" not found — use Edit to set it`);

  const tag = ov.tag != null ? ov.tag : str(raw.tagNumber);

  const medSrc: { position: number; name: string; med: LookupMedication | null; doseTxt: unknown }[] = ov.meds
    ? ov.meds.map((m) => ({
        position: m.position,
        med: lk.medsById.get(m.medication_id) ?? null,
        name: lk.medsById.get(m.medication_id)?.name ?? "",
        doseTxt: m.dose,
      }))
    : [1, 2, 3].map((i) => ({
        position: i,
        name: str(raw[`medication${i}`]),
        med: lk.medsByName.get(norm(raw[`medication${i}`])) ?? null,
        doseTxt: raw[`dosage${i}`],
      }));

  const meds: ResolvedMed[] = [];
  medSrc.forEach((src) => {
    const name = src.name;
    const doseTxt = src.doseTxt;
    if (!name && (doseTxt === "" || doseTxt == null)) return;
    const med = src.med;
    const dose = doseTxt === "" || doseTxt == null ? null : Number(doseTxt);
    const unpriced = !!(med && med.cost_per_unit == null && med.cost_per_head == null);
    if (!med && name) issues.push(`medication "${name}" not matched — use Edit to map it`);
    if (name && (dose == null || isNaN(dose))) issues.push(`dose for "${name}" is not a number`);
    if (unpriced && med) warnings.push(`${med.name} has no price — cost will post as $0`);
    const wd = med ? Number(med.withdrawal_days) || 0 : 0;
    const clearDate = wd > 0 && entry.event_datetime ? addDaysIso(chicagoDayOf(entry.event_datetime), wd) : null;
    meds.push({ position: src.position, name: name || "", med, dose: dose != null && !isNaN(dose) ? dose : null, unpriced, withdrawalDays: wd, clearDate });
  });

  if (missingWhen) issues.push("no usable date on this entry");

  const isDead = !!(action && action.is_dead);
  const notHauled = isDead && str(raw.drugOff).toLowerCase() !== "yes";
  if (isDead && !raw.drugOff) warnings.push("carcass disposal not answered");

  return {
    entry,
    raw,
    kind: isDead ? "dead" : "doctoring",
    edited,
    lot,
    ranch,
    pasture,
    toRanch: null,
    toPasture: null,
    split: null,
    head: null,
    action,
    tag,
    meds,
    isDead,
    notHauled,
    issues,
    warnings,
    ready: issues.length === 0,
  };
}

/**
 * Ported from flagDuplicateApprovals() (index.html:10948-10965). First Pull EX and friends
 * are once-per-animal; approval is all-or-nothing, so a duplicate must be caught HERE --
 * letting the database trigger reject it mid-batch would take the whole batch down.
 */
export async function flagDuplicateApprovals(
  resolved: ResolvedEntry[],
  queryDoctoringEvents: (lotIds: string[]) => Promise<{ tag_number: string; lot_id: string; field_action_id: string }[]>
): Promise<void> {
  const candidates = resolved.filter((r) => r.kind === "doctoring" && r.lot && r.action?.once_per_animal && r.tag);
  if (candidates.length === 0) return;
  const lotIds = [...new Set(candidates.map((r) => r.lot!.id))];
  const existing = await queryDoctoringEvents(lotIds);
  const seen = new Set(existing.map((d) => `${d.tag_number}|${d.lot_id}|${d.field_action_id}`));
  candidates.forEach((r) => {
    if (seen.has(`${r.tag}|${r.lot!.id}|${r.action!.id}`)) {
      r.issues.push(`tag ${r.tag} already has "${r.action!.name}" on this lot`);
      r.ready = false;
    }
  });
}
