/**
 * Direct port of src/app/rancher/page.tsx (+ the still-relevant parts of
 * rancher-header.tsx's RancherGate: greeting + sign-out). Read-only
 * operational view for the "rancher" tier (client role "crew"). Deliberately
 * excludes $ cost/revenue and market/hedge position data -- those stay
 * admin-only, same as the Next.js version.
 */
import { requireSession, signOut } from "../auth.js";
import { listGlLots } from "../data/cost-of-gain.js";
import { formatNumber } from "../format.js";
import { showError, escapeHtml } from "../dom.js";

const main = document.getElementById("main");

async function render() {
  const user = await requireSession(); // no tier restriction -- admin tiers may view this page too

  let lots;
  try {
    lots = (await listGlLots()).filter((l) => (l.status ?? "").toLowerCase() === "open");
  } catch (err) {
    showError(main, err);
    return;
  }

  main.innerHTML = `
    <img src="/public/brand/logo-lockup.svg" alt="JFR Ranch" width="140" height="122" />
    <div class="card w-full max-w-4xl">
      <div class="card-header card-header-row">
        <div>
          <h3 class="card-title">Hi, ${escapeHtml(user.name)}</h3>
          <p class="card-description">Your open lots — read-only</p>
        </div>
        <button type="button" class="btn btn-outline" id="sign-out-btn">Sign out</button>
      </div>
      <div class="card-content stack">
        <p class="text-sm text-muted-foreground">
          This is a read-only view. To log weights, deaths, moves, or health events, keep using
          the field app the way you do today — those updates flow into this dashboard automatically.
        </p>
        <div class="card" style="overflow:hidden">
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Lot</th><th>Feed type</th><th>Location</th><th class="text-right">Head on hand</th><th class="text-right">Avg DOF</th></tr></thead>
              <tbody>
                ${lots
                  .map(
                    (l) => `
                  <tr>
                    <td class="font-medium">${escapeHtml(l.lot)}</td>
                    <td>${l.feed_type ? escapeHtml(l.feed_type) : "—"}</td>
                    <td>${l.location_type ? escapeHtml(l.location_type) : "—"}</td>
                    <td class="text-right">${l.head_on_hand != null ? formatNumber(l.head_on_hand) : "—"}</td>
                    <td class="text-right">${l.avg_dof != null ? formatNumber(l.avg_dof) : "—"}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById("sign-out-btn").addEventListener("click", signOut);
}

render();
