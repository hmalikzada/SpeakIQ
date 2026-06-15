# ClauseGuard

AI auditor that cross-references a vendor contract against that vendor's
invoices and flags every place money is leaking: overcharges, escalator
violations, missed discounts, duplicate fees, and auto-renewal risk.

## How it works

1. **Extract** — GPT-4o reads the contract and pulls out pricing tiers,
   escalator caps, discounts, fees, and renewal terms as structured JSON
   (`lib/extract.js`).
2. **Extract** — GPT-4o reads each invoice and pulls out line items, dates,
   and totals as structured JSON (`lib/extract.js`).
3. **Match** — GPT-4o compares the contract terms against the invoice line
   items and returns a list of findings, each with a dollar impact, the
   contract clause it violates, the invoice line that proves it, and a
   recommended action (`lib/matcher.js`).
4. **Summarize** — monthly/annual $ impact is totaled and a suggested
   25% contingency fee is calculated (`lib/matcher.js`).

## Run it

```bash
npm install
cp .env.example .env   # then add your OPENAI_API_KEY
npm start
```

Open http://localhost:3001

Click **"Try sample data"** to run the bundled demo contract + MOU +
invoice (`samples/`), which contains four intentional issues:

- An escalator-cap violation (rate increased >3% year-over-year)
- A missed "Premium Support included" discount
- A duplicate one-time setup fee
- A missed 5% loyalty discount granted by the MOU amendment

Or upload your own documents via the three-step form: the contract
(PDF/.txt), any MOUs/amendments/side letters (optional, up to 10), and
the invoices to check (PDF/.txt/.csv, up to 10). Amendment terms
override the base contract during extraction. The analysis returns an
executive-summary audit memo plus severity-ranked findings.

## Notes on this prototype

- Files are processed in memory and never written to disk.
- The extraction/matching prompts ask the model to only report issues
  supported by the evidence in the documents — but this is a prototype,
  so always have a human verify findings before acting on them.
- For a real engagement, the next steps would be: persistent storage for
  contracts/invoices per client, recurring monthly re-analysis as new
  invoices arrive, and an export/report view for the client's finance team.
