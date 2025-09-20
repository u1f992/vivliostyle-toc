import type * as hast from "hast";
import { getAttribute } from "hast-util-get-attribute";
import { getXPath } from "hast-util-get-xpath";
import fs from "node:fs";

/**
 * https://qiita.com/Anders/items/b1a9f3dca3f9c3c17241
 */
export function touchSync(fileName: string) {
  try {
    const time = new Date();
    fs.utimesSync(fileName, time, time);
  } catch {
    fs.closeSync(fs.openSync(fileName, "w"));
  }
}

export function ensureElemId(tree: Readonly<hast.Root>, elem: hast.Element) {
  let id = getAttribute(elem, "id");
  if (id !== null) {
    return id;
  }

  id = getXPath(tree, elem);
  if (id !== null) {
    if (elem.properties) {
      elem.properties["id"] = id;
    } else {
      elem.properties = { id };
    }
    return id;
  }

  throw new Error("id === null: won't happen. it's likely a bug in getXPath()");
}
