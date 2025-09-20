// @ts-check

import { VFM } from "@vivliostyle/vfm";
import { toc, h } from "@u1f992/vivliostyle-toc";

/** @type {import('@vivliostyle/cli').VivliostyleConfigSchema} */
const vivliostyleConfig = {
  title: "example",
  author: "u1f992",
  language: "ja",
  theme: "./css",
  entry: ["00.md", "toc.md", "01.md", "02.md", "99.md"],
  documentProcessor: (opt, meta) =>
    VFM(opt, meta).use(toc, {
      entryProcessor: VFM(opt, meta),
      tocEntryMap: {
        "toc.md": ["00.md", "01.md", "02.md", "99.md"],
      },
      selector: h(1, 2, 3, 5),
      overrideDepth: (lv) => (lv === 5 ? 3 : lv),
      // overrideDepthは見出しのレベルと深さを分離するための引数です。
      // 通常、目次は以下のような構造になります。
      //
      // .toc-level2
      //   .toc-level3
      //     (.toc-level4) ... selectorで指定していないため空のol
      //       .toc-level5
      //   .toc-level3
      // ...
      //
      // 上の指定では、この目次が以下のように構築されるようになります。
      // たとえば、`section.level5`をコラムに利用して目次内では`h3`と同列に表示させる場合に役立ちます。
      //
      // .toc-level2
      //   .toc-level3
      //   .toc-level5
      //   .toc-level3
      // ...
      // eslint-disable-next-line no-undef
      log: console.debug,
    }),
};

export default vivliostyleConfig;
