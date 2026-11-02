# Patch Qualification 1.3.4

Scope: record-window close performance and reusable DialogV2 form-control layout.

- Record windows remain resizable and preserve geometry.
- Closing does not await the client settings write.
- Results are resolved after the ApplicationV2 close lifecycle completes.
- Share Insight names have explicit contrast.
- Dialog text controls use min-width zero, border-box sizing, full bounded inline width, zero external margin, and balanced padding.
- Other official modules contain no equivalent free-text DialogV2 controls and required no patch for this issue.
