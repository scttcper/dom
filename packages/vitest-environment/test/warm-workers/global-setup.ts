// Runs in Vitest's main process before the first worker is needed, after the plugin's first spare
// was forked: workers get the main process's environment variables as they are when the run starts.
export default function setup(): void {
  process.env.FIXTURE_FROM_GLOBAL_SETUP = "set";
}
