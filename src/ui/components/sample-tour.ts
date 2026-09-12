import { el } from "./dom.js";

/** Labels and actions come from the review's JSON view list and controller. */
export function createSampleTour(title: string, views: readonly { title: string }[], onSelect: (index: number) => void): HTMLElement {
  return el("section", { class: "sample-tour", "aria-label": title }, [
    el("div", { class: "section-title" }, [title]),
    ...views.map((view, index) => el("button", { type: "button", onclick: () => onSelect(index) }, [view.title])),
  ]);
}
