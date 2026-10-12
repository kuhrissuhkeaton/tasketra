import { Fragment, type ReactNode } from "react";

/**
 * Lets a single-word label such as an email address or "first.last" wrap at its
 * natural joints (after @, ., _ and -) instead of in the middle of a word.
 * Names with spaces, and words with no joints, are returned unchanged. The
 * text content is identical; only <wbr> hints are added.
 */
export function breakable(text: string): ReactNode {
  if (/\s/.test(text) || !/[@._-]/.test(text)) return text;
  const parts = text.split(/(?<=[@._-])/);
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <wbr />}
      {part}
    </Fragment>
  ));
}
