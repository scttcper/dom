// Jest twin of app.tsx (Jest runs these without a transform, so no JSX).
"use strict";
const React = require("react");

const h = React.createElement;

function Signup() {
  const [name, setName] = React.useState("");
  const [submitted, setSubmitted] = React.useState(null);
  return h(
    "form",
    {
      onSubmit: (event) => {
        event.preventDefault();
        setSubmitted(name);
      },
    },
    h("label", { htmlFor: "name" }, "Name"),
    h("input", { id: "name", value: name, onChange: (event) => setName(event.target.value) }),
    h("input", { type: "checkbox", "aria-label": "Subscribe" }),
    h("button", { type: "submit", disabled: name === "" }, "Sign up"),
    submitted !== null && h("p", { role: "status" }, `Welcome, ${submitted}!`),
  );
}

module.exports = { Signup, h };
