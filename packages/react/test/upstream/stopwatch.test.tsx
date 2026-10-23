// Ported from @testing-library/react@16.3.3
// https://github.com/testing-library/react-testing-library/blob/v16.3.3/src/__tests__/stopwatch.js
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test, vi } from "vitest";
import * as React from "react";
import { render, fireEvent, screen } from "@rtd/react";

class StopWatch extends React.Component<{}, { lapse: number; running: boolean }> {
  state = { lapse: 0, running: false };
  timer: any;
  handleRunClick = () => {
    this.setState((state) => {
      if (state.running) {
        clearInterval(this.timer);
      } else {
        const startTime = Date.now() - this.state.lapse;
        this.timer = setInterval(() => {
          this.setState({ lapse: Date.now() - startTime });
        });
      }
      return { running: !state.running };
    });
  };
  handleClearClick = () => {
    clearInterval(this.timer);
    this.setState({ lapse: 0, running: false });
  };
  componentWillUnmount() {
    clearInterval(this.timer);
  }
  render() {
    const { lapse, running } = this.state;
    return (
      <div>
        <span>{lapse}ms</span>
        <button onClick={this.handleRunClick}>{running ? "Stop" : "Start"}</button>
        <button onClick={this.handleClearClick}>Clear</button>
      </div>
    );
  }
}

const sleep = (t: number) => new Promise((resolve) => setTimeout(resolve, t));

test("unmounts a component", async () => {
  const { unmount, container } = render(<StopWatch />);
  fireEvent.click(screen.getByText("Start"));
  unmount();
  // hey there reader! You don't need to have an assertion like this one
  // this is just me making sure that the unmount function works.
  // You don't need to do this in your apps. Just rely on the fact that this works.
  expect(container).toBeEmptyDOMElement();
  // just wait to see if the interval is cleared or not
  // if it's not, then we'll call setState on an unmounted component
  // and get an error.
  await sleep(5);
});
