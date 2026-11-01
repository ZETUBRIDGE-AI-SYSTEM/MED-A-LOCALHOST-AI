---
name: Subscription verification boundary
description: What the payment reference does and what must be supplied by the host app.
---

The payment reference establishes the client-side contract: read `user_email` from local storage, create/reuse `device_id`, and send both to a server-side authorization function. It does not contain the implementation of that function or a provider URL.

For laptop installations, the user chose to keep the ZetuBridge subscription check. Question generation may use local Ollama, but access verification still needs an internet connection.

The API server is the authority for subscription checks. The browser may use the saved email and device ID to start a request, but a duplicate browser preflight adds another network wait without replacing the server-side check.

**Why:** The user explicitly chose to preserve the paid-access policy for local use rather than bypass it for offline operation.

**How to apply:** Preserve the local-storage contract when adding protected features, keep identity fields out of user-facing forms, and do not add an offline allow fallback unless the user changes this policy. Keep authorization enforcement on the server and avoid serial duplicate preflight requests.