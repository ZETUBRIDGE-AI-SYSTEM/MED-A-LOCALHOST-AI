---
name: Local Ollama deployment
description: The current deployment target and its capacity boundary.
---

MED-A is currently intended to run on one local laptop with Ollama, not on hosted GPU infrastructure.

**Why:** The user confirmed the local-laptop target while discussing support for many simultaneous users.

**How to apply:** Optimize local concurrency and queue behavior, but do not promise instant answers for hundreds of users from one laptop. Treat hosted GPU inference as a separate architecture change if the deployment target changes.
