# Poscere UX updates — October 11, 2026

Implemented locally in the independent `lowhangingfruit26` checkout. Run at `http://127.0.0.1:3100`; restart and architecture instructions are in `LOCAL-SETUP.md`.

## Learner experience

- Home leads with the actual recommended patient, difficulty pips, next skill to practise, and a direct start action. Rating mathematics and course joining are secondary. Scores and trends come from released encounter data.
- Practice uses circular patient portraits and a consistent card for published and private generated patients. Difficulty is visible beside the primary action. Ongoing visits retain their existing difficulty. Retry variation and follow-ups remain available.
- Patient creation retains a three-step input form. Submitting closes the form and creates an inline generating card. Success refreshes the gallery with the real patient and a visit link, without automatically opening the encounter. Failures show an inline retry action. The elapsed timer is real; there is no simulated completion percentage.
- AI draft explanations float above the cards using native popovers, dismiss on Escape or outside click, and do not expand the card. Missing portraits fall back to circular initials.
- Care journeys show patient identity once, role counts, and an ordered care-team relay with emergency, cardiology, pharmacy, dietetics and general clinical icons. Student-facing names omit `: care journey` and continue to hide faculty diagnosis titles.
- My visits offers cards and a table, with one search across patient identity, participant name/email, profession, transcript and authored write-up. The REST search also accepts `q`; older field-specific API queries still work. Search preserves the original access restrictions and held-score rules.
- The encounter has task-oriented chart controls, a persistent identity/allergy/vitals strip, recent or full conversation views, and a notes field that carries into the write-up. Examination and test results continue to use the existing disclosure engine.
- Write-up uses one role-specific field per step, then a review of the student's own text. A per-tab draft survives reloads and is removed after submission. Scoring distinguishes waiting from actual server confirmation that the visit was saved; it does not invent examiner stages.
- The waiting room has microphone and patient-voice icon toggles with hover and keyboard-focus tooltips. The top-right highlighter toggles short phrases from the supplied briefing: timing, patient concern, and task instructions. It does not infer a diagnosis or add new facts.
- Feedback automatically links recognized clinical terms to plain definitions in floating, keyboard-accessible popovers. The glossary now contains 73 medical, learning and app entries, with source links for clinical definitions. Aliases include the terminology in the supplied example: polyuria, polydipsia, nocturia, enuresis, HbA1c, DKA, acanthosis nigricans, urinalysis and C-peptide.
- Next-attempt guidance highlights communication phrases in blue with a person symbol and chart-review phrases in green with a clipboard symbol. Rubric rationales distinguish strengths, gaps and partial success with green, red and orange emphasis.
- The examiner schema requests short `**emphasized phrases**` plus optional per-phrase tone metadata. Exact snippets and known tones are validated before display. Existing feedback receives conservative emphasis for explicit strengths/gaps without a new model request. Scores, evidence quotes and transcript wording are preserved; rendering never executes model-provided HTML.
- Learning preferences support reduced motion, optional plain-language help, and saved vocabulary per account in this browser. Turning help off preserves the medical words in the text. Clinical help in the live chart is disabled in exam mode.
- Progress retains the real rating model and adds actual released rubric-domain bars, recent-result sparklines and a next-focus action. Integrations and personal keys have a dedicated page.

## Verification

- Production build and TypeScript check pass.
- Eighteen regression checks pass, including the seven integration checks below: safe case-card projections, held scores and faculty overrides, universal-search matching and permissions, long-response completion/disconnection, term aliases, exact highlight validation, conservative legacy emphasis and briefing text preservation.
- Real browser checks cover populated desktop and mobile home/practice/journey pages, universal search, floating AI and medical definitions, Escape dismissal, vocabulary saving, plain-language toggle text preservation, audio icon state/hover help, and the selective briefing highlighter.
- A real generated patient changed from the inline placeholder into a populated card while remaining on Practice. A separate fictional demo visit streamed a patient reply, retained three authored write-up fields after reload, submitted successfully and produced seven-domain feedback.
- Mobile home, practice and journeys had equal document and viewport widths. A mobile medical popover stayed inside the viewport. No browser error was observed on the verified updated feedback page.
- Screenshots and command logs are local, ignored artifacts under `.local/`, including `ux-practice-desktop.png`, `ux-journeys-desktop.png`, `ux-feedback-glossary.png`, `ux-waiting-room-highlight.png`, `ux-audio-icon-tooltip.png`, and mobile equivalents.

