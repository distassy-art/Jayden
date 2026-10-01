/**
 * Optional Command Center UI (inject via ss-owner-budget or worker patch):
 * In commandYoyBlockHtml, after `var month = pack.latestBooksMonth || pack.asOf || '';`
 * and when `st` is found, add:
 *
 *   var deptThrough = st.deptDataThrough || pack.asOf || '';
 *   var staleBadge = (st.deptDataStale || (deptThrough && pack.asOf && deptThrough < pack.asOf))
 *     ? (' <span class="cc-perf cc-perf-watch" title="Dept books through ' + deptThrough + '; file as-of ' + pack.asOf + '">DEPT STALE</span>')
 *     : '';
 *   if (st.lyBaselineMissing) staleBadge += ' <span class="cc-perf cc-perf-watch">NO LY BASELINE</span>';
 *
 * Then append staleBadge to the Categories at risk heading.
 */
