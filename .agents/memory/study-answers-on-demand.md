---
name: Study answers on demand
description: Product rule for when MED-A prepares correctness keys, explanations, and model answers.
---

Question generation must not prepare explanations, worked solutions, or short-/long-answer model answers in the background. Multiple-choice questions are the exception for the correct option only: it must be available with the options so the learner gets immediate right/wrong feedback. Generate explanations and written model answers only after the learner clicks the matching action.

**Why:** The user explicitly wants question pages to load without waiting for unused answers, while retaining immediate MCQ marking.

**How to apply:** Keep every question-generation endpoint question-only, blank any answer fields not needed for MCQ marking, and use the authorized on-demand answer stream after a click.
