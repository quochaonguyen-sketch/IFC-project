# Video call fix — v0.7.1

The QR call expires one hour after creation. Previously the support inbox hid it,
but its `accepted` row still prevented that agent from accepting another call.
Acceptance now cancels expired QR calls belonging to that agent in the same D1
transaction as the new acceptance. Kiosk calls retain their existing lifecycle.

Repeated acceptance by the same agent resumes the same call. Other conflicts
report whether the agent is off duty, already busy, or the requested call has
ended. An agent's current call sorts ahead of waiting calls in each station.
The support page prevents overlapping acceptance requests and preserves its
last complete inbox if a station request fails.

Production uses this Next.js project and its generated `out/` assets.

## Production deployment

Use the existing authenticated Cloudflare account and the checked-in Worker/D1
configuration. This Worker belongs to Cloudflare account `d28a319d6d4b303f13c8682bef56520d`; set `CLOUDFLARE_ACCOUNT_ID` to that account when multiple accounts are available. No schema migration or operational reset is required for this fix.
Preserve the production variables, including ADMIN_EMAIL, with `--keep-vars`:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm typecheck
pnpm test:export
pnpm exec wrangler deploy --dry-run --keep-vars --outdir dist
pnpm exec wrangler deploy --keep-vars
```

Check `/health` for version `IFC_01_HANDOVER_0_7_1`. Reload `/support/` to load
`support.js?v=0.7.1`, enable duty, and receive a fresh rider call. Test picture
and sound between two devices on different networks separately. Production
reported `turn_configured:false` on 2026-11-04 before this release; this fix
does not provision a TURN service.

## Validation

Regression coverage includes an expired hidden QR lock, acceptance retry,
an active-call conflict, expired waiting calls, kiosk preservation, inbox
ordering, double-click acceptance, overlapping inbox refreshes, and network
failure recovery. The existing rider flow remains unchanged.

Deployed on 2026-11-04 to the existing production Worker, version
`db865a11-f6d3-4293-b95f-3df3ffa9261f`, with `--keep-vars`.
The production health endpoint reports `IFC_01_HANDOVER_0_7_1`.

No laptop UI control or real two-device media call was used for verification.
