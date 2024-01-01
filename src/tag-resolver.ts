import fs from "fs";
import qs from "querystring";

import { HTMLElement } from "node-html-parser";

class TagResolver {
  constructor(private tag: HTMLElement) {}

  private async load({
    color,
    logoColor,
    logo,
    message,
    label,
    file,
  }: {
    color?: string;
    logoColor?: string;
    logo?: string;
    message?: string;
    label?: string;
    file?: string;
  }) {
    if (fs.existsSync(`./${file}`)) {
      return;
    }

    const query = qs.stringify(
      Object.fromEntries(
        Object.entries({
          style: "flat-square",
          label,
          logo,
          logoColor,
        }).filter(([_, value]) => value !== undefined)
      )
    );

    // Make the request
    const url = `https://img.shields.io/badge/${message
      .replaceAll("_", "__")
      .replace("-", "--")
      .replaceAll(" ", "_")}-${color || "grey"}?${query}`;
    console.log(`!> ${url}`);
    const res = await fetch(url);

    const body = await res.arrayBuffer();
    await fs.promises.writeFile(`./${file}`, Buffer.from(body));
  }

  public resolve() {
    const node = this.tag;

    const color = node.getAttribute("color");
    const logoColor = node.getAttribute("icon-color");
    const logo = node.getAttribute("icon");
    const message = node.getAttribute("text");
    const label = node.getAttribute("label");

    if (!message) {
      console.log(node.outerHTML);
      throw new Error("Tag without message");
    }

    const file = `badges/badge-${[
      message ? "msg" : "",
      message,
      label ? "lbl" : "",
      label,
      color ? "c" : "",
      color,
      logo ? "l" : "",
      logo,
      logoColor ? "lc" : "",
      logoColor,
    ]
      .filter((x) => !!x)
      .join("_")
      .replaceAll(" ", "")}.svg`;

    return {
      promise: this.load({
        color,
        logoColor,
        logo,
        message,
        label,
        file,
      }),
      file,
    };
  }
}
export const resolveTag = (tag: HTMLElement) => {
  return new TagResolver(tag).resolve();
};
