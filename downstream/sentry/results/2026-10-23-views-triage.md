# Sentry downstream: `views-triage` (2026-10-23)

> **TRIAGE MODE (`--triage`)**: ctrl-dom modes ran with workarounds for blockers already filed in TRIAGE.md (navigator.platform "", writable navigator.clipboard, index-getter tables pre-warmed before the isolation baseline) to look past them. These are not compatibility results.

- upstream: https://github.com/getsentry/sentry @ `503ad2e4e2a208a87d768a3e91bcfb55a778e7ba` (2026-10-23T13:58:39Z) — fix(agents): Avoid repeated user turns during tool continuations (#128645)
- pinned: `503ad2e4e2a208a87d768a3e91bcfb55a778e7ba`
- selection: `static/app/views/issueDetails/`, `static/app/views/issueList/`, `static/app/views/discover/`, `static/app/views/automations/`, `static/app/views/alerts/`, `static/app/views/projectDetail/`, `static/app/views/organizationStats/`, `static/app/views/navigation/`, `static/app/views/authV2/`
- node v26.12.1, Jest workers 6 (same for every mode), runs per mode 1, CI=true (upstream's CI code paths), no forced GC
- upstream versions: jest@30.5.1, jsdom@30.1.1, react@19.3.0, react-dom@19.3.0, @swc/jest@0.2.39, @testing-library/react@16.3.2, @testing-library/dom@10.4.1, @testing-library/user-event@14.6.7, @testing-library/jest-dom@7.0.1, @sentry/jest-environment@8.1.0, @floating-ui/react-dom@2.1.9
- ctrl-dom-full substitutes: @testing-library/react, @testing-library/dom, @testing-library/user-event, @testing-library/jest-dom (packages/*/dist/*.cjs)
- ctrl-dom-nohacks is an **experiment**: ctrl-dom-full plus harness/nohacks.ts undoing upstream's getComputedStyle / Floating UI / matchMedia / IntersectionObserver hacks.

## Per-mode results

| mode | passed | failed | skipped | total | files | suite errors | exit | wall | CPU | peak tree RSS | peak process RSS | env setup / file (median, p95) | receipts | notes |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |
| jsdom | 1818 | 0 | 0 | 1818 | 236 | 0 | 0 | 31.4s | 160.9s | 7956 MiB | 1764 MiB | 8 ms, 12 ms | 236/236 | RTL: stock |
| ctrl-dom | 1810 | 8 | 0 | 1818 | 236 | 0 | 1 | 58.7s | 183.7s | 8344 MiB | 1587 MiB | 7 ms, 42 ms | 236/236 | 1 React; RTL: stock |
| ctrl-dom-full | 1781 | 37 | 0 | 1818 | 236 | 0 | 1 | 39.3s | 163.1s | 8012 MiB | 1674 MiB | 6 ms, 19 ms | 236/236 | 1 React |
| ctrl-dom-nohacks | 1734 | 84 | 0 | 1818 | 236 | 0 | 1 | 32.8s | 155.0s | 7958 MiB | 1695 MiB | 6 ms, 9 ms | 236/236 | 1 React |

## Jest worker memory across files

Sampled after each test file's environment teardown in every worker (no forced GC, so heap numbers include garbage). Slope = least-squares growth per file over each worker's files (first file excluded), median across workers. Upstream sets no `workerIdleMemoryLimit`.

| mode | workers | files/worker | heap after 1st file | heap after last file | heap growth/file | RSS growth/file | RSS after last file | max worker RSS |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| jsdom | 6 | 37.5 | 357 MiB | 1113 MiB | 16.86 MiB | 4.69 MiB | 1130 MiB | 1750 MiB |
| ctrl-dom | 6 | 41.5 | 193 MiB | 983 MiB | 15.01 MiB | 18.84 MiB | 1363 MiB | 1569 MiB |
| ctrl-dom-full | 6 | 39 | 189 MiB | 984 MiB | 18.62 MiB | 10.61 MiB | 1139 MiB | 1657 MiB |
| ctrl-dom-nohacks | 6 | 38.5 | 177 MiB | 1096 MiB | 19.31 MiB | 14.30 MiB | 1165 MiB | 1693 MiB |

## jsdom

No failing tests.

## ctrl-dom

Compared with jsdom: **8 pass on jsdom but fail here**, 0 missing (e.g. suite errors), 0 added, 0 fail on jsdom but pass here.

<details><summary>pass on jsdom, fail here (8)</summary>

- `static/app/views/authV2/passwordReset/index.spec.tsx :: PasswordReset preserves the form when password validation fails` — Error: expect(element).toBeVisible()
- `static/app/views/issueDetails/groupReplays/groupReplays.spec.tsx :: GroupReplays Replay Feature Enabled should show a list of replays and have the correct values` — TypeError: Cannot read properties of undefined (reading 'scheduledWith')
- `static/app/views/issueDetails/groupReplays/groupReplays.spec.tsx :: GroupReplays Replay Feature Enabled Should render the replay player` — TypeError: Cannot read properties of undefined (reading 'scheduledWith')
- `static/app/views/issueDetails/groupReplays/groupReplays.spec.tsx :: GroupReplays Replay Feature Enabled Should switch replays when clicking` — TypeError: Cannot read properties of undefined (reading 'scheduledWith')
- `static/app/views/navigation/primary/userDropdown.spec.tsx :: UserDropdown shows admin link if user is admin` — TestingLibraryElementError: Unable to find an accessible element with the role "menuitemradio" and name "Admin"
- `static/app/views/authV2/authLogin/index.spec.tsx :: AuthLogin renders warnings above the configured login banner` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/views/discover/results.spec.tsx :: Results Events displays tip when events response contains a tip` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/views/navigation/primary/serviceIncidents.spec.tsx :: PrimaryNavigationServiceIncidents displays button and list of incidents when clicked` — TypeError: String.prototype.toLowerCase called on null or undefined

</details>

### Failures by area

| area | failed |
| --- | --: |
| app/views/issueDetails | 3 |
| app/views/authV2 | 2 |
| app/views/navigation | 2 |
| app/views/discover | 1 |

### Failures by error signature

| count | signature | areas | example |
| --: | --- | --- | --- |
| 3 | TypeError: Cannot read properties of undefined (reading 'scheduledWith') | app/views/issueDetails | `static/app/views/issueDetails/groupReplays/groupReplays.spec.tsx :: GroupReplays Replay Feature Enabled should show a list of replays and have the correct values` |
| 3 | TypeError: String.prototype.toLowerCase called on null or undefined | app/views/authV2, app/views/discover, app/views/navigation | `static/app/views/authV2/authLogin/index.spec.tsx :: AuthLogin renders warnings above the configured login banner` |
| 1 | Error: expect(element).toBeVisible() | app/views/authV2 | `static/app/views/authV2/passwordReset/index.spec.tsx :: PasswordReset preserves the form when password validation fails` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "menuitemradio" and name "Admin" | app/views/navigation | `static/app/views/navigation/primary/userDropdown.spec.tsx :: UserDropdown shows admin link if user is admin` |

## ctrl-dom-full

Compared with jsdom: **37 pass on jsdom but fail here**, 0 missing (e.g. suite errors), 0 added, 0 fail on jsdom but pass here.

<details><summary>pass on jsdom, fail here (37)</summary>

- `static/app/views/issueDetails/groupReplays/groupReplays.spec.tsx :: GroupReplays Replay Feature Enabled should show a list of replays and have the correct values` — TypeError: Cannot read properties of undefined (reading 'scheduledWith')
- `static/app/views/issueDetails/groupReplays/groupReplays.spec.tsx :: GroupReplays Replay Feature Enabled Should render the replay player` — TypeError: Cannot read properties of undefined (reading 'scheduledWith')
- `static/app/views/issueDetails/groupReplays/groupReplays.spec.tsx :: GroupReplays Replay Feature Enabled Should switch replays when clicking` — TypeError: Cannot read properties of undefined (reading 'scheduledWith')
- `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage marks an issue as seen and clears its unread indicator when previewed` — TestingLibraryElementError: Unable to find an accessible element with the role "complementary" and name "Issue preview"
- `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage keeps an issue unread when marking it seen fails` — TestingLibraryElementError: Unable to find an accessible element with the role "complementary" and name "Issue preview"
- `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage keeps an issue unread when the server does not mark it seen` — TestingLibraryElementError: Unable to find an accessible element with the role "complementary" and name "Issue preview"
- `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage stores selection in the URL, renders the embedded preview, and clears it` — TestingLibraryElementError: Unable to find an accessible element with the role "complementary" and name "Issue preview"
- `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage scrolls an initially selected issue into view` — TestingLibraryElementError: Unable to find an accessible element with the role "region" and name "Fix Proposed"
- `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage starts finding the root cause in Autofix when there is no Autofix state` — TestingLibraryElementError: Unable to find an accessible element with the role "complementary" and name "Issue preview"
- `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage starts making a plan in Autofix when the root cause is complete` — TestingLibraryElementError: Unable to find an accessible element with the role "complementary" and name "Issue preview"
- `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage uses action-specific icons from code changes through PR creation` — TestingLibraryElementError: Unable to find an accessible element with the role "complementary" and name "Issue preview"
- `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage labels a coding agent pull request like a Seer one` — TestingLibraryElementError: Unable to find an accessible element with the role "complementary" and name "Issue preview"
- `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage retries a failed Autofix pull request` — TestingLibraryElementError: Unable to find an accessible element with the role "complementary" and name "Issue preview"
- `static/app/views/issueDetails/groupEventDetails/groupEventDetails.spec.tsx :: groupEventDetails source-map issue content loads project content before the sample, then shows the diagnosis and event header` — TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "JSON"
- `static/app/views/automations/new.spec.tsx :: AutomationNewSettings breadcrumbs renders the parent crumb in the trail and the placeholder name as the page title` — Unable to find role="link" and name "Alerts"
- `static/app/views/automations/detail.spec.tsx :: AutomationDetail breadcrumbs renders the parent crumb in the trail and the alert name as the page title` — Unable to find role="link" and name "Alerts"
- `static/app/views/automations/edit.spec.tsx :: EditAutomation breadcrumbs renders the parent crumb in the trail and the alert name as the page title` — Unable to find role="link" and name "Alerts"
- `static/app/views/issueDetails/eventNavigation/index.spec.tsx :: EventNavigation counts renders default counts` — Unable to find role="menuitemradio" and name "Attachments N"
- `static/app/views/issueDetails/eventNavigation/index.spec.tsx :: EventNavigation counts renders 1 attachment` — Unable to find role="menuitemradio" and name "Attachments N"
- `static/app/views/issueDetails/eventNavigation/index.spec.tsx :: EventNavigation counts renders 50+ attachments` — Unable to find role="menuitemradio" and name "Attachments N+"
- `static/app/views/authV2/passwordReset/index.spec.tsx :: PasswordReset counts down before navigating to sign-in` — console.* : An update to PasswordReset inside a test was not wrapped in act(...).
- `static/app/views/authV2/passwordReset/index.spec.tsx :: PasswordReset preserves the form when password validation fails` — Error: expect(element).toBeVisible()
- `static/app/views/projectDetail/projectIssues.spec.tsx :: ProjectDetail > ProjectIssues updates tab counts when the release search changes or is cleared` — Unable to find role="radio" and name "Unhandled N"
- `static/app/views/projectDetail/projectIssues.spec.tsx :: ProjectDetail > ProjectIssues renders a segmented control` — TestingLibraryElementError: Unable to find an accessible element with the role "radio" and name "Unhandled N"
- `static/app/views/discover/landing.spec.tsx :: Discover > Landing links back to the homepage` — Unable to find role="link" and name "Errors"
- `static/app/views/issueDetails/eventDetailsHeader.spec.tsx :: EventDetailsHeader renders filters alongside the graph` — TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Close sidebar"
- `static/app/views/discover/results.spec.tsx :: Results Events displays tip when events response contains a tip` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/views/discover/results.spec.tsx :: Results Events links back to the homepage through the Discover breadcrumb` — Unable to find role="link" and name "Errors"
- `static/app/views/discover/results.spec.tsx :: Results Events links back to the Saved Queries through the Saved Queries breadcrumb` — Unable to find role="link" and name "Errors"
- `static/app/views/discover/results.spec.tsx :: Results Events doesn't render sample data alert` — Unable to find role="link" and name "Errors"
- `static/app/views/issueDetails/groupTags/tagDetailsDrawerContent.spec.tsx :: TagDetailsDrawerContent sorts tag values by the clicked column header` — TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "Last Seen"
- `static/app/views/authV2/authLogin/index.spec.tsx :: AuthLogin renders warnings above the configured login banner` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/views/issueDetails/groupDetailsLayout.spec.tsx :: GroupDetailsLayout renders children, can collapse sidebar` — TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Close sidebar"
- `static/app/views/navigation/primary/userDropdown.spec.tsx :: UserDropdown shows admin link if user is admin` — TestingLibraryElementError: Unable to find an accessible element with the role "menuitemradio" and name "Admin"
- `static/app/views/navigation/topBar.spec.tsx :: TopBar keeps only the page-title label inside the single TopBar heading` — TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "Issues"
- `static/app/views/navigation/primary/serviceIncidents.spec.tsx :: PrimaryNavigationServiceIncidents displays button and list of incidents when clicked` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/views/projectDetail/projectDetail.spec.tsx :: ProjectDetail Renders the breadcrumb trail and page title` — Unable to find role="link" and name "Projects"

</details>

### Failures by area

| area | failed |
| --- | --: |
| app/views/issueDetails | 10 |
| app/views/issueList | 10 |
| app/views/discover | 5 |
| app/views/automations | 3 |
| app/views/authV2 | 3 |
| app/views/projectDetail | 3 |
| app/views/navigation | 3 |

### Failures by error signature

| count | signature | areas | example |
| --: | --- | --- | --- |
| 9 | TestingLibraryElementError: Unable to find an accessible element with the role "complementary" and name "Issue preview" | app/views/issueList | `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage marks an issue as seen and clears its unread indicator when previewed` |
| 4 | Unable to find role="link" and name "Errors" | app/views/discover | `static/app/views/discover/landing.spec.tsx :: Discover > Landing links back to the homepage` |
| 3 | TypeError: Cannot read properties of undefined (reading 'scheduledWith') | app/views/issueDetails | `static/app/views/issueDetails/groupReplays/groupReplays.spec.tsx :: GroupReplays Replay Feature Enabled should show a list of replays and have the correct values` |
| 3 | Unable to find role="link" and name "Alerts" | app/views/automations | `static/app/views/automations/new.spec.tsx :: AutomationNewSettings breadcrumbs renders the parent crumb in the trail and the placeholder name as the page title` |
| 3 | TypeError: String.prototype.toLowerCase called on null or undefined | app/views/discover, app/views/authV2, app/views/navigation | `static/app/views/discover/results.spec.tsx :: Results Events displays tip when events response contains a tip` |
| 2 | Unable to find role="menuitemradio" and name "Attachments N" | app/views/issueDetails | `static/app/views/issueDetails/eventNavigation/index.spec.tsx :: EventNavigation counts renders default counts` |
| 2 | TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Close sidebar" | app/views/issueDetails | `static/app/views/issueDetails/eventDetailsHeader.spec.tsx :: EventDetailsHeader renders filters alongside the graph` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "region" and name "Fix Proposed" | app/views/issueList | `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage scrolls an initially selected issue into view` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "JSON" | app/views/issueDetails | `static/app/views/issueDetails/groupEventDetails/groupEventDetails.spec.tsx :: groupEventDetails source-map issue content loads project content before the sample, then shows the diagnosis and event header` |
| 1 | Unable to find role="menuitemradio" and name "Attachments N+" | app/views/issueDetails | `static/app/views/issueDetails/eventNavigation/index.spec.tsx :: EventNavigation counts renders 50+ attachments` |
| 1 | console.* : An update to PasswordReset inside a test was not wrapped in act(...). | app/views/authV2 | `static/app/views/authV2/passwordReset/index.spec.tsx :: PasswordReset counts down before navigating to sign-in` |
| 1 | Error: expect(element).toBeVisible() | app/views/authV2 | `static/app/views/authV2/passwordReset/index.spec.tsx :: PasswordReset preserves the form when password validation fails` |
| 1 | Unable to find role="radio" and name "Unhandled N" | app/views/projectDetail | `static/app/views/projectDetail/projectIssues.spec.tsx :: ProjectDetail > ProjectIssues updates tab counts when the release search changes or is cleared` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "radio" and name "Unhandled N" | app/views/projectDetail | `static/app/views/projectDetail/projectIssues.spec.tsx :: ProjectDetail > ProjectIssues renders a segmented control` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "Last Seen" | app/views/issueDetails | `static/app/views/issueDetails/groupTags/tagDetailsDrawerContent.spec.tsx :: TagDetailsDrawerContent sorts tag values by the clicked column header` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "menuitemradio" and name "Admin" | app/views/navigation | `static/app/views/navigation/primary/userDropdown.spec.tsx :: UserDropdown shows admin link if user is admin` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "Issues" | app/views/navigation | `static/app/views/navigation/topBar.spec.tsx :: TopBar keeps only the page-title label inside the single TopBar heading` |
| 1 | Unable to find role="link" and name "Projects" | app/views/projectDetail | `static/app/views/projectDetail/projectDetail.spec.tsx :: ProjectDetail Renders the breadcrumb trail and page title` |

## ctrl-dom-nohacks

Compared with jsdom: **84 pass on jsdom but fail here**, 0 missing (e.g. suite errors), 0 added, 0 fail on jsdom but pass here.

<details><summary>pass on jsdom, fail here (84)</summary>

- `static/app/views/issueDetails/groupReplays/groupReplays.spec.tsx :: GroupReplays Replay Feature Enabled should show a list of replays and have the correct values` — TypeError: Cannot read properties of undefined (reading 'scheduledWith')
- `static/app/views/issueDetails/groupReplays/groupReplays.spec.tsx :: GroupReplays Replay Feature Enabled Should render the replay player` — TypeError: Cannot read properties of undefined (reading 'scheduledWith')
- `static/app/views/issueDetails/groupReplays/groupReplays.spec.tsx :: GroupReplays Replay Feature Enabled Should switch replays when clicking` — TypeError: Cannot read properties of undefined (reading 'scheduledWith')
- `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage marks an issue as seen and clears its unread indicator when previewed` — TestingLibraryElementError: Unable to find an accessible element with the role "complementary" and name "Issue preview"
- `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage keeps an issue unread when marking it seen fails` — TestingLibraryElementError: Unable to find an accessible element with the role "complementary" and name "Issue preview"
- `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage keeps an issue unread when the server does not mark it seen` — TestingLibraryElementError: Unable to find an accessible element with the role "complementary" and name "Issue preview"
- `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage stores selection in the URL, renders the embedded preview, and clears it` — TestingLibraryElementError: Unable to find an accessible element with the role "complementary" and name "Issue preview"
- `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage scrolls an initially selected issue into view` — TestingLibraryElementError: Unable to find an accessible element with the role "region" and name "Fix Proposed"
- `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage starts finding the root cause in Autofix when there is no Autofix state` — TestingLibraryElementError: Unable to find an accessible element with the role "complementary" and name "Issue preview"
- `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage starts making a plan in Autofix when the root cause is complete` — TestingLibraryElementError: Unable to find an accessible element with the role "complementary" and name "Issue preview"
- `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage uses action-specific icons from code changes through PR creation` — TestingLibraryElementError: Unable to find an accessible element with the role "complementary" and name "Issue preview"
- `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage labels a coding agent pull request like a Seer one` — TestingLibraryElementError: Unable to find an accessible element with the role "complementary" and name "Issue preview"
- `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage retries a failed Autofix pull request` — TestingLibraryElementError: Unable to find an accessible element with the role "complementary" and name "Issue preview"
- `static/app/views/automations/new.spec.tsx :: AutomationNewSettings breadcrumbs renders the parent crumb in the trail and the placeholder name as the page title` — Unable to find role="link" and name "Alerts"
- `static/app/views/issueDetails/eventNavigation/index.spec.tsx :: EventNavigation counts renders default counts` — Unable to find role="menuitemradio" and name "Attachments N"
- `static/app/views/issueDetails/eventNavigation/index.spec.tsx :: EventNavigation counts renders 1 attachment` — Unable to find role="menuitemradio" and name "Attachments N"
- `static/app/views/issueDetails/eventNavigation/index.spec.tsx :: EventNavigation counts renders 50+ attachments` — Unable to find role="menuitemradio" and name "Attachments N+"
- `static/app/views/automations/edit.spec.tsx :: EditAutomation breadcrumbs renders the parent crumb in the trail and the alert name as the page title` — Unable to find role="link" and name "Alerts"
- `static/app/views/authV2/passwordReset/index.spec.tsx :: PasswordReset counts down before navigating to sign-in` — console.* : An update to PasswordReset inside a test was not wrapped in act(...).
- `static/app/views/authV2/passwordReset/index.spec.tsx :: PasswordReset preserves the form when password validation fails` — Error: expect(element).toBeVisible()
- `static/app/views/projectDetail/projectIssues.spec.tsx :: ProjectDetail > ProjectIssues updates tab counts when the release search changes or is cleared` — Unable to find role="radio" and name "Unhandled N"
- `static/app/views/projectDetail/projectIssues.spec.tsx :: ProjectDetail > ProjectIssues renders a segmented control` — TestingLibraryElementError: Unable to find an accessible element with the role "radio" and name "Unhandled N"
- `static/app/views/automations/detail.spec.tsx :: AutomationDetail breadcrumbs renders the parent crumb in the trail and the alert name as the page title` — Unable to find role="link" and name "Alerts"
- `static/app/views/discover/landing.spec.tsx :: Discover > Landing links back to the homepage` — Unable to find role="link" and name "Errors"
- `static/app/views/issueDetails/groupEventDetails/groupEventDetails.spec.tsx :: groupEventDetails source-map issue content loads project content before the sample, then shows the diagnosis and event header` — TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "JSON"
- `static/app/views/issueDetails/eventDetailsHeader.spec.tsx :: EventDetailsHeader renders filters alongside the graph` — TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Close sidebar"
- `static/app/views/projectDetail/projectDetail.spec.tsx :: ProjectDetail Renders the breadcrumb trail and page title` — Unable to find role="link" and name "Projects"
- `static/app/views/discover/results.spec.tsx :: Results Events displays tip when events response contains a tip` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/views/discover/results.spec.tsx :: Results Events links back to the homepage through the Discover breadcrumb` — Unable to find role="link" and name "Errors"
- `static/app/views/discover/results.spec.tsx :: Results Events links back to the Saved Queries through the Saved Queries breadcrumb` — Unable to find role="link" and name "Errors"
- `static/app/views/discover/results.spec.tsx :: Results Events doesn't render sample data alert` — Unable to find role="link" and name "Errors"
- `static/app/views/authV2/authLogin/index.spec.tsx :: AuthLogin renders warnings above the configured login banner` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/views/discover/table/tableView.spec.tsx :: TableView > CellActions handles add cell action on null value` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/tableView.spec.tsx :: TableView > CellActions handles add cell action on null value replace has condition` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/tableView.spec.tsx :: TableView > CellActions handles add cell action on string value replace negation` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/tableView.spec.tsx :: TableView > CellActions handles add cell action with multiple y axis` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/tableView.spec.tsx :: TableView > CellActions handles exclude cell action on string value` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/tableView.spec.tsx :: TableView > CellActions handles exclude cell action on string value replace inclusion` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/tableView.spec.tsx :: TableView > CellActions handles exclude cell action on null value` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/tableView.spec.tsx :: TableView > CellActions handles exclude cell action on null value replace condition` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/tableView.spec.tsx :: TableView > CellActions handles greater than cell action on number value` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/tableView.spec.tsx :: TableView > CellActions handles less than cell action on number value` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/tableView.spec.tsx :: TableView > CellActions handles go to release` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/tableView.spec.tsx :: TableView > CellActions shows events with value less than selected custom performance metric` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/navigation/primary/userDropdown.spec.tsx :: UserDropdown shows admin link if user is admin` — TestingLibraryElementError: Unable to find an accessible element with the role "menuitemradio" and name "Admin"
- `static/app/views/issueDetails/groupTags/tagDetailsDrawerContent.spec.tsx :: TagDetailsDrawerContent renders a list of tag values` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/issueDetails/groupTags/tagDetailsDrawerContent.spec.tsx :: TagDetailsDrawerContent sorts tag values by the clicked column header` — TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "Last Seen"
- `static/app/views/issueDetails/groupTags/tagDetailsDrawerContent.spec.tsx :: TagDetailsDrawerContent navigates to issue details events tab with correct query params` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/issueDetails/groupTags/tagDetailsDrawerContent.spec.tsx :: TagDetailsDrawerContent navigates to explore with issue + tag query` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/issueDetails/groupTags/tagDetailsDrawerContent.spec.tsx :: TagDetailsDrawerContent renders empty tag value label and hides copy action` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/issueDetails/groupDetailsLayout.spec.tsx :: GroupDetailsLayout renders children, can collapse sidebar` — TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Close sidebar"
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction hover menu button keeps the trigger revealed while the menu is open` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction opening the menu toggles the menu on click` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions add button appends condition` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions exclude button adds condition` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions exclude button appends exclusions` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions go to release button goes to release health page` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions greater than button adds condition` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions less than button adds condition` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions does not offer link actions for wildcard URLs` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions does not offer open link for invalid external anchors` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions keeps external links in the cell without duplicate menu actions` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions error.handled with null adds condition` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions error.type with array values adds condition` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions error.handled with 0 adds condition` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions show appropriate actions for string cells` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions does not offer filter actions for array cells` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions offers filter actions for null array cells` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions show appropriate actions for string cells with null values` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions show appropriate actions for number cells` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions show appropriate actions for date cells` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions show appropriate actions for release cells` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions show appropriate actions for empty release cells` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions show appropriate actions for measurement cells` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions show appropriate actions for empty measurement cells` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/discover/table/cellAction.spec.tsx :: Discover -> CellAction per cell actions show appropriate actions for numeric function cells` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/authV2/authLogin/components/organizationAuth.spec.tsx :: OrganizationAuth renders organization SSO and join request actions` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/issueDetails/groupFeatureFlags/details/flagDetailsDrawerContent.spec.tsx :: FlagDetailsDrawerContent renders a list of tag values` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
- `static/app/views/navigation/primary/serviceIncidents.spec.tsx :: PrimaryNavigationServiceIncidents displays button and list of incidents when clicked` — TypeError: String.prototype.toLowerCase called on null or undefined
- `static/app/views/navigation/topBar.spec.tsx :: TopBar keeps only the page-title label inside the single TopBar heading` — TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "Issues"
- `static/app/views/authV2/useBrandedArtworkLoading.spec.tsx :: useBrandedArtworkLoading starts all desktop requests immediately and waits for every image to decode` — TypeError: mql.addEventListener is not a function
- `static/app/views/authV2/useBrandedArtworkLoading.spec.tsx :: useBrandedArtworkLoading finishes loading when an image fails to decode` — TypeError: mql.addEventListener is not a function
- `static/app/views/authV2/useBrandedArtworkLoading.spec.tsx :: useBrandedArtworkLoading loads only the critter when the side illustration is hidden on mobile` — Error: expect(received).toHaveLength(expected)
- `static/app/views/issueDetails/eventTitle.spec.tsx :: EventNavigation can copy event ID` — Error: Unable to perform pointer interaction as the element has `pointer-events: none`:

</details>

### Failures by area

| area | failed |
| --- | --: |
| app/views/discover | 42 |
| app/views/issueDetails | 16 |
| app/views/issueList | 10 |
| app/views/authV2 | 7 |
| app/views/automations | 3 |
| app/views/projectDetail | 3 |
| app/views/navigation | 3 |

### Failures by error signature

| count | signature | areas | example |
| --: | --- | --- | --- |
| 44 | Error: Unable to perform pointer interaction as the element has 'pointer-events: none': | app/views/discover, app/views/issueDetails, app/views/authV2 | `static/app/views/discover/table/tableView.spec.tsx :: TableView > CellActions handles add cell action on null value` |
| 9 | TestingLibraryElementError: Unable to find an accessible element with the role "complementary" and name "Issue preview" | app/views/issueList | `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage marks an issue as seen and clears its unread indicator when previewed` |
| 4 | Unable to find role="link" and name "Errors" | app/views/discover | `static/app/views/discover/landing.spec.tsx :: Discover > Landing links back to the homepage` |
| 3 | TypeError: Cannot read properties of undefined (reading 'scheduledWith') | app/views/issueDetails | `static/app/views/issueDetails/groupReplays/groupReplays.spec.tsx :: GroupReplays Replay Feature Enabled should show a list of replays and have the correct values` |
| 3 | Unable to find role="link" and name "Alerts" | app/views/automations | `static/app/views/automations/new.spec.tsx :: AutomationNewSettings breadcrumbs renders the parent crumb in the trail and the placeholder name as the page title` |
| 3 | TypeError: String.prototype.toLowerCase called on null or undefined | app/views/discover, app/views/authV2, app/views/navigation | `static/app/views/discover/results.spec.tsx :: Results Events displays tip when events response contains a tip` |
| 2 | Unable to find role="menuitemradio" and name "Attachments N" | app/views/issueDetails | `static/app/views/issueDetails/eventNavigation/index.spec.tsx :: EventNavigation counts renders default counts` |
| 2 | TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Close sidebar" | app/views/issueDetails | `static/app/views/issueDetails/eventDetailsHeader.spec.tsx :: EventDetailsHeader renders filters alongside the graph` |
| 2 | TypeError: mql.addEventListener is not a function | app/views/authV2 | `static/app/views/authV2/useBrandedArtworkLoading.spec.tsx :: useBrandedArtworkLoading starts all desktop requests immediately and waits for every image to decode` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "region" and name "Fix Proposed" | app/views/issueList | `static/app/views/issueList/pages/inbox/index.spec.tsx :: InboxPage scrolls an initially selected issue into view` |
| 1 | Unable to find role="menuitemradio" and name "Attachments N+" | app/views/issueDetails | `static/app/views/issueDetails/eventNavigation/index.spec.tsx :: EventNavigation counts renders 50+ attachments` |
| 1 | console.* : An update to PasswordReset inside a test was not wrapped in act(...). | app/views/authV2 | `static/app/views/authV2/passwordReset/index.spec.tsx :: PasswordReset counts down before navigating to sign-in` |
| 1 | Error: expect(element).toBeVisible() | app/views/authV2 | `static/app/views/authV2/passwordReset/index.spec.tsx :: PasswordReset preserves the form when password validation fails` |
| 1 | Unable to find role="radio" and name "Unhandled N" | app/views/projectDetail | `static/app/views/projectDetail/projectIssues.spec.tsx :: ProjectDetail > ProjectIssues updates tab counts when the release search changes or is cleared` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "radio" and name "Unhandled N" | app/views/projectDetail | `static/app/views/projectDetail/projectIssues.spec.tsx :: ProjectDetail > ProjectIssues renders a segmented control` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "JSON" | app/views/issueDetails | `static/app/views/issueDetails/groupEventDetails/groupEventDetails.spec.tsx :: groupEventDetails source-map issue content loads project content before the sample, then shows the diagnosis and event header` |
| 1 | Unable to find role="link" and name "Projects" | app/views/projectDetail | `static/app/views/projectDetail/projectDetail.spec.tsx :: ProjectDetail Renders the breadcrumb trail and page title` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "menuitemradio" and name "Admin" | app/views/navigation | `static/app/views/navigation/primary/userDropdown.spec.tsx :: UserDropdown shows admin link if user is admin` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "Last Seen" | app/views/issueDetails | `static/app/views/issueDetails/groupTags/tagDetailsDrawerContent.spec.tsx :: TagDetailsDrawerContent sorts tag values by the clicked column header` |
| 1 | TestingLibraryElementError: Unable to find an accessible element with the role "link" and name "Issues" | app/views/navigation | `static/app/views/navigation/topBar.spec.tsx :: TopBar keeps only the page-title label inside the single TopBar heading` |
| 1 | Error: expect(received).toHaveLength(expected) | app/views/authV2 | `static/app/views/authV2/useBrandedArtworkLoading.spec.tsx :: useBrandedArtworkLoading loads only the critter when the side illustration is hidden on mobile` |

Raw Jest JSON, logs, worker samples and receipts: `downstream/sentry/output/views-triage/<mode>/` (gitignored).
