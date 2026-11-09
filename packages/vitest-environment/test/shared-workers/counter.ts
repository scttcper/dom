// First-party module state: fresh for each test file when the module graph is reset.
let loads = 0;
export const load = (): number => ++loads;
