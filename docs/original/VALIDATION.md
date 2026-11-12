# Validation — IFC 0.7.0

- Node.js 24.22.1; npm install completed; package-lock included.
- `npm test`: passed backend workflows, Firebase-format tokens, permissions, guest signaling, old calling page, new rider UI, and audio checks.
- New SQL cases: minimum 3 characters; longer/full and Shopee order codes; case-insensitive exact suffix; collision refusal; duplicate aliases; QR warehouse isolation; held-order refusal; atomic registration under concurrency; retry of lost response; session-bound receipts.
- Existing workflows verified: hold, BOX/skip, pick, exact final scan, sorting batch, cancellation, rollback, locks and shared sequences.
- New UI exercised using a DOM test harness: name, short/ambiguous/valid input, review, lost submission response, same-token retry, receipt, support frame and preserving draft.
- 37 WAV files generated and checked for valid WAV headers, nonempty PCM frames and nonzero audio samples. Synthesis uses string CLI parameters to avoid silent numeric-option output in text2wav.
- `npx tsc --noEmit`: passed.
- `npx wrangler deploy --dry-run`: passed, including configured DB, Durable Object and static assets.
- Browser preview unavailable: local Wrangler failed with `uv_interface_addresses` in this environment. No real-browser visual QA, real-phone audio check, production Firebase sign-in or real two-network media call performed.
- No deployment or production database writes performed during development. Preview seed data stays outside this ZIP.