Existing repository lint is not clean. The touched Visit component retains three pre-existing `set-state-in-effect` findings (the original also had a navigation-link error now resolved). The portrait component has a Next image-optimization warning. The build retains existing dynamic upload-path tracing warnings. Validation was performed locally; publication status is recorded in Git history.

## Boundaries

This is a UI implementation over the existing simulation and grading system, not evidence of clinical or educational validation. The dictionary is an explicit, extensible glossary rather than a comprehensive medical terminology service; unknown terms remain plain text. Repeated definitions are available where terms occur in separate feedback sections. Existing privacy, exam feedback-release rules, case disclosure and role-specific write-up fields remain in force.

The supplied design documents also suggest larger product experiments—facial emotion rendering, shared-element portrait transitions, a branching journey graph, clinical abnormal-value interpretation and alternative radar/ladder visualizations. Those are separate from the implemented flows above; no invented vitals, progress, emotions or completion milestones were introduced.

## Aryan integration and follow-up UI, October 11

Aryan’s main changes through `f693f69`, including retries for empty journey evaluations and percentage-point labels, are combined with the local redesign. The divergent teal-overhaul branch was excluded. Chart snapshots, searchable documents/results, session goals, hands-free microphone handling, comfort-reason explanations, and patient-ended calls are integrated. Conservative chart-visibility matching preserves negations and quantities, medicine concerns stay distinct, missing chart identities/dates remain unknown, and the ending write-up opens once per tab rather than trapping the learner.

The glossary now has 73 entries, including every built-in rubric/checklist focus area. Definitions open above the term on hover or keyboard focus. Control tooltips also open above their trigger without clicks, using a shared top-layer popover. Summary, strengths, improvements, and rubric evidence use selective emphasis. Model metadata decorates exact existing phrases; legacy feedback uses conservative patterns without rescoring.

Practice uses animated five-bar difficulty controls with a matching face icon beside them (ongoing visits remain fixed), a filter-button modal, and brief private-visit previews where no scored feedback exists. The cards retain aligned action rows. Dashboard course enrollment opens from a plus icon; “Why this patient?” is removed. Journey role briefs, visible record and instructions have an optional highlight toggle. Navigation underlines the active section, including nested pages. A camera-off call hides the self-view; the captions control uses a clear CC glyph.

Validation: 18 regression checks and TypeScript pass; production builds pass with the existing four upload-path tracing warnings. Focused lint for the new controls passes. Browser checks cover populated practice cards, filter changes, difficulty cycling, hover definitions, course dialog, summary emphasis, journey toggle, active section, camera-off self-view, captions toggle, and dismissal/reload of a patient-ended call. Evidence is stored outside the public repository in `.private/integration/aryan-2026-10-11/screenshots/`. Fixtures and builds use copies of the live SQLite database; fixture data is never copied into the live database. No provider call or microphone/camera permission is performed for this integration validation.

The face represents the selected interview challenge: approachable, open, reserved, guarded, or very guarded. It updates with the bars and explains disclosure, trust and hints on hover/focus. Difficulty does not change the case facts or time limit; the icon does not claim to predict an actual patient mood. No private persona data is added to student cards.

Settings now opens with a collapsed Dictionary button, showing entry/saved counts. Expanding it reveals saved vocabulary and a searchable glossary. The visible Integrations link carries local ChatGPT and Claude SVG logos; the integration page shares these marks and adds connection/key icons. Existing key creation and access permissions are unchanged. Browser checks covered expansion, searching for melena, collapse, navigation, Escape and a narrow viewport. No access key was created for validation.

Publication integration also retains Aryan’s `f693f69` class join links/QR sharing, enrollment confirmation, desktop notice and mobile Conversation/Patient chart tabs. The previous mobile stack overrides were removed so the tabs can show one pane at a time while retaining the note composer, captions glyph, camera-off behavior and hover help.
