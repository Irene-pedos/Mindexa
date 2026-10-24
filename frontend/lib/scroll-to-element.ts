// lib/scroll-to-element.ts
// Smoothly scrolls an element into view inside whichever container actually scrolls, leaving
// room for sticky headers. `scrollIntoView` alone often lands under a sticky bar, or does
// nothing when the page scrolls inside a layout wrapper rather than the window.

function nearestScrollParent(el: HTMLElement): HTMLElement | null {
  let parent = el.parentElement;
  while (parent) {
    const overflowY = getComputedStyle(parent).overflowY;
    if (/(auto|scroll)/.test(overflowY) && parent.scrollHeight > parent.clientHeight) return parent;
    parent = parent.parentElement;
  }
  return null;
}

/** Scroll so `el` sits `offset` px below the top of its scroll container, or centered in viewport. */
export function scrollToElement(el: HTMLElement, offset = 140): void {
  try {
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  } catch {
    const container = nearestScrollParent(el);
    if (container) {
      const delta = el.getBoundingClientRect().top - container.getBoundingClientRect().top;
      container.scrollTo({ top: container.scrollTop + delta - offset, behavior: "smooth" });
    } else {
      window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - offset, behavior: "smooth" });
    }
  }
}

/**
 * Like `scrollToElement` by id, but waits for the element to exist: after a step change, a
 * filter change or a drawer closing, the card may render a moment later.
 */
export function scrollToElementId(id: string, offset = 140, attempts = 15): void {
  const tryScroll = (left: number) => {
    const el = document.getElementById(id);
    if (el) {
      scrollToElement(el, offset);
      return;
    }
    if (left > 0) window.setTimeout(() => tryScroll(left - 1), 60);
  };
  tryScroll(attempts);
}
