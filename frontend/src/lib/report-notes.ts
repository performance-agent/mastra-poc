export type QuoteBox = { top: number; left: number; width: number; height: number };

type Anchor = { node: Text; offset: number };

export function quoteFromSelection(root: HTMLElement, range: Range) {
  if (!root.contains(range.commonAncestorContainer)) return null;
  const { chars, anchors } = readableText(root);
  const start = boundaryIndex(anchors, range.startContainer, range.startOffset, "start");
  const end = boundaryIndex(anchors, range.endContainer, range.endOffset, "end");
  if (start >= 0 && end > start) {
    const text = chars.slice(start, end).join("").replace(/\s+/g, " ").trim();
    if (text.length >= 2) return text;
  }
  const fallback = range.toString().replace(/\s+/g, " ").trim();
  return fallback.length >= 2 ? fallback : null;
}

function boundaryIndex(anchors: Anchor[], container: Node, offset: number, edge: "start" | "end") {
  const point = textPoint(container, offset, edge);
  if (!point) return -1;
  if (edge === "start") {
    for (let index = 0; index < anchors.length; index++) {
      const anchor = anchors[index];
      if (anchor.node === point.node && anchor.offset >= point.offset) return index;
    }
    let passed = false;
    for (let index = 0; index < anchors.length; index++) {
      if (anchors[index].node === point.node) passed = true;
      else if (passed) return index;
    }
    return -1;
  }
  let end = -1;
  for (let index = 0; index < anchors.length; index++) {
    const anchor = anchors[index];
    if (anchor.node === point.node && anchor.offset < point.offset) end = index + 1;
  }
  return end;
}

function textPoint(container: Node, offset: number, edge: "start" | "end") {
  if (container.nodeType === Node.TEXT_NODE) return { node: container as Text, offset };
  const child =
    edge === "start" ? container.childNodes[offset] : container.childNodes[offset - 1];
  if (!child) return null;
  if (child.nodeType === Node.TEXT_NODE) {
    return { node: child as Text, offset: edge === "start" ? 0 : child.textContent?.length ?? 0 };
  }
  const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
  let match: Text | null = null;
  let current = walker.nextNode();
  while (current) {
    match = current as Text;
    if (edge === "start") break;
    current = walker.nextNode();
  }
  if (!match) return null;
  return { node: match, offset: edge === "start" ? 0 : match.data.length };
}

export function quoteLayout(
  root: HTMLElement,
  quote: string,
  origins: { column: HTMLElement; margin: HTMLElement | null },
) {
  const range = locateRange(root, quote);
  const empty = { column: [] as QuoteBox[], marginTop: null as number | null };
  if (!range) return empty;
  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 1 && rect.height > 1,
  );
  if (rects.length === 0) return empty;
  const columnBase = origins.column.getBoundingClientRect();
  const marginBase = origins.margin?.getBoundingClientRect();
  return {
    column: rects.map((rect) => ({
      top: rect.top - columnBase.top,
      left: rect.left - columnBase.left,
      width: rect.width,
      height: rect.height,
    })),
    marginTop: marginBase ? rects[0].top - marginBase.top : null,
  };
}

function locateRange(root: HTMLElement, quote: string) {
  const needle = quote.replace(/\s+/g, " ").trim();
  if (needle.length < 2) return null;
  const { chars, anchors } = readableText(root);
  const direct = findMatch(chars, anchors, needle);
  if (direct) return direct;
  const compactChars: string[] = [];
  const compactAnchors: Anchor[] = [];
  chars.forEach((char, index) => {
    if (char === " ") return;
    compactChars.push(char);
    compactAnchors.push(anchors[index]);
  });
  return findMatch(compactChars, compactAnchors, needle.replace(/ /g, ""));
}

function findMatch(chars: string[], anchors: Anchor[], needle: string) {
  if (needle.length < 2) return null;
  const haystack = chars.join("");
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return null;
    const range = rangeFor(anchors, chars, at, needle.length);
    if (range && visible(range)) return range;
    from = at + 1;
  }
  return null;
}

function readableText(root: HTMLElement) {
  const chars: string[] = [];
  const anchors: Anchor[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let previousBlock: Element | null = null;
  let pendingBreak = false;
  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    const parent = text.parentElement;
    if (!parent || skipped(parent) || !text.data) {
      current = walker.nextNode();
      continue;
    }
    const block = innermostBlock(text, root);
    if (chars.length > 0 && block !== previousBlock) pendingBreak = true;
    previousBlock = block;
    for (let index = 0; index < text.data.length; index++) {
      const char = text.data[index];
      if (/\s/.test(char)) {
        pendingBreak = false;
        pushSpace(chars, anchors, text, index);
        continue;
      }
      if (pendingBreak) {
        pushSpace(chars, anchors, text, index);
        pendingBreak = false;
      }
      chars.push(char);
      anchors.push({ node: text, offset: index });
    }
    current = walker.nextNode();
  }
  return { chars, anchors };
}

function pushSpace(chars: string[], anchors: Anchor[], node: Text, offset: number) {
  if (chars.length === 0 || chars[chars.length - 1] === " ") return;
  chars.push(" ");
  anchors.push({ node, offset });
}

function rangeFor(anchors: Anchor[], chars: string[], at: number, length: number) {
  let start = at;
  let end = at + length - 1;
  while (start <= end && chars[start] === " ") start += 1;
  while (end >= start && chars[end] === " ") end -= 1;
  const first = anchors[start];
  const last = anchors[end];
  if (!first || !last) return null;
  try {
    const range = document.createRange();
    range.setStart(first.node, first.offset);
    range.setEnd(last.node, last.offset + 1);
    return range;
  } catch {
    return null;
  }
}

function visible(range: Range) {
  return Array.from(range.getClientRects()).some((rect) => rect.width > 1 && rect.height > 1);
}

function skipped(element: Element) {
  return Boolean(
    element.closest(".no-print, .only-print, button, input, textarea, script, style"),
  );
}

const BLOCK_TAG =
  /^(ADDRESS|ARTICLE|BLOCKQUOTE|DD|DIV|DL|DT|FIELDSET|FIGCAPTION|FIGURE|FOOTER|FORM|H[1-6]|HEADER|HR|LI|MAIN|NAV|OL|P|PRE|SECTION|TABLE|TBODY|THEAD|TR|UL)$/;

function innermostBlock(node: Text, root: HTMLElement) {
  let element = node.parentElement;
  while (element && element !== root) {
    if (BLOCK_TAG.test(element.tagName)) return element;
    element = element.parentElement;
  }
  return node.parentElement;
}
