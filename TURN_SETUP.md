# Cloudflare TURN and Zalo — v0.7.2

Production uses Cloudflare Realtime TURN. The existing Worker secrets
`TURN_KEY_ID` and `TURN_KEY_API_TOKEN` are sufficient. Do not put the long-lived
API token in browser code or in the static TURN username/password fields.

The Worker requests two-hour browser credentials from Cloudflare, preserving
the provider's UDP, TCP and TLS/443 endpoints. Each call participant's response
is cached for five minutes to avoid issuing credentials on every signal poll.
Station and call-participant checks run before credentials can be obtained.
Kiosk callers fetch ICE configuration for each new peer instead of retaining
credentials indefinitely in the page. Calls longer than the two-hour credential
lifetime need to end and reconnect.

Existing static `TURN_URL`/`TURN_USERNAME`/`TURN_CREDENTIAL` configurations remain
supported when the Cloudflare key pair is absent.

## Health check

`/health` reports `turn_configured:true` when the Worker has a complete config.
`/health?check_turn=1` also checks whether short-lived credentials can be issued
and reports `turn_credentials_ready`. This check uses a fixed cache scope and
never exposes the generated credentials or the API token. It does not prove
that video or audio flows between two devices.

## Zalo

The previous browser-handoff prompt waited for a confirmation before either
registration or call setup could start in an in-app browser. It is now optional
help in a details control. Order entry and an explicitly opened support call
continue without that gate. Browser handoff still preserves the station QR and
ends the old call before opening an external browser.

Camera/microphone behavior still depends on the actual Zalo WebView and device
permissions. If it refuses capture, use the external-browser help. No real Zalo
device or two-network audio/video call was available for verification.

## Deployed and verified

- 2026-11-05: production Worker `ifc-01-handover-pilot`, version
  `1c968ca4-a5be-407a-bd31-885eaebf8a1f`, deployed with `--keep-vars`.
- Production returned `IFC_01_HANDOVER_0_7_2`, `turn_configured:true`, and
  `turn_credentials_ready:true`.
- Full test suite, Worker TypeScript, Next.js build, static-export checks and
  Wrangler dry-run passed. Unit tests cover credential caching/refresh,
  concurrent failures, token isolation, auth boundaries and nonblocking Zalo
  order entry.
- No database migration or production test-call fixtures were created.

Cloudflare Realtime's first 1,000 GB per month is included; usage above that
allowance is billed. Monitor billing in the existing Cloudflare account.
