# Sentry downstream: `components-gc-triage` (2026-10-23)

> **TRIAGE MODE (`--triage`)**: rtd modes ran with workarounds for blockers already filed in TRIAGE.md (navigator.platform "", writable navigator.clipboard, index-getter tables pre-warmed before the isolation baseline, pending host timers cleared at teardown) to look past them. These are not compatibility results.

- upstream: https://github.com/getsentry/sentry @ `503ad2e4e2a208a87d768a3e91bcfb55a778e7ba` (2026-10-23T13:58:39Z) — fix(agents): Avoid repeated user turns during tool continuations (#128645)
- pinned: `503ad2e4e2a208a87d768a3e91bcfb55a778e7ba`
- selection: `static/app/components/`
- node v26.12.1, Jest workers 6 (same for every mode), runs per mode 1, CI=true (upstream's CI code paths), **heap sampled after a forced GC per file (--gc; timings include the GCs)**
- upstream versions: jest@30.5.1, jsdom@30.1.1, react@19.3.0, react-dom@19.3.0, @swc/jest@0.2.39, @testing-library/react@16.3.2, @testing-library/dom@10.4.1, @testing-library/user-event@14.6.7, @testing-library/jest-dom@7.0.1, @sentry/jest-environment@8.1.0, @floating-ui/react-dom@2.1.9
- rtd-full substitutes: @testing-library/react, @testing-library/dom, @testing-library/user-event, @testing-library/jest-dom (packages/*/dist/*.cjs)
- rtd-nohacks is an **experiment**: rtd-full plus harness/nohacks.ts undoing upstream's getComputedStyle / Floating UI / matchMedia / IntersectionObserver hacks.

## Per-mode results

| mode | passed | failed | skipped | total | files | suite errors | exit | wall | CPU | peak tree RSS | peak process RSS | env setup / file (median, p95) | receipts | notes |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |
| jsdom | 6429 | 0 | 3 | 6432 | 653 | 0 | 0 | 47.3s | 370.8s | 4156 MiB | 1085 MiB | 8 ms, 18 ms | 653/653 | RTL: stock; our packages changed during the run |
| rtd-dom | 6356 | 73 | 3 | 6432 | 653 | 0 | 1 | 51.1s | 351.9s | 3584 MiB | 706 MiB | 8 ms, 12 ms | 653/653 | 1 React; RTL: stock |
| rtd-full | 6289 | 140 | 3 | 6432 | 653 | 0 | 1 | 54.9s | 354.2s | 3072 MiB | 537 MiB | 9 ms, 15 ms | 653/653 | 1 React |

## Jest worker memory across files

Sampled after each test file's environment teardown in every worker (after a forced full GC). Slope = least-squares growth per file over each worker's files (first file excluded), median across workers. Upstream sets no `workerIdleMemoryLimit`.

| mode | workers | files/worker | heap after 1st file | heap after last file | heap growth/file | RSS growth/file | RSS after last file | max worker RSS |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| jsdom | 6 | 119 | 133 MiB | 232 MiB | 0.18 MiB | 0.25 MiB | 567 MiB | 1084 MiB |
| rtd-dom | 6 | 114 | 108 MiB | 189 MiB | 0.17 MiB | -0.00 MiB | 504 MiB | 704 MiB |
| rtd-full | 6 | 124.5 | 98 MiB | 230 MiB | 0.39 MiB | 0.31 MiB | 488 MiB | 535 MiB |

## jsdom

No failing tests.

## rtd-dom

Compared with jsdom: **73 pass on jsdom but fail here**, 0 missing (e.g. suite errors), 0 added, 0 fail on jsdom but pass here.

<details><summary>pass on jsdom, fail here (73)</summary>

- `static/app/components/seer/markdown/embeds/components/dashboard.spec.tsx :: dashboard embed renders a live preview of the first two dashboard widgets` — console.* : TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` — Error: expect(jest.fn()).toHaveBeenCalled()
- `static/app/components/modals/widgetBuilder/addToDashboardModal.spec.tsx :: add to dashboard modal text widgets renders without making an events-stats request` — console.* : TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/modals/widgetBuilder/addToDashboardModal.spec.tsx :: add to dashboard modal text widgets adds a text widget to an existing dashboard without modifying queries` — console.* : TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/modals/widgetBuilder/addToDashboardModal.spec.tsx :: add to dashboard modal text widgets navigates to new dashboard with text widget in location state` — console.* : TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/modals/widgetBuilder/addToDashboardModal.spec.tsx :: add to dashboard modal text widgets navigates to the widget builder with text widget in session storage` — console.* : TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/eventAttachments.spec.tsx :: EventAttachments can open attachment previews` — Unable to find an element with the text: file contents. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text mat
- `static/app/components/events/eventReplay/replayClipPreview.spec.tsx :: ReplayClipPreview Should have the correct time range` — TypeError: Cannot read properties of undefined (reading 'scheduledWith')
- `static/app/components/events/eventReplay/replayClipPreview.spec.tsx :: ReplayClipPreview Should link to the full replay correctly` — TypeError: Cannot read properties of undefined (reading 'scheduledWith')
- `static/app/components/events/eventReplay/replayClipPreview.spec.tsx :: ReplayClipPreview Display URL and breadcrumbs in fullscreen mode` — TypeError: Cannot read properties of undefined (reading 'scheduledWith')
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown raw HTML strips script tags` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown raw HTML strips iframe tags` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown raw HTML strips form elements` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown raw HTML strips event handler attributes` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown raw HTML preserves safe inline HTML like sub and sup` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown safety is non-overridable custom Html receives sanitized content` — TypeError: String.prototype.toLowerCase called on null or undefined
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
- `static/app/components/core/chat/thinkingBlock.spec.tsx :: ThinkingBlock is expanded by default and collapses when endTime arrives` — Error: expect(element).not.toBeVisible()
- `static/app/components/core/chat/thinkingBlock.spec.tsx :: ThinkingBlock auto-collapses when thinking completes even if user re-expanded` — Error: expect(element).not.toBeVisible()
- `static/app/components/seer/markdown/embeds/components/replay.spec.tsx :: replay embed renders a replay player preview at block level with a timestamp` — console.* : Error: No mocked response found for request: GET /organizations/org-slug/replays/4c1f2e3d1234567890/
- `static/app/components/commandPalette/ui/featureFlagCommandPaletteActions.spec.tsx :: FeatureFlagCommandPaletteActions clears stored overrides from the command palette` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)
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
- `static/app/components/ansiText.spec.tsx :: AnsiText resolves 256-color and truecolor codes to their RGB values` — Error: expect(received).toContain(expected) // indexOf
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
| app/components/seer | 5 |
| app/components/modals | 4 |
| app/components/commandPalette | 1 |
| app/components/ansiText.spec.tsx | 1 |

### Failures by error signature

| count | signature | areas | example |
| --: | --- | --- | --- |
| 51 | TypeError: String.prototype.toLowerCase called on null or undefined | app/components/core, app/components/events | `static/app/components/core/markdown/markdown.spec.tsx :: Markdown raw HTML strips script tags` |
| 5 | console.* : TypeError: String.prototype.toLowerCase called on null or undefined | app/components/seer, app/components/modals | `static/app/components/seer/markdown/embeds/components/dashboard.spec.tsx :: dashboard embed renders a live preview of the first two dashboard widgets` |
| 3 | TypeError: Cannot read properties of undefined (reading 'scheduledWith') | app/components/events | `static/app/components/events/eventReplay/replayClipPreview.spec.tsx :: ReplayClipPreview Should have the correct time range` |
| 2 | Error: expect(element).not.toBeVisible() | app/components/core | `static/app/components/core/chat/thinkingBlock.spec.tsx :: ThinkingBlock is expanded by default and collapses when endTime arrives` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalled() | app/components/core | `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` |
| 1 | Unable to find an element with the text: file contents. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text mat | app/components/events | `static/app/components/events/eventAttachments.spec.tsx :: EventAttachments can open attachment previews` |
| 1 | console.* : Error: No mocked response found for request: GET /organizations/org-slug/replays/4c1f2e3d1234567890/ | app/components/seer | `static/app/components/seer/markdown/embeds/components/replay.spec.tsx :: replay embed renders a replay player preview at block level with a timestamp` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalledWith(...expected) | app/components/commandPalette | `static/app/components/commandPalette/ui/featureFlagCommandPaletteActions.spec.tsx :: FeatureFlagCommandPaletteActions clears stored overrides from the command palette` |
| 1 | Error: expect(received).toContain(expected) // indexOf | app/components/ansiText.spec.tsx | `static/app/components/ansiText.spec.tsx :: AnsiText resolves 256-color and truecolor codes to their RGB values` |
| 1 | Unable to find an element with the text: Refund request escalated. This could be because the text is broken up by multiple elements. In this case, you can provide a function for yo | app/components/seer | `static/app/components/seer/markdown/embeds/components/conversationsQuery.spec.tsx :: conversationsQuery embed previews matching conversations` |
| 1 | Unable to find role="link" and name "Refund request escalated" | app/components/seer | `static/app/components/seer/markdown/embeds/components/conversationsQuery.spec.tsx :: conversationsQuery embed links each row to its conversation in a new tab` |
| 1 | Unable to find an element with the text: I want a refund. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text m | app/components/seer | `static/app/components/seer/markdown/embeds/components/conversationsQuery.spec.tsx :: conversationsQuery embed flattens a content-part first input when there is no title` |
| 1 | Unable to find an element with the text: A中. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to mak | app/components/events | `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer fetches raw attachment bytes and renders UTF-16 text` |
| 1 | Unable to find an element with the text: failed. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to | app/components/events | `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer renders colored text without escape codes when given ANSI colors` |
| 1 | Unable to find an element with the text: progress N%. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text mat | app/components/events | `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer renders only the final write when given carriage-return progress updates` |
| 1 | Unable to find an element with the text: Failed to download attachment.. This could be because the text is broken up by multiple elements. In this case, you can provide a function  | app/components/events | `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer renders an error when the attachment cannot be downloaded` |

## rtd-full

Compared with jsdom: **140 pass on jsdom but fail here**, 0 missing (e.g. suite errors), 0 added, 0 fail on jsdom but pass here.

<details><summary>pass on jsdom, fail here (140)</summary>

- `static/app/components/seer/projectTable/seerProjectTable.spec.tsx :: SeerProjectTable disables the row controls while a bulk edit is saving` — Unable to find role="textbox" and name "Auto-iterate on PRs for other-project"
- `static/app/components/core/form/field/selectField.spec.tsx :: SelectField disabled is disabled when disabled prop is true` — TestingLibraryElementError: Unable to find an accessible element with the role "textbox"
- `static/app/components/core/form/field/selectField.spec.tsx :: SelectField disabled shows lock icon with tooltip when disabled is a string` — TestingLibraryElementError: Unable to find an accessible element with the role "textbox"
- `static/app/components/core/form/field/selectField.spec.tsx :: SelectField auto-save disables select while auto-save is pending` — Unable to find role="textbox"
- `static/app/components/core/form/field/selectField.spec.tsx :: SelectField multiple is disabled when disabled prop is true` — TestingLibraryElementError: Unable to find an accessible element with the role "textbox"
- `static/app/components/core/form/field/selectField.spec.tsx :: SelectField multiple shows lock icon with tooltip when disabled is a string` — TestingLibraryElementError: Unable to find an accessible element with the role "textbox"
- `static/app/components/core/form/field/selectField.spec.tsx :: SelectField multiple auto-save disables multi-select while auto-save is pending` — Unable to find role="textbox"
- `static/app/components/events/eventAttachments.spec.tsx :: EventAttachments can open attachment previews` — Unable to find an element with the text: file contents. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text mat
- `static/app/components/seer/projectAddRepoModal/projectAddRepoModal.spec.tsx :: ProjectAddRepoModal disables the agent dropdown and warns when a GitLab repo is added` — Unable to find role="textbox" and name "Handoff to Agent"
- `static/app/components/seer/projectAddRepoModal/projectAddRepoModal.spec.tsx :: ProjectAddRepoModal hard-resets a chosen coding agent to Seer and keeps it on removal` — Unable to find role="textbox" and name "Handoff to Agent"
- `static/app/components/seer/projectAddRepoModal/projectAddRepoModal.spec.tsx :: ProjectAddRepoModal saves Seer as the agent when a GitLab repo is attached` — Unable to find role="textbox" and name "Handoff to Agent"
- `static/app/components/seer/markdown/embeds/components/conversationsQuery.spec.tsx :: conversationsQuery embed previews matching conversations` — Unable to find an element with the text: Refund request escalated. This could be because the text is broken up by multiple elements. In this case, you can provide a function for yo
- `static/app/components/seer/markdown/embeds/components/conversationsQuery.spec.tsx :: conversationsQuery embed links each row to its conversation in a new tab` — Unable to find role="link" and name "Refund request escalated"
- `static/app/components/seer/markdown/embeds/components/conversationsQuery.spec.tsx :: conversationsQuery embed flattens a content-part first input when there is no title` — Unable to find an element with the text: I want a refund. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text m
- `static/app/components/modals/widgetBuilder/addToDashboardModal.spec.tsx :: add to dashboard modal text widgets renders without making an events-stats request` — console.* : TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/modals/widgetBuilder/addToDashboardModal.spec.tsx :: add to dashboard modal text widgets adds a text widget to an existing dashboard without modifying queries` — console.* : TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/modals/widgetBuilder/addToDashboardModal.spec.tsx :: add to dashboard modal text widgets navigates to new dashboard with text widget in location state` — console.* : TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/modals/widgetBuilder/addToDashboardModal.spec.tsx :: add to dashboard modal text widgets navigates to the widget builder with text widget in session storage` — console.* : TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/issues/groupList.spec.tsx :: GroupList renders a header for each column of the rows` — Error: expect(received).toEqual(expected) // deep equality
- `static/app/components/issues/groupList.spec.tsx :: GroupList updates the assignee when changed` — Unable to find role="button" and name "Modify issue assignee"
- `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer fetches raw attachment bytes and renders UTF-16 text` — Unable to find an element with the text: A中. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to mak
- `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer renders colored text without escape codes when given ANSI colors` — Unable to find an element with the text: failed. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to
- `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer renders only the final write when given carriage-return progress updates` — Unable to find an element with the text: progress N%. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text mat
- `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer renders an error when the attachment cannot be downloaded` — Unable to find an element with the text: Failed to download attachment.. This could be because the text is broken up by multiple elements. In this case, you can provide a function 
- `static/app/components/core/breadcrumbList/breadcrumbList.spec.tsx :: BreadcrumbList container-query collapse keeps a parent link reachable in the overflow menu` — TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "Settings"
- `static/app/components/core/breadcrumbList/breadcrumbList.spec.tsx :: BreadcrumbList container-query collapse renders the page-title label as a heading and hides dividers from AT` — TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "Settings"
- `static/app/components/core/breadcrumbList/breadcrumbList.spec.tsx :: BreadcrumbList container-query collapse gives the select trigger a descriptive accessible name` — Unable to find role="button" and name "Switch javascript"
- `static/app/components/pageFilters/date/datePageFilter.spec.tsx :: DatePageFilter can change absolute range` — Unable to find role="button" and name "Oct N – Oct N"
- `static/app/components/commandPalette/ui/featureFlagCommandPaletteActions.spec.tsx :: FeatureFlagCommandPaletteActions clears stored overrides from the command palette` — Error: expect(jest.fn()).toHaveBeenCalledWith(...expected)
- `static/app/components/events/suspectCommits.spec.tsx :: SuspectCommits shows feedback component for suspect commits` — TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Yes, this suspect commit is correct"
- `static/app/components/events/suspectCommits.spec.tsx :: SuspectCommits tracks analytics when feedback is submitted` — Unable to find role="button" and name "Yes, this suspect commit is correct"
- `static/app/components/connectRepository/connectRepositoryModal.spec.tsx :: ConnectRepositoryModal renders initial modal state` — TestingLibraryElementError: Unable to find an accessible element with the role "textbox" and name `/project/i`
- `static/app/components/connectRepository/connectRepositoryModal.spec.tsx :: ConnectRepositoryModal edit mode shows locked project and repository fields with seeded rows, Save enabled` — TestingLibraryElementError: Unable to find an accessible element with the role "textbox"
- `static/app/components/connectRepository/connectRepositoryModal.spec.tsx :: ConnectRepositoryModal edit mode locks protected mappings: delete disabled, prefixes disabled, branch enabled, alert shown` — TestingLibraryElementError: Unable to find an accessible element with the role "textbox" and name `/stack trace prefix/i`
- `static/app/components/connectRepository/connectRepositoryModal.spec.tsx :: ConnectRepositoryModal repo-locked mode (lockedSide="repo") connect renders with repository locked and a project selector` — TestingLibraryElementError: Unable to find an accessible element with the role "textbox" and name `/repository/i`
- `static/app/components/connectRepository/connectRepositoryModal.spec.tsx :: ConnectRepositoryModal repo-locked mode (lockedSide="repo") edit locks both repository and project fields and shows seeded paths` — TestingLibraryElementError: Unable to find an accessible element with the role "textbox"
- `static/app/components/seer/projectDetails/autofixAgent.spec.tsx :: AutofixAgent disables the agent dropdown and warns when a GitLab repo is attached` — Unable to find role="textbox" and name "Handoff to Agent"
- `static/app/components/seer/projectDetails/autofixAgent.spec.tsx :: AutofixAgent disables the agent dropdown for any non-GitHub provider` — Unable to find role="textbox" and name "Handoff to Agent"
- `static/app/components/seer/projectDetails/autofixAgent.spec.tsx :: AutofixAgent keeps the agent dropdown disabled while the repos query is still loading` — Unable to find role="textbox" and name "Handoff to Agent"
- `static/app/components/seer/projectDetails/autofixAgent.spec.tsx :: AutofixAgent does not persist Seer when the user cannot write` — Unable to find role="textbox" and name "Handoff to Agent"
- `static/app/components/seer/projectDetails/autofixAgent.spec.tsx :: AutofixAgent does not retry the Seer coercion after a failed save` — Unable to find role="textbox" and name "Handoff to Agent"
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
- `static/app/components/stackTrace/exceptionGroup.spec.tsx :: exceptionGroup renders colored text without escape codes when given ANSI exception values` — TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "ValueError: bad value"
- `static/app/components/backendJsonFormAdapter/backendJsonSubmitForm.spec.tsx :: BackendJsonSubmitForm basic field rendering disables all fields when disabled` — TestingLibraryElementError: Unable to find an accessible element with the role "textbox" and name "Priority"
- `static/app/components/core/splitPanel/splitPanel.spec.tsx :: SplitPanel renders both panes and a divider` — TestingLibraryElementError: Unable to find an accessible element with the role "separator"
- `static/app/components/core/splitPanel/splitPanel.spec.tsx :: SplitPanel floors the sized pane at minSize when the seeded size is below it` — TestingLibraryElementError: Unable to find an accessible element with the role "separator"
- `static/app/components/core/splitPanel/splitPanel.spec.tsx :: SplitPanel exposes the divider as a separator with orientation and value attributes` — TestingLibraryElementError: Unable to find an accessible element with the role "separator"
- `static/app/components/core/splitPanel/splitPanel.spec.tsx :: SplitPanel exposes a setSize handle that updates the sized pane` — TestingLibraryElementError: Unable to find an accessible element with the role "separator"
- `static/app/components/core/splitPanel/splitPanel.spec.tsx :: SplitPanel sizing double-click resets to defaultSize, not the initial size` — TestingLibraryElementError: Unable to find an accessible element with the role "separator"
- `static/app/components/core/splitPanel/splitPanel.spec.tsx :: SplitPanel sizing reports the clamped visible size as startSize when seeded below min` — TestingLibraryElementError: Unable to find an accessible element with the role "separator"
- `static/app/components/core/splitPanel/splitPanel.spec.tsx :: SplitPanel sizing keyboard grow steps from the clamped visible size when seeded below min` — TestingLibraryElementError: Unable to find an accessible element with the role "separator"
- `static/app/components/core/splitPanel/splitPanel.spec.tsx :: SplitPanel sizing treats a Home/End edge as a no-op while max is unbounded` — TestingLibraryElementError: Unable to find an accessible element with the role "separator"
- `static/app/components/core/splitPanel/splitPanel.spec.tsx :: SplitPanel sizing fires onResizeEnd on keyboard resize so the size can be persisted` — TestingLibraryElementError: Unable to find an accessible element with the role "separator"
- `static/app/components/core/splitPanel/splitPanel.spec.tsx :: SplitPanel sizing resizes with pointer drag events` — TestingLibraryElementError: Unable to find an accessible element with the role "separator"
- `static/app/components/modals/inviteMembersModal/inviteRowControl.spec.tsx :: InviteRowControlNew renders with invite-billing flag` — TestingLibraryElementError: Unable to find an accessible element with the role "textbox" and name "Role"
- `static/app/components/modals/inviteMembersModal/inviteRowControl.spec.tsx :: InviteRowControlNew disables team selection when team roles are not allowed` — TestingLibraryElementError: Unable to find an accessible element with the role "textbox" and name "Add to Team"
- `static/app/components/seer/markdown/embeds/components/dashboard.spec.tsx :: dashboard embed renders a live preview of the first two dashboard widgets` — console.* : TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/pipeline/integrationGitHub/index.spec.tsx :: GitHubOAuthLoginStep shows busy state when isAdvancing is true` — TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Authorize GitHub"
- `static/app/components/core/tabs/tabs.spec.tsx :: Tabs overflow activates an overflowing tab when selected from the menu` — TestingLibraryElementError: Unable to find an accessible element with the role "tab" and name "Attachments"
- `static/app/components/pipeline/integrationGitLab/index.spec.tsx :: GitLabOAuthLoginStep shows busy state when isAdvancing is true` — TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Authorize GitLab"
- `static/app/components/events/eventReplay/replayClipPreview.spec.tsx :: ReplayClipPreview Should have the correct time range` — TypeError: Cannot read properties of undefined (reading 'scheduledWith')
- `static/app/components/events/eventReplay/replayClipPreview.spec.tsx :: ReplayClipPreview Should link to the full replay correctly` — TypeError: Cannot read properties of undefined (reading 'scheduledWith')
- `static/app/components/events/eventReplay/replayClipPreview.spec.tsx :: ReplayClipPreview Display URL and breadcrumbs in fullscreen mode` — TypeError: Cannot read properties of undefined (reading 'scheduledWith')
- `static/app/components/pipeline/integrationGitHubEnterprise/index.spec.tsx :: GHE OAuthLoginStep shows busy state when isAdvancing` — TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Authorize GitHub Enterprise"
- `static/app/components/events/interfaces/debugMeta/index.spec.tsx :: DebugMeta renders each image as a row under the column headers` — Error: expect(received).toEqual(expected) // deep equality
- `static/app/components/pipeline/integrationSlack/index.spec.tsx :: SlackOAuthLoginStep shows busy state when isAdvancing is true` — TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Authorize Slack"
- `static/app/components/pipeline/shared/oauthLoginStep.spec.tsx :: OAuthLoginStep shows busy state when isLoading is true` — TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Authorize GitLab"
- `static/app/components/group/sentryAppExternalIssueForm.spec.tsx :: SentryAppExternalIssueForm Dependent fields load options for field that has dependencies when the dependent option is selected` — TestingLibraryElementError: Unable to find an accessible element with the role "textbox" and name "Board"
- `static/app/components/profiling/profileHeader.spec.tsx :: ProfileHeader renders the parent trail with the profile ID as the page title` — TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "Profiles"
- `static/app/components/profiling/profileHeader.spec.tsx :: ProfileHeader preserves the page filters on the Profiles link` — TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "Profiles"
- `static/app/components/profiling/profileHeader.spec.tsx :: ProfileHeader points the transaction crumb at the transaction summary profiles tab` — TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "my-transaction"
- `static/app/components/profiling/profileHeader.spec.tsx :: ProfileHeader does not leak this page's search params onto the crumbs` — TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "Profiles"
- `static/app/components/profiling/profileHeader.spec.tsx :: ProfileHeader drops the transaction crumb until the name resolves` — TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "Profiles"
- `static/app/components/profiling/profileHeader.spec.tsx :: ProfileHeader transaction variant forwards an absolute date range, which is a real page filter here` — TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "Profiles"
- `static/app/components/profiling/profileHeader.spec.tsx :: ProfileHeader continuous variant does not forward the profile time window to the crumbs` — TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "Profiles"
- `static/app/components/events/viewHierarchy/index.spec.tsx :: View Hierarchy renders a custom ui for godot platform` — Error: expect(received).toHaveLength(expected)
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown raw HTML strips script tags` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown raw HTML strips iframe tags` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown raw HTML strips form elements` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown raw HTML strips event handler attributes` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown raw HTML preserves safe inline HTML like sub and sup` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/core/markdown/markdown.spec.tsx :: Markdown safety is non-overridable custom Html receives sanitized content` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/components/events/suspectCommitFeedback.spec.tsx :: SuspectCommitFeedback tracks analytics and shows thank you message when thumbs up is clicked` — TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Yes, this suspect commit is correct"
- `static/app/components/events/suspectCommitFeedback.spec.tsx :: SuspectCommitFeedback tracks analytics and shows thank you message when thumbs down is clicked` — TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Yes, this suspect commit is correct"
- `static/app/components/events/interfaces/crashContent/exception/relatedExceptions.spec.tsx :: ExceptionGroupContext renders colored text without escape codes when given ANSI exception values` — TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "TypeError: nested failure"
- `static/app/components/modals/sentryAppPublishRequestModal/sentryAppPublishRequestModal.spec.tsx :: SentryAppDetailsModal renders the modal` — TestingLibraryElementError: Unable to find an accessible element with the role "textbox" and name "Provide a one-liner describing your integration. Subject to approval, we’ll use t
- `static/app/components/modals/sentryAppPublishRequestModal/sentryAppPublishRequestModal.spec.tsx :: SentryAppDetailsModal sends correctly formatted JSON for the modal flow` — TestingLibraryElementError: Unable to find an accessible element with the role "textbox" and name "Provide a one-liner describing your integration. Subject to approval, we’ll use t
- `static/app/components/modals/sentryAppPublishRequestModal/sentryAppPublishRequestModal.spec.tsx :: SentryAppDetailsModal shows error message on failure` — TestingLibraryElementError: Unable to find an accessible element with the role "textbox" and name "Provide a one-liner describing your integration. Subject to approval, we’ll use t
- `static/app/components/modals/sentryAppPublishRequestModal/sentryAppPublishRequestModal.spec.tsx :: SentryAppDetailsModal shows a validation error and does not submit if invalid urls are used` — TestingLibraryElementError: Unable to find an accessible element with the role "textbox" and name "Provide a one-liner describing your integration. Subject to approval, we’ll use t
- `static/app/components/onboardingWizard/content.spec.tsx :: OnboardingSidebarContent should render the sidebar with the correct groups and tasks` — TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Collapse"
- `static/app/components/onboardingWizard/content.spec.tsx :: OnboardingSidebarContent show skipable confirmation when skipping a task` — TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Skip Task"
- `static/app/components/ansiText.spec.tsx :: AnsiText resolves 256-color and truecolor codes to their RGB values` — Error: expect(received).toContain(expected) // indexOf
- `static/app/components/pipeline/integrationDiscord/index.spec.tsx :: DiscordOAuthLoginStep shows busy state when isAdvancing is true` — TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Authorize Discord"
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
- `static/app/components/core/chat/thinkingBlock.spec.tsx :: ThinkingBlock is expanded by default and collapses when endTime arrives` — Error: expect(element).not.toBeVisible()
- `static/app/components/core/chat/thinkingBlock.spec.tsx :: ThinkingBlock auto-collapses when thinking completes even if user re-expanded` — Error: expect(element).not.toBeVisible()

</details>

### Failures by area

| area | failed |
| --- | --: |
| app/components/core | 53 |
| app/components/events | 36 |
| app/components/seer | 13 |
| app/components/modals | 10 |
| app/components/profiling | 7 |
| app/components/pipeline | 6 |
| app/components/connectRepository | 5 |
| app/components/issues | 2 |
| app/components/onboardingWizard | 2 |
| app/components/pageFilters | 1 |
| app/components/commandPalette | 1 |
| app/components/stackTrace | 1 |
| app/components/backendJsonFormAdapter | 1 |
| app/components/group | 1 |
| app/components/ansiText.spec.tsx | 1 |

### Failures by error signature

| count | signature | areas | example |
| --: | --- | --- | --- |
| 51 | TypeError: String.prototype.toLowerCase called on null or undefined | app/components/events, app/components/core | `static/app/components/events/autofix/v3/autofixCards.spec.tsx :: ArtifactCard CodeChangesCard renders feedback from pr_iteration blocks` |
| 10 | TestingLibraryElementError: Unable to find an accessible element with the role "separator" | app/components/core | `static/app/components/core/splitPanel/splitPanel.spec.tsx :: SplitPanel renders both panes and a divider` |
| 8 | Unable to find role="textbox" and name "Handoff to Agent" | app/components/seer | `static/app/components/seer/projectAddRepoModal/projectAddRepoModal.spec.tsx :: ProjectAddRepoModal disables the agent dropdown and warns when a GitLab repo is added` |
| 6 | TestingLibraryElementError: Unable to find an accessible element with the role "textbox" | app/components/core, app/components/connectRepository | `static/app/components/core/form/field/selectField.spec.tsx :: SelectField disabled is disabled when disabled prop is true` |
| 6 | TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "Profiles" | app/components/profiling | `static/app/components/profiling/profileHeader.spec.tsx :: ProfileHeader renders the parent trail with the profile ID as the page title` |
| 5 | console.* : TypeError: String.prototype.toLowerCase called on null or undefined | app/components/modals, app/components/seer | `static/app/components/modals/widgetBuilder/addToDashboardModal.spec.tsx :: add to dashboard modal text widgets renders without making an events-stats request` |
| 4 | TestingLibraryElementError: Unable to find an accessible element with the role "textbox" and name "Provide a one-liner describing your integration. Subject to approval, we’ll use t | app/components/modals | `static/app/components/modals/sentryAppPublishRequestModal/sentryAppPublishRequestModal.spec.tsx :: SentryAppDetailsModal renders the modal` |
| 3 | TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Yes, this suspect commit is correct" | app/components/events | `static/app/components/events/suspectCommits.spec.tsx :: SuspectCommits shows feedback component for suspect commits` |
| 3 | TypeError: Cannot read properties of undefined (reading 'scheduledWith') | app/components/events | `static/app/components/events/eventReplay/replayClipPreview.spec.tsx :: ReplayClipPreview Should have the correct time range` |
| 2 | Unable to find role="textbox" | app/components/core | `static/app/components/core/form/field/selectField.spec.tsx :: SelectField auto-save disables select while auto-save is pending` |
| 2 | Error: expect(received).toEqual(expected) // deep equality | app/components/issues, app/components/events | `static/app/components/issues/groupList.spec.tsx :: GroupList renders a header for each column of the rows` |
| 2 | TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "Settings" | app/components/core | `static/app/components/core/breadcrumbList/breadcrumbList.spec.tsx :: BreadcrumbList container-query collapse keeps a parent link reachable in the overflow menu` |
| 2 | TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Authorize GitLab" | app/components/pipeline | `static/app/components/pipeline/integrationGitLab/index.spec.tsx :: GitLabOAuthLoginStep shows busy state when isAdvancing is true` |
| 2 | Error: expect(element).not.toBeVisible() | app/components/core | `static/app/components/core/chat/thinkingBlock.spec.tsx :: ThinkingBlock is expanded by default and collapses when endTime arrives` |
| 1 | Unable to find role="textbox" and name "Auto-iterate on PRs for other-project" | app/components/seer | `static/app/components/seer/projectTable/seerProjectTable.spec.tsx :: SeerProjectTable disables the row controls while a bulk edit is saving` |
| 1 | Unable to find an element with the text: file contents. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text mat | app/components/events | `static/app/components/events/eventAttachments.spec.tsx :: EventAttachments can open attachment previews` |
| 1 | Unable to find an element with the text: Refund request escalated. This could be because the text is broken up by multiple elements. In this case, you can provide a function for yo | app/components/seer | `static/app/components/seer/markdown/embeds/components/conversationsQuery.spec.tsx :: conversationsQuery embed previews matching conversations` |
| 1 | Unable to find role="link" and name "Refund request escalated" | app/components/seer | `static/app/components/seer/markdown/embeds/components/conversationsQuery.spec.tsx :: conversationsQuery embed links each row to its conversation in a new tab` |
| 1 | Unable to find an element with the text: I want a refund. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text m | app/components/seer | `static/app/components/seer/markdown/embeds/components/conversationsQuery.spec.tsx :: conversationsQuery embed flattens a content-part first input when there is no title` |
| 1 | Unable to find role="button" and name "Modify issue assignee" | app/components/issues | `static/app/components/issues/groupList.spec.tsx :: GroupList updates the assignee when changed` |
| 1 | Unable to find an element with the text: A中. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to mak | app/components/events | `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer fetches raw attachment bytes and renders UTF-16 text` |
| 1 | Unable to find an element with the text: failed. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to | app/components/events | `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer renders colored text without escape codes when given ANSI colors` |
| 1 | Unable to find an element with the text: progress N%. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text mat | app/components/events | `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer renders only the final write when given carriage-return progress updates` |
| 1 | Unable to find an element with the text: Failed to download attachment.. This could be because the text is broken up by multiple elements. In this case, you can provide a function  | app/components/events | `static/app/components/events/attachmentViewers/logFileViewer.spec.tsx :: LogFileViewer renders an error when the attachment cannot be downloaded` |
| 1 | Unable to find role="button" and name "Switch javascript" | app/components/core | `static/app/components/core/breadcrumbList/breadcrumbList.spec.tsx :: BreadcrumbList container-query collapse gives the select trigger a descriptive accessible name` |
| 1 | Unable to find role="button" and name "Oct N – Oct N" | app/components/pageFilters | `static/app/components/pageFilters/date/datePageFilter.spec.tsx :: DatePageFilter can change absolute range` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalledWith(...expected) | app/components/commandPalette | `static/app/components/commandPalette/ui/featureFlagCommandPaletteActions.spec.tsx :: FeatureFlagCommandPaletteActions clears stored overrides from the command palette` |
| 1 | Unable to find role="button" and name "Yes, this suspect commit is correct" | app/components/events | `static/app/components/events/suspectCommits.spec.tsx :: SuspectCommits tracks analytics when feedback is submitted` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "textbox" and name '/project/i' | app/components/connectRepository | `static/app/components/connectRepository/connectRepositoryModal.spec.tsx :: ConnectRepositoryModal renders initial modal state` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "textbox" and name '/stack trace prefix/i' | app/components/connectRepository | `static/app/components/connectRepository/connectRepositoryModal.spec.tsx :: ConnectRepositoryModal edit mode locks protected mappings: delete disabled, prefixes disabled, branch enabled, alert shown` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "textbox" and name '/repository/i' | app/components/connectRepository | `static/app/components/connectRepository/connectRepositoryModal.spec.tsx :: ConnectRepositoryModal repo-locked mode (lockedSide="repo") connect renders with repository locked and a project selector` |
| 1 | Error: expect(jest.fn()).toHaveBeenCalled() | app/components/core | `static/app/components/core/dropdownMenu/dropdownMenu.spec.tsx :: DropdownMenu navigates to link on meta key` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "ValueError: bad value" | app/components/stackTrace | `static/app/components/stackTrace/exceptionGroup.spec.tsx :: exceptionGroup renders colored text without escape codes when given ANSI exception values` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "textbox" and name "Priority" | app/components/backendJsonFormAdapter | `static/app/components/backendJsonFormAdapter/backendJsonSubmitForm.spec.tsx :: BackendJsonSubmitForm basic field rendering disables all fields when disabled` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "textbox" and name "Role" | app/components/modals | `static/app/components/modals/inviteMembersModal/inviteRowControl.spec.tsx :: InviteRowControlNew renders with invite-billing flag` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "textbox" and name "Add to Team" | app/components/modals | `static/app/components/modals/inviteMembersModal/inviteRowControl.spec.tsx :: InviteRowControlNew disables team selection when team roles are not allowed` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Authorize GitHub" | app/components/pipeline | `static/app/components/pipeline/integrationGitHub/index.spec.tsx :: GitHubOAuthLoginStep shows busy state when isAdvancing is true` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "tab" and name "Attachments" | app/components/core | `static/app/components/core/tabs/tabs.spec.tsx :: Tabs overflow activates an overflowing tab when selected from the menu` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Authorize GitHub Enterprise" | app/components/pipeline | `static/app/components/pipeline/integrationGitHubEnterprise/index.spec.tsx :: GHE OAuthLoginStep shows busy state when isAdvancing` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Authorize Slack" | app/components/pipeline | `static/app/components/pipeline/integrationSlack/index.spec.tsx :: SlackOAuthLoginStep shows busy state when isAdvancing is true` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "textbox" and name "Board" | app/components/group | `static/app/components/group/sentryAppExternalIssueForm.spec.tsx :: SentryAppExternalIssueForm Dependent fields load options for field that has dependencies when the dependent option is selected` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "my-transaction" | app/components/profiling | `static/app/components/profiling/profileHeader.spec.tsx :: ProfileHeader points the transaction crumb at the transaction summary profiles tab` |
| 1 | Error: expect(received).toHaveLength(expected) | app/components/events | `static/app/components/events/viewHierarchy/index.spec.tsx :: View Hierarchy renders a custom ui for godot platform` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "TypeError: nested failure" | app/components/events | `static/app/components/events/interfaces/crashContent/exception/relatedExceptions.spec.tsx :: ExceptionGroupContext renders colored text without escape codes when given ANSI exception values` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Collapse" | app/components/onboardingWizard | `static/app/components/onboardingWizard/content.spec.tsx :: OnboardingSidebarContent should render the sidebar with the correct groups and tasks` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Skip Task" | app/components/onboardingWizard | `static/app/components/onboardingWizard/content.spec.tsx :: OnboardingSidebarContent show skipable confirmation when skipping a task` |
| 1 | Error: expect(received).toContain(expected) // indexOf | app/components/ansiText.spec.tsx | `static/app/components/ansiText.spec.tsx :: AnsiText resolves 256-color and truecolor codes to their RGB values` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Authorize Discord" | app/components/pipeline | `static/app/components/pipeline/integrationDiscord/index.spec.tsx :: DiscordOAuthLoginStep shows busy state when isAdvancing is true` |

Raw Jest JSON, logs, worker samples and receipts: `downstream/sentry/output/components-gc-triage/<mode>/` (gitignored).
