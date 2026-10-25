// What changed between two aria snapshots (not part of upstream @testing-library/dom):
//
//   const before = ariaSnapshot();
//   await user.click(screen.getByRole("button", { name: "Menu" }));
//   console.log(diffAriaSnapshots(before, ariaSnapshot()));
//
//     - banner:
//   -   - button "Menu" [expanded=false]
//   +   - button "Menu" [expanded]
//   +   - menu:
//   +     - menuitem "Settings"
//
// A line diff (longest common subsequence) where each changed line is shown with its
// ancestor lines (the YAML parents, by indentation) as context and `…` for skipped lines.

/** Lines removed (`- `), added (`+ `) and their unchanged parents (`  `); "(no changes)" if equal. */
export function diffAriaSnapshots(before: string, after: string): string {
  const a = before.split("\n");
  const b = after.split("\n");
  const ops = diffLines(a, b);
  const show = new Uint8Array(ops.length);
  let changed = false;
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].kind === "=") continue;
    changed = true;
    show[i] = 1;
    // Mark the unchanged ancestors: the nearest earlier lines with smaller indentation.
    let target = indentOf(ops[i].text);
    for (let j = i - 1; j >= 0 && target > 0; j--) {
      if (ops[j].kind !== "=") continue;
      const indent = indentOf(ops[j].text);
      if (indent < target) {
        show[j] = 1;
        target = indent;
      }
    }
  }
  if (!changed) return "(no changes)";
  const out: string[] = [];
  let last = -1;
  for (let i = 0; i < ops.length; i++) {
    if (show[i] === 0) continue;
    if (last !== -1 && i !== last + 1) out.push("  …");
    out.push(`${ops[i].kind === "=" ? " " : ops[i].kind} ${ops[i].text}`);
    last = i;
  }
  return out.join("\n");
}

export interface Op {
  kind: "=" | "-" | "+";
  text: string;
}

function indentOf(line: string): number {
  let i = 0;
  while (i < line.length && line.charCodeAt(i) === 32) i++;
  return i;
}

/** LCS line diff; the common prefix and suffix are trimmed first, so typical edits stay small. */
export function diffLines(a: string[], b: string[]): Op[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const ops: Op[] = [];
  for (let i = 0; i < start; i++) ops.push({ kind: "=", text: a[i] });
  const n = endA - start;
  const m = endB - start;
  if (n * m > 4_000_000) {
    // Too large for the table: report the middle as replaced.
    for (let i = start; i < endA; i++) ops.push({ kind: "-", text: a[i] });
    for (let j = start; j < endB; j++) ops.push({ kind: "+", text: b[j] });
  } else {
    // lcs[i][j] = LCS length of a[start+i..endA) and b[start+j..endB)
    const width = m + 1;
    const lcs = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * width + j] =
          a[start + i] === b[start + j]
            ? lcs[(i + 1) * width + j + 1] + 1
            : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[start + i] === b[start + j]) {
        ops.push({ kind: "=", text: a[start + i] });
        i++;
        j++;
      } else if (i < n && (j === m || lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])) {
        ops.push({ kind: "-", text: a[start + i] });
        i++;
      } else {
        ops.push({ kind: "+", text: b[start + j] });
        j++;
      }
    }
  }
  for (let i = endA; i < a.length; i++) ops.push({ kind: "=", text: a[i] });
  return ops;
}
