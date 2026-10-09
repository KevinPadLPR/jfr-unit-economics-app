"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { NotYetMigrated } from "@/components/app-shell/not-yet-migrated";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { LotRecord, LotStatusRecord, CurrentLocation } from "./data/lot";
import type { Invoice, UnlinkedReceipt } from "./data/purchases";
import type { DoctoringEvent, DeathEvent, HeadAdjustment } from "./data/health";
import type { MoveEvent, LotTransfer } from "./data/moves";
import type { Sale } from "./data/sales";
import type { AuditEvent } from "./data/audit";
import type { CloseoutActual, CloseoutProjection, CloseoutRates } from "./closeout-math";
import type { ActivePasture, FieldAction, MedicationCatalogEntry, ReceivingProtocol } from "./data/reference";
import { HealthActionButtons } from "./health-actions";
import { MoveActionButton } from "./moves-actions";
import { DoctoringActionButton } from "./doctoring-actions";
import { NewInvoiceButton, InvoiceCardActions } from "./purchases-actions";
import { NewLoadOutButton, ReceiptCardActions } from "./load-out-actions";
import { NewSaleButton, SaleCardActions } from "./sales-actions";
import { DeleteEventButton } from "./delete-event-button";
import { deleteDeath, deleteHeadAdjustment } from "./actions/health";
import { deleteMove } from "./actions/moves";
import { deleteDoctoring } from "./actions/doctoring";

type SectionKey = "current" | "purchases" | "health" | "moves" | "sales" | "closeout" | "feedpen" | "audit";

const TABS: { key: SectionKey; label: string; feedPenOnly?: boolean }[] = [
  { key: "current", label: "Currently in" },
  { key: "purchases", label: "Purchases" },
  { key: "health", label: "Animal Health" },
  { key: "moves", label: "Moves" },
  { key: "sales", label: "Sales" },
  { key: "closeout", label: "Closeout" },
  { key: "feedpen", label: "Feed pen", feedPenOnly: true },
  { key: "audit", label: "Audit log" },
];

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-4 text-sm text-muted-foreground">{children}</p>;
}

