/**
 * Ported from the invoice save handler's one guard that still applies without the reconcile
 * checklist (index.html:10288-10297, the "no reconcile touches" branch -- this phase never
 * changes which receipts are linked, so the reconcile-selection branch never applies): an
 * invoice's head_count must equal the sum of whatever delivery_receipts are already linked to
 * it. An invoice with nothing linked yet (new, or never reconciled) is allowed through --
 * "orphan invoices are allowed for things like the drift_recon adjustment."
 */
export function checkInvoiceHeadCount(invoiceHead: number, linkedReceiptHeadCounts: (number | null)[]): string | null {
  if (linkedReceiptHeadCounts.length === 0) return null;
  const sum = linkedReceiptHeadCounts.reduce((s: number, h) => s + Number(h ?? 0), 0);
  if (sum !== invoiceHead) {
    return (
      `Invoice head count (${invoiceHead}) must equal the linked load-outs total (${sum} from ` +
      `${linkedReceiptHeadCounts.length} load-out${linkedReceiptHeadCounts.length === 1 ? "" : "s"}). ` +
      "Adjust head count or change which load-outs are linked."
    );
  }
  return null;
}
