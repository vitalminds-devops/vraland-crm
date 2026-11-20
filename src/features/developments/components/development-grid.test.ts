import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DevelopmentGrid } from "./development-grid";

it.each([{ propertyNames: [] }, { propertyNames: ["Tower 1"] }])(
  "offers a view action to viewers with visible properties %j",
  ({ propertyNames }) => {
    const html = renderToStaticMarkup(
      createElement(DevelopmentGrid, {
        canUpdate: false,
        rows: [
          {
            id: "development",
            name: "Fairfield Heights",
            code: "DEV-1",
            status: "planning",
            city: null,
            province: null,
            coverImageStorageKey: null,
            propertyNames,
          },
        ],
      }),
    );
    expect(html).toContain("View properties");
    expect(html).toContain(
      `${propertyNames.length} ${propertyNames.length === 1 ? "property" : "properties"}`,
    );
    expect(html).toContain('aria-label="View properties in Fairfield Heights"');
    expect(html).toContain('href="/developments/development"');
    expect(html).not.toContain("Add property");
    expect(html).not.toContain("Add units");
    expect(html).not.toContain('href="/developments/development/edit"');
  },
);

it.each([false, true])("explains an empty list with filters %s", (hasFilters) => {
  const html = renderToStaticMarkup(
    createElement(DevelopmentGrid, { canUpdate: false, rows: [], hasFilters }),
  );
  expect(html).toContain(hasFilters ? "No matching developments" : "No developments yet");
  expect(html).toContain(hasFilters ? "clear the filters" : "once added");
});
