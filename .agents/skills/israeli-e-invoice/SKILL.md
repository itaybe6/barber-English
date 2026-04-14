---
name: israeli-e-invoice
description: Generate, validate, and manage Israeli e-invoices (hashbonit electronit) per Tax Authority (SHAAM) standards — including real-time allocation number (מספר הקצאה) via SHAAM APIs. Use when user asks to create Israeli invoices, request allocation numbers, validate invoice compliance, or asks about "hashbonit", "e-invoice", "SHAAM", "allocation number", or Israeli invoicing requirements. Supports tax invoice (300), tax invoice/receipt (305), credit invoice (310), receipt (320), and proforma (330) types. Do NOT use for general accounting, bookkeeping, or non-Israeli invoice formats.
license: MIT
compatibility: Requires network access for SHAAM API calls. Works with Claude Code, Claude.ai, Cursor.
---

# Israeli E-Invoice

## Instructions

### Step 1: Determine Invoice Type
Ask the user what type of document they need:

| Code | Hebrew | English | When to Use |
|------|--------|---------|-------------|
| 300 | hashbonit mas | Tax Invoice | B2B sales, services over threshold |
| 305 | hashbonit mas / kabala | Tax Invoice / Receipt | B2C with immediate payment |
| 310 | hashbonit zikui | Credit Invoice | Refunds, corrections, returns |
| 320 | kabala | Receipt | Payment confirmation only |
| 330 | hashbonit proforma | Proforma Invoice | Quotes, pre-billing (no allocation needed) |

### Step 2: Collect Required Fields
For all invoice types, gather:
- **Seller details:** Business name, TIN (mispar osek), address, phone
- **Buyer details:** Business name (or individual), TIN (if B2B), address
- **Transaction:** Date, item descriptions, quantities, unit prices
- **Payment:** Method (cash, transfer, check, credit card), terms

### Step 3: Calculate VAT
- Standard Israeli VAT rate: **18%** (as of 2025, verify current rate)
- VAT calculation: `vat_amount = net_amount * 0.18`
- Total: `gross_amount = net_amount + vat_amount`
- For VAT-exempt transactions (osek patur), no VAT line -- use receipt (320) instead

### Step 4: Allocation number (מספר הקצאה) — the most important part today
For transactions **above the legal threshold**, the document must include an **allocation number** obtained **in real time** from the Israel Tax Authority systems (**SHAAM / שע״מ**). This skill is designed to guide and structure **calls to SHAAM’s servers** (OAuth2 + allocation endpoints) so you can retrieve that number for the user — see `references/shaam-api-reference.md` for request/response shapes and authentication.

**How the threshold is measured (critical):** compare the **amount before VAT** (לפני מע״מ, net of VAT), not the gross total.

**Threshold timeline (amount before VAT):**
- **2024 through December 2025:** from **25,000 NIS** and above → allocation required when rules apply (classic rule users still cite for “today”).
- **From January 2026:** **10,000 NIS** and above (before VAT).
- **From June 2026:** **5,000 NIS** and above (before VAT).

**When allocation applies:** for mandatory e-invoice types **300, 305, and 310** when the transaction is at or above the threshold for the document date. **320** (receipt) and **330** (proforma) are generally outside the same allocation rules as tax invoices — confirm current law for edge cases.

**If allocation is required:**
1. Use the SHAAM API flow (this skill + `references/shaam-api-reference.md`) to request the number **before or as part of** issuing the document, as required by procedure.
2. Print or embed the allocation number on the invoice/receipt sent to the customer.
3. Keep evidence of the request/response where your compliance process requires it.

**If allocation is not required:** proceed without an allocation line; still use a proper sequential document number from the seller’s series.

### Step 5: Generate Invoice Document
Create the invoice with all fields formatted per Israeli standards:
- Date in both Gregorian (DD/MM/YYYY) and Hebrew calendar
- Amounts in NIS (New Israeli Shekel)
- VAT breakdown as separate line
- Sequential invoice number from seller's series
- Allocation number (if applicable)

### Step 6: Validate
Run validation checks:
1. All required fields present
2. TIN format valid (9 digits with check digit)
3. VAT calculation correct
4. Invoice number sequential
5. Date not in the future
6. Allocation number present if above threshold

