// Jest fixture for jest-environment-prototype-state-shared-across-files.test.ts. Two identical
// files run in one worker (--runInBand); whichever runs second must not see the first's patch.
test("interface prototypes are fresh in every test file", () => {
  expect(Object.getOwnPropertyDescriptor(HTMLElement.prototype, "__downstreamMarker")).toBeUndefined();
  // What upstream React Aria tests do in beforeAll without restoring (e.g. useLandmark's
  // jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get') ... mockReset()).
  Object.defineProperty(HTMLElement.prototype, "__downstreamMarker", { value: 1, configurable: true });
});