function CurrentlyIn({ status, locations }: { status: LotStatusRecord | null; locations: CurrentLocation[] }) {
  return (
    <div className="flex flex-col gap-4">
      {status ? (
        <Card>
          <CardContent className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
            <Stat label="Head current" value={formatNumber(status.head_current)} />
            <Stat label="Avg wt in" value={status.avg_weight_in != null ? `${formatNumber(status.avg_weight_in)} lb` : "—"} />
            <Stat label="Est. wt today" value={status.projected_current_weight != null ? `${formatNumber(status.projected_current_weight)} lb` : "—"} />
            <Stat label="Days on feed" value={formatNumber(status.days_on_feed)} />
            <Stat label="Source" value={status.source ?? "—"} />
            <Stat label="Sex class" value={status.sex_class ?? "—"} />
            <Stat label="ADG used" value={status.adg_used != null ? formatNumber(status.adg_used, 2) : "—"} />
            <Stat label="ADG source" value={status.adg_source ?? "—"} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pasture</TableHead>
              <TableHead className="text-right">Head</TableHead>
              <TableHead>Since</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {locations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <Empty>No current pasture assignment on file.</Empty>
                </TableCell>
              </TableRow>
            ) : (
              locations.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    {l.ranch_name ?? "?"} / {l.pasture_name ?? "?"}
                  </TableCell>
                  <TableCell className="text-right">{formatNumber(l.head_count)}</TableCell>
                  <TableCell>{formatDate(l.moved_in)}</TableCell>
                  <TableCell className="text-muted-foreground">{l.notes ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function Purchases({
  lotId,
  lotNumber,
  canWrite,
  fiscalYear,
  activePastures,
  protocols,
  defaultProtocolId,
  purchases,
  unlinkedReceipts,
}: {
  lotId: string;
  lotNumber: string;
  canWrite: boolean;
  fiscalYear: string | null;
  activePastures: ActivePasture[];
  protocols: ReceivingProtocol[];
  defaultProtocolId: string;
  purchases: Invoice[];
  unlinkedReceipts: UnlinkedReceipt[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <NewInvoiceButton lotId={lotId} lotNumber={lotNumber} protocols={protocols} defaultProtocolId={defaultProtocolId} />
          <NewLoadOutButton
            lotId={lotId}
            lotNumber={lotNumber}
            fiscalYear={fiscalYear}
            activePastures={activePastures}
            protocols={protocols}
            defaultProtocolId={defaultProtocolId}
            invoices={purchases}
          />
        </div>
      )}

      <Card>
        <CardContent className="p-4 pb-0">
          <h3 className="text-sm font-semibold text-foreground">Load outs ({unlinkedReceipts.length})</h3>
        </CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Receipt</TableHead>
              <TableHead className="text-right">Head</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Protocol</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Notes</TableHead>
              {canWrite && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {unlinkedReceipts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canWrite ? 7 : 6}>
                  <Empty>No unlinked load outs. Click &quot;+ Load Out&quot; to log a delivery, or open an invoice to see its linked load outs.</Empty>
                </TableCell>
              </TableRow>
            ) : (
              unlinkedReceipts.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{formatDate(r.receipt_date)}</TableCell>
                  <TableCell className="text-right">{formatNumber(r.head_count)}</TableCell>
                  <TableCell>{r.tag_start && r.tag_end ? `${r.tag_start}-${r.tag_end}` : "—"}</TableCell>
                  <TableCell>{r.protocol_name ?? "—"}</TableCell>
                  <TableCell>
                    {r.destinations.length === 0
                      ? "—"
                      : r.destinations.map((d, i) => (
                          <div key={i}>
                            {d.ranch_name ?? "?"} / {d.pasture_name ?? "?"} ({formatNumber(d.head_count)})
                          </div>
                        ))}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.notes ?? "—"}</TableCell>
                  {canWrite && (
                    <TableCell>
                      <ReceiptCardActions
                        receipt={r}
                        lotId={lotId}
                        lotNumber={lotNumber}
                        fiscalYear={fiscalYear}
                        activePastures={activePastures}
                        protocols={protocols}
                        invoices={purchases}
                        canWrite={canWrite}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {purchases.length === 0 ? (
        <Empty>No purchase invoices on this lot yet.</Empty>
      ) : (
        purchases.map((inv) => (
        <Card key={inv.id}>
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-foreground">
                Invoice {inv.invoice_number ?? inv.id.slice(0, 8)} · {formatDate(inv.invoice_date)}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {formatNumber(inv.head_count)} hd · {inv.total_weight_lb != null ? `${formatNumber(inv.total_weight_lb)} lb` : "—"} ·{" "}
                  {formatMoney(inv.total_cost)}
                </span>
                <InvoiceCardActions invoice={inv} lotId={lotId} lotNumber={lotNumber} protocols={protocols} canWrite={canWrite} />
              </div>
            </div>
            {inv.notes ? <p className="text-sm text-muted-foreground">{inv.notes}</p> : null}
            {inv.receipts.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt</TableHead>
                    <TableHead className="text-right">Head</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inv.receipts.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatDate(r.receipt_date)}</TableCell>
                      <TableCell className="text-right">{formatNumber(r.head_count)}</TableCell>
                      <TableCell>{r.tag_start && r.tag_end ? `${r.tag_start}-${r.tag_end}` : "—"}</TableCell>
                      <TableCell>
                        {r.destinations.length === 0
                          ? "—"
                          : r.destinations.map((d, i) => (
                              <div key={i}>
                                {d.ranch_name ?? "?"} / {d.pasture_name ?? "?"} ({formatNumber(d.head_count)})
                              </div>
                            ))}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.notes ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </CardContent>
        </Card>
        ))
      )}
    </div>
  );
}

function AnimalHealth({
  lotNumber,
  lotId,
  canWrite,
  isOwner,
  lotClosed,
  lotIsFeedPen,
  locations,
  activePastures,
  fieldActions,
  medicationCatalog,
  doctoring,
  deaths,
  headAdjustments,
}: {
  lotNumber: string;
  lotId: string;
  canWrite: boolean;
  isOwner: boolean;
  lotClosed: boolean;
  lotIsFeedPen: boolean;
  locations: CurrentLocation[];
  activePastures: ActivePasture[];
  fieldActions: FieldAction[];
  medicationCatalog: MedicationCatalogEntry[];
  doctoring: DoctoringEvent[];
  deaths: DeathEvent[];
  headAdjustments: HeadAdjustment[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <HealthActionButtons
        lotNumber={lotNumber}
        lotId={lotId}
        canWrite={canWrite}
        lotClosed={lotClosed}
        lotIsFeedPen={lotIsFeedPen}
        locations={locations}
        activePastures={activePastures}
      />
      <Card>
        <CardContent className="flex items-center justify-between p-4 pb-0">
          <h3 className="text-sm font-semibold text-foreground">Doctoring ({doctoring.length})</h3>
          <DoctoringActionButton
            lotNumber={lotNumber}
            lotId={lotId}
            canWrite={canWrite}
            locations={locations}
            activePastures={activePastures}
            fieldActions={fieldActions}
            medicationCatalog={medicationCatalog}
          />
        </CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Tag</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Pasture</TableHead>
              <TableHead>Meds</TableHead>
              <TableHead>Notes</TableHead>
              {canWrite && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {doctoring.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canWrite ? 7 : 6}>
                  <Empty>No doctoring events on this lot yet.</Empty>
                </TableCell>
              </TableRow>
            ) : (
              doctoring.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{formatDate(e.event_datetime)}</TableCell>
                  <TableCell>{e.no_tag ? "NT" : e.tag_number ?? "—"}</TableCell>
                  <TableCell>{e.action_name ?? "—"}</TableCell>
                  <TableCell>{e.ranch_name ?? "?"} / {e.pasture_name ?? "?"}</TableCell>
                  <TableCell>{e.meds.map((m) => m.medication_name).filter(Boolean).join(", ") || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{e.notes ?? "—"}</TableCell>
                  {canWrite && (
                    <TableCell>
                      <DeleteEventButton eventId={e.id} canDelete={canWrite} action={(eventId) => deleteDoctoring(lotNumber, eventId)} />
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardContent className="p-4 pb-0">
          <h3 className="text-sm font-semibold text-foreground">Death log ({deaths.length})</h3>
        </CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Head</TableHead>
              <TableHead>Tag</TableHead>
              <TableHead>Cause</TableHead>
              <TableHead>Notes</TableHead>
              {isOwner && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {deaths.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isOwner ? 6 : 5}>
                  <Empty>No deaths recorded yet.</Empty>
                </TableCell>
              </TableRow>
            ) : (
              deaths.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{formatDate(d.event_date)}</TableCell>
                  <TableCell className="text-right">{formatNumber(d.head_count)}</TableCell>
                  <TableCell>{d.tag_number ?? "—"}</TableCell>
                  <TableCell>{d.cause ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{d.notes ?? "—"}</TableCell>
                  {isOwner && (
                    <TableCell>
                      <DeleteEventButton eventId={d.id} canDelete={isOwner} action={(eventId) => deleteDeath(lotNumber, eventId)} />
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardContent className="p-4 pb-0">
          <h3 className="text-sm font-semibold text-foreground">Missing and returned head ({headAdjustments.length})</h3>
        </CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Head</TableHead>
              <TableHead>Tag</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Notes</TableHead>
              {isOwner && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {headAdjustments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isOwner ? 6 : 5}>
                  <Empty>No head written off or returned.</Empty>
                </TableCell>
              </TableRow>
            ) : (
              headAdjustments.map((h) => (
                <TableRow key={h.id}>
                  <TableCell>{formatDate(h.event_date)}</TableCell>
                  <TableCell className="text-right">{formatNumber(h.head_count)}</TableCell>
                  <TableCell>{h.tag_number ?? "—"}</TableCell>
                  <TableCell>{h.cause ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{h.notes ?? "—"}</TableCell>
                  {isOwner && (
                    <TableCell>
                      <DeleteEventButton eventId={h.id} canDelete={isOwner} action={(eventId) => deleteHeadAdjustment(lotNumber, eventId)} />
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function Moves({
  lotNumber,
  lotId,
  canWrite,
  isOwner,
  headCurrent,
  locations,
  activePastures,
  moves,
  transfers,
}: {
  lotNumber: string;
  lotId: string;
  canWrite: boolean;
  isOwner: boolean;
  headCurrent: number | null;
  locations: CurrentLocation[];
  activePastures: ActivePasture[];
  moves: MoveEvent[];
  transfers: LotTransfer[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <MoveActionButton
        lotNumber={lotNumber}
        lotId={lotId}
        canWrite={canWrite}
        headCurrent={headCurrent}
        locations={locations}
        activePastures={activePastures}
      />
      <Card>
        <CardContent className="p-4 pb-0">
          <h3 className="text-sm font-semibold text-foreground">Move history ({moves.length})</h3>
        </CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead className="text-right">Head</TableHead>
              <TableHead>Notes</TableHead>
              {isOwner && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {moves.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isOwner ? 6 : 5}>
                  <Empty>No move history yet.</Empty>
                </TableCell>
              </TableRow>
            ) : (
              moves.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{formatDate(m.move_date)}</TableCell>
                  <TableCell>{m.from_pasture_name ?? "(unassigned)"}</TableCell>
                  <TableCell>{m.to_pasture_name ?? "?"}</TableCell>
                  <TableCell className="text-right">{formatNumber(m.head_count)}</TableCell>
                  <TableCell className="text-muted-foreground">{m.notes ?? "—"}</TableCell>
                  {isOwner && (
                    <TableCell>
                      <DeleteEventButton eventId={m.id} canDelete={isOwner} action={(eventId) => deleteMove(lotNumber, eventId)} />
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardContent className="p-4 pb-0">
          <h3 className="text-sm font-semibold text-foreground">Transfers ({transfers.length})</h3>
        </CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Other lot</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead className="text-right">Head</TableHead>
              <TableHead className="text-right">Basis</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transfers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Empty>No transfers. Cattle folded in from another lot, sorted out to one, or sent to the feed pen show here.</Empty>
                </TableCell>
              </TableRow>
            ) : (
              transfers.map((t) => (
                <TableRow key={t.transfer_id}>
                  <TableCell>{formatDate(t.transfer_date)}</TableCell>
                  <TableCell>{t.is_outbound ? "→ out" : "← in"}</TableCell>
                  <TableCell>{t.other_lot_number ?? "?"}</TableCell>
                  <TableCell>{t.kind ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatNumber(t.head_count)}</TableCell>
                  <TableCell className="text-right">
                    {t.kind === "feed_pen" || t.kind === "fy_rollover" ? "$0" : `${formatMoney(t.basis_total)} (${formatMoney(t.basis_per_head)}/hd)`}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function Sales({
  lotId,
  lotNumber,
  canWrite,
  isOwner,
  activePastures,
  pastBuyers,
  sales,
}: {
  lotId: string;
  lotNumber: string;
  canWrite: boolean;
  isOwner: boolean;
  activePastures: ActivePasture[];
  pastBuyers: string[];
  sales: Sale[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {canWrite && (
        <div>
          <NewSaleButton lotId={lotId} lotNumber={lotNumber} activePastures={activePastures} pastBuyers={pastBuyers} />
        </div>
      )}
      {sales.length === 0 ? (
        <Empty>No sales yet.</Empty>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead className="text-right">Head</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead className="text-right">$/cwt</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Source</TableHead>
                {canWrite && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((s) => {
                const wt = s.net_weight_lb ?? s.gross_weight_lb;
                const total = s.total_price ?? (s.price_per_head != null && s.head_count != null ? s.price_per_head * s.head_count : null);
                return (
                  <TableRow key={s.id}>
                    <TableCell>{formatDate(s.sale_date)}</TableCell>
                    <TableCell>{s.buyer ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatNumber(s.head_count)}</TableCell>
                    <TableCell className="text-right">{wt != null ? `${formatNumber(wt)} lb` : "—"}</TableCell>
                    <TableCell className="text-right">{s.price_per_cwt != null ? `$${s.price_per_cwt.toFixed(2)}` : "—"}</TableCell>
                    <TableCell className="text-right">{formatMoney(total)}</TableCell>
                    <TableCell>
                      {s.sources.length === 0
                        ? "—"
                        : s.sources.map((src, i) => (
                            <div key={i}>
                              {src.ranch_name ?? "?"} / {src.pasture_name ?? "?"} ({formatNumber(src.head_count)})
                            </div>
                          ))}
                    </TableCell>
                    {canWrite && (
                      <TableCell>
                        <SaleCardActions sale={s} lotId={lotId} lotNumber={lotNumber} activePastures={activePastures} pastBuyers={pastBuyers} canWrite={canWrite} isOwner={isOwner} />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function money4(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `$${n.toFixed(4)}`;
}

/**
 * Read-only Actual + Projection table, ported from the row set of recalculate()
 * (index.html:9561-9654). No Budget column, no per-head toggle, no sold/left split and no input
 * boxes -- this phase has none of those; see the approved Phase 9 plan for why. Actual is the
 * lot's cost to date; Projection is the lot's cost at close (Actual's own figures plus the
 * forward slice), the same pairing the live calculator shows side by side.
 */
function Closeout({ closeout }: { closeout: { actual: CloseoutActual; proj: CloseoutProjection; rates: CloseoutRates } | null }) {
  if (!closeout) return <Empty>Add at least one invoice to enable closeout projections.</Empty>;
  const { actual: a, proj: p, rates } = closeout;

  const row = (label: string, actual: number | null, projection: number | null, note?: string, fmt: (n: number | null) => string = formatMoney) => (
    <TableRow key={label}>
      <TableCell>
        {label}
        {note ? <span className="ml-2 text-xs text-muted-foreground">{note}</span> : null}
      </TableCell>
      <TableCell className="text-right">{fmt(actual)}</TableCell>
      <TableCell className="text-right">{fmt(projection)}</TableCell>
    </TableRow>
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead className="text-right">Actual (to date)</TableHead>
              <TableHead className="text-right">Projection (at close)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {row("Head-days", a.headDays, a.headDays + p.forwardHeadDays, undefined, (n) => formatNumber(n != null ? Math.round(n) : null))}
            {row("Days on feed", a.daysToDate, p.remainingDays != null ? a.daysToDate + p.remainingDays : null, undefined, (n) => formatNumber(n))}
            {row("Cattle in", a.cattleLive, a.cattleLive - p.deathLossFwd, `${formatNumber(a.headIn)} in at ${formatMoney(a.avgCostIn)}/hd`)}
            {row(
              "Death loss",
              a.deathLossUsd,
              a.deathLossUsd + p.deathLossFwd,
              `${formatNumber(a.headDead)} dead so far${p.deathsToCome > 0 ? ` · ${formatNumber(Math.round(p.deathsToCome))} more assumed` : ""}`
            )}
            {a.netMissing !== 0 &&
              row(
                a.netMissing > 0 ? "Missing" : "Strays back",
                a.missingLossUsd,
                a.missingLossUsd,
                a.netMissing > 0 ? `${formatNumber(a.missingOut)} written off at cost in` : `${formatNumber(a.strayIn)} back, credited at cost in`
              )}
            {a.transferInHead > 0 && row("Transferred in", a.transferInUsd, a.transferInUsd, `${formatNumber(a.transferInHead)} hd at the giving lot's cost`)}
            {a.transferOutHead > 0 && row("Transferred out", -a.transferOutUsd, -a.transferOutUsd, `${formatNumber(a.transferOutHead)} hd moved to another lot`)}
            {row("Medicine", a.medicine, a.medicine + p.medicineFwd, "processing + doctoring" + (a.otherMed > 0 ? " + other" : ""))}
            {a.feedInsideCog
              ? a.feedLedger > 0 && row("Feed (memo)", a.feedLedger, null, "inside cost of gain — not added")
              : (a.feed > 0 || p.feedFwd > 0) && row("Feed", a.feed, a.feed + p.feedFwd)}
            {row(
              "Cost of gain",
              a.cog,
              a.cog + p.cogFwd,
              a.nonFeedMissing
                ? "no non-feed rate set"
                : a.boundaryActive && a.hdBefore > 0
                  ? "split at the feed-direct boundary · non-feed after"
                  : a.cogSplit
                    ? "non-feed only"
                    : `$${(rates.cog ?? 0).toFixed(4)}/lb of gain`
            )}
            {row("Labor", a.labor, a.labor + p.laborFwd)}
            {row("Interest", a.interest + a.transferInterest, a.interest + a.transferInterest + p.interestFwd)}
            {row("Total cost", a.totalCost, p.totalCost)}
            {row("Revenue", a.revenue, p.totalRevenue)}
            {row("Net", null, p.net, undefined, (n) => formatMoney(n))}
            {row("Break-even $/lb", null, p.breakEvenPerLb, "at the projected finish weight", money4)}
          </TableBody>
        </Table>
      </Card>
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <p>
          Finish weight here is weight-in plus target days × target ADG, not the live calculator&apos;s anchored
          weight projection (unavailable in this read-only view) — Break-even $/lb can run higher or lower than the
          live Closeout screen for a lot without a whole-lot weighing on file. Every other figure on this table ties
          out exactly.
        </p>
        <p>
          Gain to date is priced at{" "}
          {a.estAdgSource === "realized"
            ? `the realized ADG on the ${formatNumber(a.soldWithWt)} head shipped with a pay weight`
            : a.estAdgSource === "weighing"
              ? "the newest whole-lot weighing"
              : "the target ADG (no realized weights or whole-lot weighing yet)"}
          , {a.estAdg.toFixed(2)} lb/day on the {formatNumber(Math.round(a.unsettledHeadDays))} head-days not yet weighed out.
          {a.gainClamped ? " Realized gain on the head already shipped came back negative and is charged as zero, never as a credit." : ""}
        </p>
        {a.unweighedSoldHead > 0 && (
          <p>{formatNumber(a.unweighedSoldHead)} head sold with no pay weight — their gain is still an estimate at the assumed ADG.</p>
        )}
        {p.doctoringOnFloor && <p>Doctoring projection is held at the assumed floor until actual plus observed burn passes it.</p>}
      </div>
    </div>
  );
}

function AuditLog({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) return <Empty>No history yet.</Empty>;
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Event</TableHead>
            <TableHead>From</TableHead>
            <TableHead>To</TableHead>
            <TableHead className="text-right">Head</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((e, i) => (
            <TableRow key={i}>
              <TableCell>{formatDate(e.date)}</TableCell>
              <TableCell>{e.label}</TableCell>
              <TableCell>{e.source_name ?? "—"}</TableCell>
              <TableCell>{e.dest_name ?? "—"}</TableCell>
              <TableCell className="text-right">{formatNumber(e.head)}</TableCell>
              <TableCell className="text-muted-foreground">{e.notes ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

export function LotDetailTabs({
  lot,
  status,
  locations,
  purchases,
  doctoring,
  deaths,
  headAdjustments,
  moves,
  transfers,
  sales,
  audit,
  activePastures,
  fieldActions,
  medicationCatalog,
  receivingProtocols,
  defaultProtocolId,
  unlinkedReceipts,
  pastBuyers,
  canWrite,
  isOwner,
  closeout,
}: {
  lot: LotRecord;
  status: LotStatusRecord | null;
  locations: CurrentLocation[];
  purchases: Invoice[];
  doctoring: DoctoringEvent[];
  deaths: DeathEvent[];
  headAdjustments: HeadAdjustment[];
  moves: MoveEvent[];
  transfers: LotTransfer[];
  sales: Sale[];
  audit: AuditEvent[];
  activePastures: ActivePasture[];
  fieldActions: FieldAction[];
  medicationCatalog: MedicationCatalogEntry[];
  receivingProtocols: ReceivingProtocol[];
  defaultProtocolId: string;
  unlinkedReceipts: UnlinkedReceipt[];
  pastBuyers: string[];
  canWrite: boolean;
  isOwner: boolean;
  closeout: { actual: CloseoutActual; proj: CloseoutProjection; rates: CloseoutRates } | null;
}) {
  const [active, setActive] = useState<SectionKey>("current");
  const tabs = TABS.filter((t) => !t.feedPenOnly || lot.is_feed_pen);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={
              "rounded-t-md px-3 py-2 text-sm font-medium transition-colors " +
              (active === t.key ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === "current" && <CurrentlyIn status={status} locations={locations} />}
      {active === "purchases" && (
        <Purchases
          lotId={lot.id}
          lotNumber={lot.lot_number}
          canWrite={canWrite}
          fiscalYear={lot.fiscal_year}
          activePastures={activePastures}
          protocols={receivingProtocols}
          defaultProtocolId={defaultProtocolId}
          purchases={purchases}
          unlinkedReceipts={unlinkedReceipts}
        />
      )}
      {active === "health" && (
        <AnimalHealth
          lotNumber={lot.lot_number}
          lotId={lot.id}
          canWrite={canWrite}
          isOwner={isOwner}
          lotClosed={!!lot.closed_at}
          lotIsFeedPen={!!lot.is_feed_pen}
          locations={locations}
          activePastures={activePastures}
          fieldActions={fieldActions}
          medicationCatalog={medicationCatalog}
          doctoring={doctoring}
          deaths={deaths}
          headAdjustments={headAdjustments}
        />
      )}
      {active === "moves" && (
        <Moves
          lotNumber={lot.lot_number}
          lotId={lot.id}
          canWrite={canWrite}
          isOwner={isOwner}
          headCurrent={status?.head_current ?? null}
          locations={locations}
          activePastures={activePastures}
          moves={moves}
          transfers={transfers}
        />
      )}
      {active === "sales" && (
        <Sales
          lotId={lot.id}
          lotNumber={lot.lot_number}
          canWrite={canWrite}
          isOwner={isOwner}
          activePastures={activePastures}
          pastBuyers={pastBuyers}
          sales={sales}
        />
      )}
      {active === "closeout" && <Closeout closeout={closeout} />}
      {active === "feedpen" && <NotYetMigrated label="Feed pen" />}
      {active === "audit" && <AuditLog events={audit} />}
    </div>
  );
}
