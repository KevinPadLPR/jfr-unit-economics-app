"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { NotYetMigrated } from "@/components/app-shell/not-yet-migrated";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { LotRecord, LotStatusRecord, CurrentLocation } from "./data/lot";
import type { Invoice } from "./data/purchases";
import type { DoctoringEvent, DeathEvent, HeadAdjustment } from "./data/health";
import type { MoveEvent, LotTransfer } from "./data/moves";
import type { Sale } from "./data/sales";
import type { AuditEvent } from "./data/audit";
import type { ActivePasture } from "./data/reference";
import { HealthActionButtons } from "./health-actions";
import { MoveActionButton } from "./moves-actions";
import { DeleteEventButton } from "./delete-event-button";
import { deleteDeath, deleteHeadAdjustment } from "./actions/health";
import { deleteMove } from "./actions/moves";

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

function Purchases({ purchases }: { purchases: Invoice[] }) {
  if (purchases.length === 0) return <Empty>No purchase invoices on this lot yet.</Empty>;
  return (
    <div className="flex flex-col gap-4">
      {purchases.map((inv) => (
        <Card key={inv.id}>
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-foreground">
                Invoice {inv.invoice_number ?? inv.id.slice(0, 8)} · {formatDate(inv.invoice_date)}
              </span>
              <span className="text-sm text-muted-foreground">
                {formatNumber(inv.head_count)} hd · {inv.total_weight_lb != null ? `${formatNumber(inv.total_weight_lb)} lb` : "—"} ·{" "}
                {formatMoney(inv.total_cost)}
              </span>
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
      ))}
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
        <CardContent className="p-4 pb-0">
          <h3 className="text-sm font-semibold text-foreground">Doctoring ({doctoring.length})</h3>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {doctoring.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
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
                      <DeleteEventButton eventId={d.id} isOwner={isOwner} action={(eventId) => deleteDeath(lotNumber, eventId)} />
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
                      <DeleteEventButton eventId={h.id} isOwner={isOwner} action={(eventId) => deleteHeadAdjustment(lotNumber, eventId)} />
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
                      <DeleteEventButton eventId={m.id} isOwner={isOwner} action={(eventId) => deleteMove(lotNumber, eventId)} />
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

function Sales({ sales }: { sales: Sale[] }) {
  if (sales.length === 0) return <Empty>No sales yet.</Empty>;
  return (
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
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
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
  canWrite,
  isOwner,
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
  canWrite: boolean;
  isOwner: boolean;
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
      {active === "purchases" && <Purchases purchases={purchases} />}
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
      {active === "sales" && <Sales sales={sales} />}
      {active === "closeout" && <NotYetMigrated label="Closeout" />}
      {active === "feedpen" && <NotYetMigrated label="Feed pen" />}
      {active === "audit" && <AuditLog events={audit} />}
    </div>
  );
}
