import { NodeType, parse, HTMLElement } from "node-html-parser";

export class HtmlToMarkdown {
  private tagMap = new Map<string, string>();

  private promise: Promise<string>;
  private tagRequests: Promise<void>[] = [];

  constructor(
    private html: string,
    private tagResolver: (tag: HTMLElement) => {
      promise: Promise<void>;
      file: string;
    }
  ) {}

  public async parsed() {
    // Parse the html string
    const root = parse(this.html);

    // Get the body or the root element if there is no body
    const body = root.querySelector("body") || root;
    const markdown = this.handleSubtree(body);
    await Promise.all(this.tagRequests);
    return markdown;
  }

  private handleTable(node: HTMLElement): string {
    const columns: { width: number; lines: string[]; title: string }[] = [];

    const thead = node.querySelector("thead tr");
    const tbody = node.querySelector("tbody");

    if (!thead || !tbody) {
      return "";
    }

    const rows = tbody.querySelectorAll("tr");

    // Get the column widths
    thead.childNodes.forEach((child) => {
      if (child.nodeType === NodeType.ELEMENT_NODE) {
        const title = child.text;
        columns.push({ width: title.length, lines: [], title });
      }
    });

    rows.forEach((row) => {
      let column = 0;
      (row.childNodes as HTMLElement[]).forEach((child) => {
        if (child.nodeType === NodeType.ELEMENT_NODE) {
          const cell = this.handleSubtree(child, true);
          columns[column].lines.push(cell);
          columns[column].width = Math.max(columns[column].width, cell.length);
          column++;
        }
      });
    });

    let markdown = "";
    for (const column of columns) {
      markdown += `| ${column.title.padEnd(column.width, " ")} `;
    }
    markdown += "|\n";

    for (const column of columns) {
      markdown += `|:${"-".repeat(column.width)}-`;
    }
    markdown += "|\n";

    for (let i = 0; i < rows.length; i++) {
      for (const column of columns) {
        markdown += `| ${column.lines[i].padEnd(column.width, " ")} `;
      }
      markdown += "|\n";
    }

    return markdown;
  }

  private handleText(node: HTMLElement): string {
    return node.text.replace(/\n/g, " ").trim();
  }

  private handleSubtree(
    node: HTMLElement,
    insideTable = false,
    context?: "ul" | "ol"
  ): string {
    let markdown = "";

    // walk over all children of the body
    (node.childNodes as HTMLElement[]).forEach((child) => {
      switch (true) {
        case child.nodeType === NodeType.TEXT_NODE:
          // If the child is a text node, append the text to the markdown string
          markdown += this.handleText(child);
          break;
        case child.nodeType === NodeType.COMMENT_NODE:
          break;
        case child.rawTagName === "br":
          // If the child is a paragraph, append the text to the markdown string
          markdown += "   ";
          break;
        case child.rawTagName === "hr":
          markdown += "\n\n---\n\n";
        case child.rawTagName === "br":
          markdown += "\n";
        case child.rawTagName === "b":
        case child.rawTagName === "strong":
          markdown += `**${this.handleSubtree(child, insideTable)}**`;
          break;
        case child.rawTagName === "i":
        case child.rawTagName === "em":
          markdown += `*${this.handleSubtree(child, insideTable)}*`;
          break;
        case child.rawTagName === "code":
          markdown += `\`${this.handleSubtree(child, insideTable)}\``;
          break;
        case child.rawTagName === "pre":
          markdown += `\`\`\`${
            child.getAttribute("language") || ""
          }\n${this.handleSubtree(child, insideTable)}\n\`\`\``;
          break;
        case child.rawTagName === "p":
          // If the child is a paragraph, append the text to the markdown string
          markdown += this.handleSubtree(child, insideTable);
          if (!insideTable) markdown += "\n\n";
          break;
        case child.rawTagName === "h1":
          // If the child is a heading, append the text to the markdown string
          markdown += "# ";
          markdown += this.handleText(child);
          if (!insideTable) markdown += "\n\n";
          break;

        case child.rawTagName === "h2":
          // If the child is a heading, append the text to the markdown string
          markdown += "## ";
          markdown += this.handleText(child);
          if (!insideTable) markdown += "\n\n";
          break;

        case child.rawTagName === "h3":
          // If the child is a heading, append the text to the markdown string
          markdown += "### ";
          markdown += this.handleText(child);
          if (!insideTable) markdown += "\n\n";
          break;

        case child.rawTagName === "h4":
          // If the child is a heading, append the text to the markdown string
          markdown += "#### ";
          markdown += this.handleText(child);
          if (!insideTable) markdown += "\n\n";
          break;

        case child.rawTagName === "a":
          // If the child is a heading, append the text to the markdown string
          markdown += `[${this.handleText(child)}](${child.getAttribute(
            "href"
          )})`;
          break;

        case child.rawTagName === "img":
          // If the child is a heading, append the text to the markdown string
          markdown += `![${
            child.getAttribute("alt") || ""
          }](${child.getAttribute("src")}) `;
          break;
        case child.rawTagName === "tags":
          for (const tag of child.childNodes as HTMLElement[]) {
            if (
              tag.nodeType === NodeType.ELEMENT_NODE &&
              tag.rawTagName === "tag"
            ) {
              const name = tag.getAttribute("name");
              if (!name) {
                console.log(tag.outerHTML);
                throw new Error("Tag without name");
              }
              if (this.tagMap.has(name)) {
                throw new Error(`Duplicate tag ${name}`);
              }
              const resolvedTag = this.tagResolver(tag);
              this.tagMap.set(name, resolvedTag.file);
              this.tagRequests.push(resolvedTag.promise);
            }
          }
          break;
        case child.rawTagName === "tag":
          throw new Error("Tag outside of tags");

        case child.rawTagName === "ul":
        case child.rawTagName === "ol":
          markdown += this.handleSubtree(child, insideTable, child.rawTagName);
          if (!insideTable) markdown += "\n\n";
          break;

        case child.rawTagName === "li":
          if (context === "ul") {
            markdown += "- ";
            markdown += this.handleSubtree(child, insideTable);
            if (!insideTable) markdown += "\n\n";
          } else if (context === "ol") {
            markdown += "1. ";
            markdown += this.handleSubtree(child, insideTable);
            if (!insideTable) markdown += "\n\n";
          }
          break;

        case child.rawTagName === "table":
          markdown += this.handleTable(child);
          markdown += "\n\n";
          break;
        case this.tagMap.has(child.rawTagName):
          markdown += `![${child.rawTagName}](/${this.tagMap.get(
            child.rawTagName
          )}) `;
          break;
        case ["thead", "tbody", "tr", "th", "td"].includes(child.rawTagName):
          throw new Error(
            `Unexpected tag ${child.rawTagName} outside of table handler`
          );
        default:
          // If the child is an element node, append the tag name to the markdown string
          console.log(child.rawTagName);
          console.log(child.outerHTML);
          throw new Error(`Unexpected tag <${child.rawTagName} />`);
      }
    });

    return markdown;
  }
}
