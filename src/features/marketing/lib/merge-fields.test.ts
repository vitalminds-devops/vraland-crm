import { describe, expect, it } from "vitest";

import { render, textToHtml } from "./merge-fields";

describe("textToHtml", () => {
  it("makes paragraphs from blank-line blocks and keeps line breaks", () => {
    expect(textToHtml("Hi {{first_name}},\n\nNew units are open.\nCall us.")).toBe(
      "<p>Hi {{first_name}},</p>\n<p>New units are open.<br>Call us.</p>",
    );
  });

  it("escapes markup so typed text never becomes HTML", () => {
    expect(textToHtml("<b>5 & up</b>")).toBe("<p>&lt;b&gt;5 &amp; up&lt;/b&gt;</p>");
  });

  it("leaves the merge tag for the sender to fill", () => {
    expect(render(textToHtml("Hi {{first_name}}"), "Ana")).toBe("<p>Hi Ana</p>");
  });
});
