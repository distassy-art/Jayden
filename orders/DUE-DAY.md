# Orders due day

GitHub is the order list. Update this repo. The files under `orders/ledger/` are the history.

## When to start

Start at 4:00 AM America/Los_Angeles on the due day so every store’s order for that vendor is on the GitHub list by 6:00 AM the same morning. Delivery days stay as they are in `orders/ledger/order-calendar.json`.

| Vendor | Due day | Ready by | What to do |
|---|---|---|---|
| Harbor | Monday | 6:00 AM PT | Build the Monday Harbor order for every store on the calendar. Brookhurst delivery is Tuesday. Every other store’s delivery is Wednesday. |
| Coke | Wednesday | 6:00 AM PT | Build the Wednesday Coke order. Save a My Coke draft only. Leave it unsubmitted. |
| Pepsi | Thursday | 6:00 AM PT | Build the Thursday Pepsi order. |
| Core-Mark | Saturday | 6:00 AM PT | Build the Saturday Core-Mark order for every store. Save the Customer First draft. Leave it unsubmitted until Mina confirms. |

Orders are sent from `orders@smartsolutionsai26.onmicrosoft.com`.

## Same rules on every due day

1. Read `orders/ledger/shell-orders.json` and `orders/ledger/live-sends-document.json` first. Those rows stay.
2. The identity of an order is `storeId + vendor + date` (`YYYY-MM-DD`). Vendors match as coke, pepsi, coremark, harbor, or the other vendor name with punctuation removed.
3. If that identity is already in the shell or the live sends, leave the amount, date, PDF, and status exactly as they are.
4. If that identity is missing, and a charge file or a PDF already on the site has the amount, add one object to `orders/ledger/pending-appends.json`.
5. Run `node orders/merge.mjs`. It refuses to change a current send. Commit the result on a `cursor/` branch and open a pull request. Push to GitHub before calling the list updated.
6. Attach `pdfName` only when `https://smartsolutionsai.us/web/orders/pdfs/<name>` returns the PDF. Leave the link off when the file is absent.
7. Leave billing invoices alone. A row on this list is not a new invoice line.
8. Leave the books audit on its own three-day midnight timer.

## Saturday 2026-09-26

Core-Mark’s day arrived. There was no new Saturday charge file, so no 2026-09-26 Core-Mark amount was invented. Eighteen older orders whose store, vendor, and date were missing were appended. The 25 live sends and the shell orders were copied through unchanged.
