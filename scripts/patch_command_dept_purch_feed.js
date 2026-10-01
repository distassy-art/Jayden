/**
 * Command Center category YoY — store daily overlay when dept category purch is unreliable.
 * Inject in commandYoyBlockHtml (or equivalent) when rendering each store `st` from
 * command-category-yoy.json.
 *
 *   var dailyLine = '';
 *   if (st.storeDailySalesMtd != null && st.storeDailyPurchMtd != null) {
 *     var m = st.storeDailyMarginMtd != null ? (st.storeDailyMarginMtd * 100).toFixed(1) + '%' : '—';
 *     dailyLine = '<p class="hint cc-daily-mtd"><strong>Store daily MTD</strong> (through ' +
 *       esc(st.storeDailyThrough || pack.asOf) + '): sales ' + money(st.storeDailySalesMtd) +
 *       ' · purchase ' + money(st.storeDailyPurchMtd) + ' · margin ' + m +
 *       ' — use for margin decisions when dept purchases are incomplete.</p>';
 *   }
 *   var feedWarn = '';
 *   if (st.deptPurchFeedReliable === false && st.deptPurchFeedNote) {
 *     feedWarn = '<p class="cc-perf cc-perf-watch" style="margin:8px 0">' +
 *       esc(st.deptPurchFeedNote) + '</p>';
 *   }
 *   // Prepend dailyLine + feedWarn before category tables for this store.
 */
