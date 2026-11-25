import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PipelineStageChart, RevenueChart } from "./dashboard-charts";

it("shows an empty state for absent sales and zero-count stages", () => {
  expect(
    renderToStaticMarkup(
      createElement(RevenueChart, {
        data: [{ month: "Nov 26", closedSales: 0, forecast: 0 }],
        currency: "PHP",
      }),
    ),
  ).toContain("No sales data yet.");
  for (const data of [[], [{ name: "Reservation", value: 0 }]]) {
    expect(renderToStaticMarkup(createElement(PipelineStageChart, { data }))).toContain(
      "No opportunities yet.",
    );
  }
});

it("preserves stage counts and their shares with complete names", () => {
  const html = renderToStaticMarkup(
    createElement(PipelineStageChart, {
      data: [
        { name: "CTS Signed - Won", value: 3 },
        { name: "Reservation", value: 1 },
      ],
    }),
  );
  expect(html).toContain("CTS Signed - Won");
  expect(html).toContain("Reservation");
  expect(html).toContain("75%");
  expect(html).toContain("25%");
  expect(html).toContain("Count");
  expect(html).toContain("Share");
});
