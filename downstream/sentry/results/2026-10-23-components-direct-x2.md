# Sentry downstream: `components-direct-x2` (2026-10-23)

> **TRIAGE MODE (`--triage`)**: ctrl-dom modes ran with workarounds for blockers already filed in TRIAGE.md (navigator.platform "", writable navigator.clipboard, index-getter tables pre-warmed before the isolation baseline, pending host timers cleared at teardown) to look past them. These are not compatibility results.

- upstream: https://github.com/getsentry/sentry @ `503ad2e4e2a208a87d768a3e91bcfb55a778e7ba` (2026-10-23T13:58:39Z) — fix(agents): Avoid repeated user turns during tool continuations (#128645)
- pinned: `503ad2e4e2a208a87d768a3e91bcfb55a778e7ba`
- selection: `static/app/components/`
- node v26.12.1, Jest workers 6 (same for every mode), runs per mode 2 (interleaved; timings are medians, counts from the last run), CI=true (upstream's CI code paths), no forced GC
- upstream versions: jest@30.5.1, jsdom@30.1.1, react@19.3.0, react-dom@19.3.0, @swc/jest@0.2.39, @testing-library/react@16.3.2, @testing-library/dom@10.4.1, @testing-library/user-event@14.6.7, @testing-library/jest-dom@7.0.1, @sentry/jest-environment@8.1.0, @floating-ui/react-dom@2.1.9
- ctrl-dom-full substitutes: @testing-library/react, @testing-library/dom, @testing-library/user-event, @testing-library/jest-dom (packages/*/dist/*.cjs)
- ctrl-dom-nohacks is an **experiment**: ctrl-dom-full plus harness/nohacks.ts undoing upstream's getComputedStyle / Floating UI / matchMedia / IntersectionObserver hacks.

## Per-mode results

| mode | passed | failed | skipped | total | files | suite errors | exit | wall | CPU | peak tree RSS | peak process RSS | env setup / file (median, p95) | receipts | notes |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |
| jsdom | 6429 | 0 | 3 | 6432 | 653 | 0 | 0 | 70.4s | 375.4s | 7689 MiB | 1506 MiB | 9 ms, 25 ms | 653/653 | RTL: stock |
| ctrl-dom | 6357 | 72 | 3 | 6432 | 653 | 0 | 1 | 57.1s | 347.9s | 7724 MiB | 1591 MiB | 8 ms, 12 ms | 653/653 | 1 React; RTL: stock |
| ctrl-dom-direct | 6357 | 72 | 3 | 6432 | 653 | 0 | 1 | 61.0s | 314.4s | 6858 MiB | 1429 MiB | 7 ms, 14 ms | 653/653 | 1 React; RTL: stock |

<details><summary>individual runs</summary>

| mode | run | wall | CPU | peak tree RSS |
| --- | --: | --: | --: | --: |
| jsdom | 1 | 63.6s | 367.5s | 8359 MiB |
| ctrl-dom | 1 | 57.6s | 349.2s | 8245 MiB |
| ctrl-dom-direct | 1 | 55.7s | 320.9s | 7354 MiB |
| jsdom | 2 | 77.2s | 383.3s | 7020 MiB |
| ctrl-dom | 2 | 56.5s | 346.7s | 7204 MiB |
| ctrl-dom-direct | 2 | 66.3s | 308.0s | 6363 MiB |

</details>

## Jest worker memory across files

Sampled after each test file's environment teardown in every worker (no forced GC, so heap numbers include garbage). Slope = least-squares growth per file over each worker's files (first file excluded), median across workers. Upstream sets no `workerIdleMemoryLimit`.

| mode | workers | files/worker | heap after 1st file | heap after last file | heap growth/file | RSS growth/file | RSS after last file | max worker RSS |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| jsdom | 6 | 124 | 285 MiB | 590 MiB | -2.23 MiB | 2.00 MiB | 1162 MiB | 1351 MiB |
| ctrl-dom | 6 | 118.5 | 139 MiB | 689 MiB | 0.04 MiB | 3.24 MiB | 1094 MiB | 1456 MiB |
| ctrl-dom-direct | 6 | 115 | 179 MiB | 902 MiB | 2.00 MiB | 1.26 MiB | 893 MiB | 1391 MiB |

## jsdom

No failing tests.

## ctrl-dom

Compared with jsdom: **72 pass on jsdom but fail here**, 0 missing (e.g. suite errors), 0 added, 0 fail on jsdom but pass here.

<details><summary>pass on jsdom, fail here (72)</summary>

- `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` — Error: expect(jest.fn()).toHaveBeenCalled()
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard renders feedback from pr_iteration blocks` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard renders the latest feedback at the top of the list` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard shows the code changes, not the loader, when feedback is only queued` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard renders queued feedback as a feedback item` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard renders queued feedback with missing source attribution` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard renders GitHub PR review comment feedback with attribution and a link` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard strips markup and markdown syntax from bot comments` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard collapses a long comment into a disclosure` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard does not collapse a short comment` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard groups a review body with its inline comments under a state header` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard shows a state badge for a body-only review` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard falls back to the GitHub glyph when the review body has no author login` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard leaves a comment-only review (no body) ungrouped` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard shows a formatted check-suite label instead of the raw feedback text` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard links check-suite feedback to the failing check suite` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard renders a one-based version tag for the latest iteration` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard shows the iterating loading message when processing a pr_iteration` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard marks block feedback as processed when the section is not processing` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard marks the current iteration feedback as in progress while processing` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard marks queued feedback with a queued label and no timestamp` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard shows the PR iteration form mid-run when reset is requested` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/commandPalette/ui/featureFlagCommandPaletteActions.spec.tsx :: FeatureFlagCommandPaletteActions clears stored overrides from the command palette` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)
- `static/app/components/events/eventAttachments.spec.tsx :: EventAttachments can open attachment previews` — Unable to find an element with the text: file contents. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text mat
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown raw HTML strips script tags` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown raw HTML strips iframe tags` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown raw HTML strips form elements` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown raw HTML strips event handler attributes` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown raw HTML preserves safe inline HTML like sub and sup` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown safety is non-overridable custom Html receives sanitized content` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/chat/thinkingBlock.spec.tsx :: ThinkingBlock is expanded by default and collapses when endTime arrives` — Error: expect(element).not.toBeVisible()
- `static/app/components/core/chat/thinkingBlock.spec.tsx :: ThinkingBlock auto-collapses when thinking completes even if user re-expanded` — Error: expect(element).not.toBeVisible()
- `static/app/components/core/markdown/marked.spec.tsx :: markdownToPlainText flattens headings without leaving markdown syntax` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: markdownToPlainText keeps the visible text of inline markdown` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: markdownToPlainText strips HTML/XML tags but keeps their text` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: markdownToPlainText returns the code text for a fenced code block` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: markdownToPlainText returns an empty string for an empty code fence` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked normal links get rendered as html` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked renders inline code blocks` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked rejected links should be rendered as plain text` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked strips images from markdown output` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked escapes injections` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked allows custom html within code blocks` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked single line renderer should not render paragraphs` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked escapes injections via asyncSanitizedMarked` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked does not render syntax highlighting via sanitizedMarked` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked strips style tags` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked strips form elements` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked strips iframe, object, and embed tags` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked strips style attributes` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked strips event handler attributes` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked strips the id attribute` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked preserves allowed markdown HTML` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked strips dangerous tags via asyncSanitizedMarked` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked renders syntax highlighting via asyncSanitizedMarked` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked renders unknown language code blocks as plaintext via asyncSanitizedMarked` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/seer/markdown/embeds/components/dashboard.spec.tsx :: dashboard embed renders a live preview of the first two dashboard widgets` — console.* : TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/eventReplay/replayClipPreview.spec.tsx :: ReplayClipPreview Should have the correct time range` — TypeError: Cannot read properties of undefined (reading 'scheduledWith')
- `static/app/components/events/eventReplay/replayClipPreview.spec.tsx :: ReplayClipPreview Should link to the full replay correctly` — TypeError: Cannot read properties of undefined (reading 'scheduledWith')
- `static/app/components/events/eventReplay/replayClipPreview.spec.tsx :: ReplayClipPreview Display URL and breadcrumbs in fullscreen mode` — TypeError: Cannot read properties of undefined (reading 'scheduledWith')
- `static/app/components/ansiText.spec.tsx :: AnsiText resolves 256-color and truecolor codes to their RGB values` — Error: expect(received).toContain(expected) // indexOf
- `static/app/components/modals/widgetBuilder/addToDashboardModal.spec.tsx :: add to dashboard modal text widgets renders without making an events-stats request` — console.* : TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/modals/widgetBuilder/addToDashboardModal.spec.tsx :: add to dashboard modal text widgets adds a text widget to an existing dashboard without modifying queries` — console.* : TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/modals/widgetBuilder/addToDashboardModal.spec.tsx :: add to dashboard modal text widgets navigates to new dashboard with text widget in location state` — console.* : TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/modals/widgetBuilder/addToDashboardModal.spec.tsx :: add to dashboard modal text widgets navigates to the widget builder with text widget in session storage` — console.* : TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/seer/markdown/embeds/components/conversationsQuery.spec.tsx :: conversationsQuery embed previews matching conversations` — Unable to find an element with the text: Refund request escalated. This could be because the text is broken up by multiple elements. In this case, you can provide a function for yo
- `static/app/components/seer/markdown/embeds/components/conversationsQuery.spec.tsx :: conversationsQuery embed links each row to its conversation in a new tab` — Unable to find role="link" and name "Refund request escalated"
- `static/app/components/seer/markdown/embeds/components/conversationsQuery.spec.tsx :: conversationsQuery embed flattens a content-part first input when there is no title` — Unable to find an element with the text: I want a refund. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text m
- `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer fetches raw attachment bytes and renders UTF-16 text` — Unable to find an element with the text: A中. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to mak
- `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer renders colored text without escape codes when given ANSI colors` — Unable to find an element with the text: failed. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to
- `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer renders only the final write when given carriage-return progress updates` — Unable to find an element with the text: progress N%. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text mat
- `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer renders an error when the attachment cannot be downloaded` — Unable to find an element with the text: Failed to download attachment.. This could be because the text is broken up by multiple elements. In this case, you can provide a function 

</details>

### Failures by area

| area | failed |
| --- | --: |
| app/components/core | 33 |
| app/components/events | 29 |
| app/components/seer | 4 |
| app/components/modals | 4 |
| app/components/commandPalette | 1 |
| app/components/ansiText.spec.tsx | 1 |

### Failures by error signature

| count | signature | areas | example |
| --: | --- | --- | --- |
| 51 | TypeError: String.prototype.toLowerCase called on null or undefined | app/components/events, app/components/core | `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard renders feedback from pr_iteration blocks` |
| 5 | console.* : TypeError: String.prototype.toLowerCase called on null or undefined | app/components/seer, app/components/modals | `static/app/components/seer/markdown/embeds/components/dashboard.spec.tsx :: dashboard embed renders a live preview of the first two dashboard widgets` |
| 3 | TypeError: Cannot read properties of undefined (reading 'scheduledWith') | app/components/events | `static/app/components/events/eventReplay/replayClipPreview.spec.tsx :: ReplayClipPreview Should have the correct time range` |
| 2 | Error: expect(element).not.toBeVisible() | app/components/core | `static/app/components/core/chat/thinkingBlock.spec.tsx :: ThinkingBlock is expanded by default and collapses when endTime arrives` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalled() | app/components/core | `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalledWith(...expected) | app/components/commandPalette | `static/app/components/commandPalette/ui/featureFlagCommandPaletteActions.spec.tsx :: FeatureFlagCommandPaletteActions clears stored overrides from the command palette` |
| 1 | Unable to find an element with the text: file contents. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text mat | app/components/events | `static/app/components/events/eventAttachments.spec.tsx :: EventAttachments can open attachment previews` |
| 1 | Error: expect(received).toContain(expected) // indexOf | app/components/ansiText.spec.tsx | `static/app/components/ansiText.spec.tsx :: AnsiText resolves 256-color and truecolor codes to their RGB values` |
| 1 | Unable to find an element with the text: Refund request escalated. This could be because the text is broken up by multiple elements. In this case, you can provide a function for yo | app/components/seer | `static/app/components/seer/markdown/embeds/components/conversationsQuery.spec.tsx :: conversationsQuery embed previews matching conversations` |
| 1 | Unable to find role="link" and name "Refund request escalated" | app/components/seer | `static/app/components/seer/markdown/embeds/components/conversationsQuery.spec.tsx :: conversationsQuery embed links each row to its conversation in a new tab` |
| 1 | Unable to find an element with the text: I want a refund. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text m | app/components/seer | `static/app/components/seer/markdown/embeds/components/conversationsQuery.spec.tsx :: conversationsQuery embed flattens a content-part first input when there is no title` |
| 1 | Unable to find an element with the text: A中. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to mak | app/components/events | `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer fetches raw attachment bytes and renders UTF-16 text` |
| 1 | Unable to find an element with the text: failed. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to | app/components/events | `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer renders colored text without escape codes when given ANSI colors` |
| 1 | Unable to find an element with the text: progress N%. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text mat | app/components/events | `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer renders only the final write when given carriage-return progress updates` |
| 1 | Unable to find an element with the text: Failed to download attachment.. This could be because the text is broken up by multiple elements. In this case, you can provide a function  | app/components/events | `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer renders an error when the attachment cannot be downloaded` |

## ctrl-dom-direct

Compared with jsdom: **72 pass on jsdom but fail here**, 0 missing (e.g. suite errors), 0 added, 0 fail on jsdom but pass here.

<details><summary>pass on jsdom, fail here (72)</summary>

- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard renders feedback from pr_iteration blocks` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard renders the latest feedback at the top of the list` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard shows the code changes, not the loader, when feedback is only queued` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard renders queued feedback as a feedback item` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard renders queued feedback with missing source attribution` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard renders GitHub PR review comment feedback with attribution and a link` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard strips markup and markdown syntax from bot comments` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard collapses a long comment into a disclosure` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard does not collapse a short comment` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard groups a review body with its inline comments under a state header` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard shows a state badge for a body-only review` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard falls back to the GitHub glyph when the review body has no author login` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard leaves a comment-only review (no body) ungrouped` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard shows a formatted check-suite label instead of the raw feedback text` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard links check-suite feedback to the failing check suite` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard renders a one-based version tag for the latest iteration` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard shows the iterating loading message when processing a pr_iteration` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard marks block feedback as processed when the section is not processing` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard marks the current iteration feedback as in progress while processing` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard marks queued feedback with a queued label and no timestamp` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard shows the PR iteration form mid-run when reset is requested` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/commandPalette/ui/featureFlagCommandPaletteActions.spec.tsx :: FeatureFlagCommandPaletteActions clears stored overrides from the command palette` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)
- `static/app/components/events/eventAttachments.spec.tsx :: EventAttachments can open attachment previews` — Unable to find an element with the text: file contents. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text mat
- `static/app/components/modals/widgetBuilder/addToDashboardModal.spec.tsx :: add to dashboard modal text widgets renders without making an events-stats request` — console.* : TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/modals/widgetBuilder/addToDashboardModal.spec.tsx :: add to dashboard modal text widgets adds a text widget to an existing dashboard without modifying queries` — console.* : TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/modals/widgetBuilder/addToDashboardModal.spec.tsx :: add to dashboard modal text widgets navigates to new dashboard with text widget in location state` — console.* : TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/modals/widgetBuilder/addToDashboardModal.spec.tsx :: add to dashboard modal text widgets navigates to the widget builder with text widget in session storage` — console.* : TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/ansiText.spec.tsx :: AnsiText resolves 256-color and truecolor codes to their RGB values` — Error: expect(received).toContain(expected) // indexOf
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown raw HTML strips script tags` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown raw HTML strips iframe tags` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown raw HTML strips form elements` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown raw HTML strips event handler attributes` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown raw HTML preserves safe inline HTML like sub and sup` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown safety is non-overridable custom Html receives sanitized content` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/chat/thinkingBlock.spec.tsx :: ThinkingBlock is expanded by default and collapses when endTime arrives` — Error: expect(element).not.toBeVisible()
- `static/app/components/core/chat/thinkingBlock.spec.tsx :: ThinkingBlock auto-collapses when thinking completes even if user re-expanded` — Error: expect(element).not.toBeVisible()
- `static/app/components/core/markdown/marked.spec.tsx :: markdownToPlainText flattens headings without leaving markdown syntax` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: markdownToPlainText keeps the visible text of inline markdown` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: markdownToPlainText strips HTML/XML tags but keeps their text` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: markdownToPlainText returns the code text for a fenced code block` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: markdownToPlainText returns an empty string for an empty code fence` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked normal links get rendered as html` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked renders inline code blocks` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked rejected links should be rendered as plain text` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked strips images from markdown output` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked escapes injections` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked allows custom html within code blocks` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked single line renderer should not render paragraphs` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked escapes injections via asyncSanitizedMarked` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked does not render syntax highlighting via sanitizedMarked` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked strips style tags` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked strips form elements` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked strips iframe, object, and embed tags` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked strips style attributes` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked strips event handler attributes` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked strips the id attribute` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked preserves allowed markdown HTML` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked strips dangerous tags via asyncSanitizedMarked` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked renders syntax highlighting via asyncSanitizedMarked` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/marked.spec.tsx :: marked renders unknown language code blocks as plaintext via asyncSanitizedMarked` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` — Error: expect(jest.fn()).toHaveBeenCalled()
- `static/app/components/seer/markdown/embeds/components/dashboard.spec.tsx :: dashboard embed renders a live preview of the first two dashboard widgets` — console.* : TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/eventReplay/replayClipPreview.spec.tsx :: ReplayClipPreview Should have the correct time range` — TypeError: Cannot read properties of undefined (reading 'scheduledWith')
- `static/app/components/events/eventReplay/replayClipPreview.spec.tsx :: ReplayClipPreview Should link to the full replay correctly` — TypeError: Cannot read properties of undefined (reading 'scheduledWith')
- `static/app/components/events/eventReplay/replayClipPreview.spec.tsx :: ReplayClipPreview Display URL and breadcrumbs in fullscreen mode` — TypeError: Cannot read properties of undefined (reading 'scheduledWith')
- `static/app/components/seer/markdown/embeds/components/conversationsQuery.spec.tsx :: conversationsQuery embed previews matching conversations` — Unable to find an element with the text: Refund request escalated. This could be because the text is broken up by multiple elements. In this case, you can provide a function for yo
- `static/app/components/seer/markdown/embeds/components/conversationsQuery.spec.tsx :: conversationsQuery embed links each row to its conversation in a new tab` — Unable to find role="link" and name "Refund request escalated"
- `static/app/components/seer/markdown/embeds/components/conversationsQuery.spec.tsx :: conversationsQuery embed flattens a content-part first input when there is no title` — Unable to find an element with the text: I want a refund. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text m
- `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer fetches raw attachment bytes and renders UTF-16 text` — Unable to find an element with the text: A中. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to mak
- `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer renders colored text without escape codes when given ANSI colors` — Unable to find an element with the text: failed. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to
- `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer renders only the final write when given carriage-return progress updates` — Unable to find an element with the text: progress N%. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text mat
- `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer renders an error when the attachment cannot be downloaded` — Unable to find an element with the text: Failed to download attachment.. This could be because the text is broken up by multiple elements. In this case, you can provide a function 

</details>

### Failures by area

| area | failed |
| --- | --: |
| app/components/core | 33 |
| app/components/events | 29 |
| app/components/modals | 4 |
| app/components/seer | 4 |
| app/components/commandPalette | 1 |
| app/components/ansiText.spec.tsx | 1 |

### Failures by error signature

| count | signature | areas | example |
| --: | --- | --- | --- |
| 51 | TypeError: String.prototype.toLowerCase called on null or undefined | app/components/events, app/components/core | `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard renders feedback from pr_iteration blocks` |
| 5 | console.* : TypeError: String.prototype.toLowerCase called on null or undefined | app/components/modals, app/components/seer | `static/app/components/modals/widgetBuilder/addToDashboardModal.spec.tsx :: add to dashboard modal text widgets renders without making an events-stats request` |
| 3 | TypeError: Cannot read properties of undefined (reading 'scheduledWith') | app/components/events | `static/app/components/events/eventReplay/replayClipPreview.spec.tsx :: ReplayClipPreview Should have the correct time range` |
| 2 | Error: expect(element).not.toBeVisible() | app/components/core | `static/app/components/core/chat/thinkingBlock.spec.tsx :: ThinkingBlock is expanded by default and collapses when endTime arrives` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalledWith(...expected) | app/components/commandPalette | `static/app/components/commandPalette/ui/featureFlagCommandPaletteActions.spec.tsx :: FeatureFlagCommandPaletteActions clears stored overrides from the command palette` |
| 1 | Unable to find an element with the text: file contents. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text mat | app/components/events | `static/app/components/events/eventAttachments.spec.tsx :: EventAttachments can open attachment previews` |
| 1 | Error: expect(received).toContain(expected) // indexOf | app/components/ansiText.spec.tsx | `static/app/components/ansiText.spec.tsx :: AnsiText resolves 256-color and truecolor codes to their RGB values` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalled() | app/components/core | `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` |
| 1 | Unable to find an element with the text: Refund request escalated. This could be because the text is broken up by multiple elements. In this case, you can provide a function for yo | app/components/seer | `static/app/components/seer/markdown/embeds/components/conversationsQuery.spec.tsx :: conversationsQuery embed previews matching conversations` |
| 1 | Unable to find role="link" and name "Refund request escalated" | app/components/seer | `static/app/components/seer/markdown/embeds/components/conversationsQuery.spec.tsx :: conversationsQuery embed links each row to its conversation in a new tab` |
| 1 | Unable to find an element with the text: I want a refund. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text m | app/components/seer | `static/app/components/seer/markdown/embeds/components/conversationsQuery.spec.tsx :: conversationsQuery embed flattens a content-part first input when there is no title` |
| 1 | Unable to find an element with the text: A中. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to mak | app/components/events | `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer fetches raw attachment bytes and renders UTF-16 text` |
| 1 | Unable to find an element with the text: failed. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to | app/components/events | `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer renders colored text without escape codes when given ANSI colors` |
| 1 | Unable to find an element with the text: progress N%. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text mat | app/components/events | `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer renders only the final write when given carriage-return progress updates` |
| 1 | Unable to find an element with the text: Failed to download attachment.. This could be because the text is broken up by multiple elements. In this case, you can provide a function  | app/components/events | `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer renders an error when the attachment cannot be downloaded` |

Raw Jest JSON, logs, worker samples and receipts: `downstream/sentry/output/components-direct-x2/<mode>/` (gitignored).