If validation fails, report specific errors and how to fix them.

## Examples

### Example 1: Simple B2B Tax Invoice
User says: "Create a tax invoice for a web development project, 30,000 NIS (before VAT) to ABC Ltd" (document date in 2025)
Actions:
1. Identify: Tax Invoice (type 300), net **above** 25,000 NIS threshold → **allocation from SHAAM required**
2. Collect: Seller and buyer details
3. Calculate: Net 30,000 + VAT at current rate = gross total
4. Call / guide: SHAAM allocation API (`references/shaam-api-reference.md`), then issue document with מספר הקצאה
5. Generate: Formatted invoice document
Result: Tax invoice with allocation number and sequential seller number

### Example 2: Small B2C Receipt
User says: "I need a receipt for a 500 NIS cash payment"
Actions:
1. Identify: Receipt (type 320), below threshold -- no allocation needed
2. Collect: Seller and buyer details
3. Generate: Receipt document
Result: Simple receipt, no allocation number required

### Example 3: Credit Invoice for Refund
User says: "I need to issue a credit note for invoice #1234, partial refund of 3,000 NIS"
Actions:
1. Identify: Credit Invoice (type 310)
2. Reference: Original invoice #1234
3. Calculate: Credit amount with VAT reversal
4. Check: Allocation requirement based on amount
Result: Credit invoice referencing original, with correct VAT reversal

## Bundled Resources

### Scripts
- `scripts/validate_invoice.py` — Validates Israeli e-invoice JSON against SHAAM requirements: checks required fields, TIN (mispar osek) format and check digit, invoice type codes, VAT calculation accuracy, and allocation number thresholds. Also referenced in Troubleshooting below. Run: `python scripts/validate_invoice.py --help`

### References
- `references/shaam-api-reference.md` — SHAAM (Tax Authority) API endpoints for requesting allocation numbers, OAuth2 authentication setup, and request/response formats. Consult when integrating with the SHAAM e-invoice API. Also referenced in Step 4 above.
- `references/invoice-types.md` — Complete listing of Israeli invoice type codes (300, 305, 310, 320, 330, 400) with required fields per type, VAT applicability, and allocation number requirements. Consult when determining which invoice type to use.
- `references/compliance-timeline.md` — Progressive e-invoice mandate timeline per Amendment 157 to the VAT Law, showing threshold reductions from 25,000 NIS down to all invoices. Consult when checking current allocation number thresholds.

## Gotchas

- Allocation numbers are issued by **SHAAM** (רשות המסים / Tax Authority). For amounts **above the threshold before VAT**, follow the API in `references/shaam-api-reference.md` so the document includes a **real-time** allocation when the law and timeline require it.
- Israeli TIN (Tax Identification Number) for individuals is 9 digits with a check digit algorithm. Agents may not validate the check digit and accept invalid TINs.
- **Do not confuse document types:** **300** = tax invoice; **305** = tax invoice / receipt; **320** = receipt only. They have different legal effects (e.g. timing of payment vs. VAT invoice).
- Israeli e-invoice XML schemas follow SHAAM-specific standards, not the European Peppol or UBL formats. Agents may attempt to use international e-invoice standards that are not accepted by the Israeli Tax Authority.
- Credit notes (cheshbonit zikui) in Israel must reference the original invoice number. Agents may generate standalone credit notes without the required linkage.

## Troubleshooting

### Error: "Invalid TIN format"
Cause: Israeli TIN (mispar osek) must be exactly 9 digits with valid check digit
Solution: Verify the number with the check digit algorithm. Run scripts/validate_invoice.py for validation.

### Error: "Allocation number required"
Cause: Invoice amount exceeds current threshold for mandatory allocation
Solution: Request allocation number from SHAAM API before issuing invoice. See Step 4.

### Error: "VAT rate mismatch"
Cause: Using incorrect VAT rate (rate changes periodically)
Solution: Verify current rate at the Tax Authority website. Standard rate is 18% as of 2025.

### Error: "Invoice type not suitable"
Cause: Wrong invoice type selected for the transaction
Solution: Review the invoice type table in Step 1. Common mistake: using type 300 when 305 (with receipt) is needed for immediate payment.