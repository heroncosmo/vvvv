import { Children, cloneElement, isValidElement, type ReactNode } from "react";

import { repairMojibakeText } from "@shared/mojibake";

const REPAIRABLE_STRING_PROPS = new Set([
  "alt",
  "aria-label",
  "label",
  "placeholder",
  "title",
]);

export function repairReactNodeText(node: ReactNode): ReactNode {
  if (typeof node === "string") {
    return repairMojibakeText(node);
  }

  if (Array.isArray(node)) {
    return node.map((child) => repairReactNodeText(child));
  }

  if (!isValidElement(node)) {
    return node;
  }

  const nextProps: Record<string, unknown> = {};
  let changed = false;

  for (const [key, value] of Object.entries(node.props ?? {})) {
    if (key === "children") {
      const repairedChildren = Children.map(value as ReactNode, (child) => repairReactNodeText(child));
      if (repairedChildren !== value) {
        nextProps.children = repairedChildren;
        changed = true;
      }
      continue;
    }

    if (typeof value === "string" && REPAIRABLE_STRING_PROPS.has(key)) {
      const repairedValue = repairMojibakeText(value);
      if (repairedValue !== value) {
        nextProps[key] = repairedValue;
        changed = true;
      }
    }
  }

  return changed ? cloneElement(node, nextProps) : node;
}
