import type * as hast from "hast";
import { fromHtml } from "hast-util-from-html";
import { hasAttribute } from "hast-util-get-attribute";
import { select, selectAll } from "hast-util-select";
import fs from "node:fs";
import type * as unified from "unified";
import upath from "upath";

import { ensureElemId, touchSync } from "./util.js";

type HastHeadingElement = hast.Element & {
  tagName: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
};

const headingsBrand = Symbol();
type HeadingsSelector = string & { [headingsBrand]: unknown };
export function h(...levels: number[]) {
  return levels
    .filter((lv) => 1 <= lv && lv <= 6)
    .map((lv) => `h${lv}`)
    .join(", ") as HeadingsSelector;
}

function ensureId(
  root: hast.Root,
  selector: HeadingsSelector,
  ignoreAttr: string,
) {
  selectAll(selector, root)
    .filter(
      (elem) => !hasAttribute(elem, ignoreAttr) || !hasAttribute(elem, "id"),
    )
    .forEach((elem) => ensureElemId(root, elem));
}

function buildToC(
  tocRoot: hast.Element,
  root: hast.Root,
  selector: HeadingsSelector,
  ignoreAttr: string,
  relPath: string | null,
  overrideDepth:
    | ((level: number, elem: HastHeadingElement) => number)
    | undefined,
) {
  const rootStack: hast.Node[][] = [tocRoot.children];
  const itemStack: (hast.Element | null)[] = [null];

  const elems = (selectAll(selector, root) as HastHeadingElement[])
    .filter((elem) => !hasAttribute(elem, ignoreAttr))
    .map((elem) => {
      if (!hasAttribute(elem, "id")) {
        ensureElemId(root, elem);
      }
      return elem;
    });

  for (const elem of elems) {
    const level: 1 | 2 | 3 | 4 | 5 | 6 | typeof NaN = Number.parseInt(
      elem.tagName.slice(1),
    );
    if (Number.isNaN(level)) {
      continue;
    }
    const depth = overrideDepth
      ? ((ret = overrideDepth(level, elem)) => Math.min(Math.max(1, ret), 6))()
      : level;

    // Adjust stack to target depth
    while (rootStack.length > depth) {
      rootStack.pop();
      itemStack.pop();
    }

    while (rootStack.length < depth) {
      const newOl: hast.Element = {
        type: "element",
        tagName: "ol",
        properties: {},
        children: [],
      };

      const parent = itemStack[itemStack.length - 1];
      if (parent) {
        parent.children.push(newOl);
      } else {
        // Create empty li for skipped depth
        const emptyLi: hast.Element = {
          type: "element",
          tagName: "li",
          properties: {
            class: `toc-level${rootStack.length}`,
          },
          children: [newOl],
        };
        rootStack[rootStack.length - 1]!.push(emptyLi);
        itemStack[itemStack.length - 1] = emptyLi;
      }

      rootStack.push(newOl.children);
      itemStack.push(null);
    }

    // Create the list item
    const innerHtml = elem.children;

    const removePosition = (children: hast.ElementContent[]): void => {
      for (const node of children) {
        delete node["position"];
        if ("children" in node) {
          removePosition(node.children);
        }
      }
    };

    removePosition(innerHtml);
    const listItem: hast.Element = {
      type: "element",
      tagName: "li",
      properties: {
        class: `toc-level${level}`,
      },
      children: [
        {
          type: "element",
          tagName: "a",
          properties: {
            href:
              (relPath === null ? "" : relPath) + "#" + elem.properties!["id"]!,
          },
          children: innerHtml,
        },
      ],
    };

    rootStack[rootStack.length - 1]!.push(listItem);
    itemStack[itemStack.length - 1] = listItem;
  }
}

type Entry = { path: string; ignoreUpdate: boolean };

export type Config = {
  selector: HeadingsSelector;
  ignoreAttr?: string;
  entryContext?: string;
  tocEntryMap: Readonly<{
    [toc: string]: readonly (string | Entry)[];
  }>;
  overrideDepth?: (level: number, elem: HastHeadingElement) => number;
};

const recursiveFlag = "vivliostyleToC";

export const toc: unified.Plugin<[Readonly<Config>]> = function (
  this,
  { selector, ignoreAttr, entryContext, tocEntryMap, overrideDepth },
) {
  ignoreAttr ??= "data-toc-ignore";
  const ctx = upath.resolve(process.cwd(), entryContext ?? ".");
  const normalizedTocEntryMap = new Map(
    Object.entries(tocEntryMap).map(([toc, entries]) => [
      upath.resolve(ctx, toc),
      entries.map((ent) =>
        typeof ent === "string"
          ? { entryPath: upath.resolve(ctx, ent), ignoreUpdate: false }
          : {
              entryPath: upath.resolve(ctx, ent.path),
              ignoreUpdate: ent.ignoreUpdate,
            },
      ),
    ]),
  );
  const entryToCMap = normalizedTocEntryMap.entries().reduce(
    (map, [tocPath, entries]) => {
      entries.forEach(({ entryPath, ignoreUpdate }) => {
        if (!map.has(entryPath)) {
          map.set(entryPath, []);
        }
        map.get(entryPath)!.push({ tocPath, ignoreUpdate });
      });
      return map;
    },
    new Map() as Map<string, { tocPath: string; ignoreUpdate: boolean }[]>,
  );

  return (tree, file) => {
    if (this.data()[recursiveFlag]) {
      return;
    }
    const root = tree as hast.Root;

    const rawPath = file.path;
    if (typeof rawPath === "undefined") {
      console.warn(
        "cannot extract headings from anonymous files or expand table of contents into anonymous files.",
      );
      return;
    }
    const filePath = upath.resolve(rawPath);

    const affects = entryToCMap.get(filePath);
    if (affects) {
      ensureId(root, selector, ignoreAttr);

      // trigger hot reload
      affects
        .filter(
          ({ tocPath, ignoreUpdate }) => tocPath !== filePath && !ignoreUpdate,
        )
        .forEach(({ tocPath }) => touchSync(tocPath));
    }

    const dependsOn = normalizedTocEntryMap.get(filePath);
    if (dependsOn) {
      const toc = select("#toc", root);
      if (toc) {
        const baseDir = upath.dirname(filePath);

        const tocRoot: hast.Element = {
          type: "element",
          tagName: "ol",
          properties: {},
          children: [],
        };
        toc.children = [tocRoot];

        dependsOn
          .map(({ entryPath }) => ({
            entryPath,
            contents: fs.readFileSync(entryPath, {
              encoding: "utf-8",
            }),
          }))
          .map(({ entryPath, contents }) => {
            let file;
            this.data()[recursiveFlag] = {};
            try {
              file = this.processSync({
                contents,
                path: entryPath,
              });
            } finally {
              delete this.data()[recursiveFlag];
            }
            return { entryPath, root: fromHtml(file.toString()) };
          })
          .forEach(({ entryPath, root }) =>
            buildToC(
              tocRoot,
              root,
              selector,
              ignoreAttr,
              filePath === entryPath
                ? null
                : upath.relative(baseDir, upath.changeExt(entryPath, ".html")),
              overrideDepth,
            ),
          );
      }
    }
  };
};
