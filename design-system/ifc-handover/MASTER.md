# IFC Handover — visual system

Internal warehouse operations, rider self-service, administration and call desk.

Based on the ui-ux-pro-max Minimalism & Swiss Style result for logistics operations: neutral surfaces, clear hierarchy, restrained shadows, visible keyboard focus and consistent spacing. Its marketing-page suggestions do not apply to the operational application.

- Shared implementation: `public/ui/system.css`, loaded after retained functional styles by `OperationalDocument`.
- Deep navy navigation `#172b43`; warm orange primary `#c7441c`; white surface; neutral background `#f5f6f8`.
- Body text `#172b43`; secondary text `#596778`. Destructive red `#b42318`; success green `#14734e`.
- System font Segoe UI / Arial supports Vietnamese without a network font dependency. Tabular numerals for counters and data.
- 4/8px spacing, 8px controls, 12px cards. Desktop body 15px, form input 16px minimum, touch targets at least 44px.
- Primary action filled orange; secondary actions white with border; destructive actions soft red. State labels retain words, not only colors.
- Matching package logo and stroked SVG icons; no decorative emoji in main navigation and primary actions.
- Desktop sidebar 252px; tablet navigation reflows; 375px layouts stack fields and keep tables in their own horizontal scroll area.
- Preserve operational IDs, form types, authentication, camera permissions, pending submissions, warning states and print behavior.
- Reduced motion disables decorative animation; keyboard controls retain visible focus.

User-approved warehouse override (2026-11-06): desktop /, /mobile/ and /location-tools/ restore the original VNWL frontend theme. Their layouts use legacyVisual and their own next-styles CSS; do not apply the shared system.css or the interim handover-colors override there. Customer Service, rider and other routes retain the current shared theme. Preserve server permissions and the restored receive → BOX/skip → picked → scan workflow.
