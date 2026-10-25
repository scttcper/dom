const t0 = performance.now();
const { default: env } = await import("../src/index.ts");
const t1 = performance.now();
export default {
  ...env,
  setup(global: unknown, options: Record<string, unknown>) {
    const t2 = performance.now();
    const r = env.setup(global, options);
    console.error(
      `TIMING import=${(t1 - t0).toFixed(1)} setup=${(performance.now() - t2).toFixed(2)} sinceProcessStart=${t0.toFixed(0)}`,
    );
    return r;
  },
};
