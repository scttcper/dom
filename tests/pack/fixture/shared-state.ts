// First-party module state for the shared-worker check: fresh for each test file.
let loads = 0;
export const load = (): number => ++loads;
