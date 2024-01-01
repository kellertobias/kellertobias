import fs from "fs";
import path from "path";
import express from "express";
import ws from "ws";
import showdown from "showdown";
import { HtmlToMarkdown } from "./html-parser";
import { resolveTag } from "./tag-resolver";

const converter = new showdown.Converter({
  tables: true,
  strikethrough: true,
  simpleLineBreaks: true,
  tasklists: true,
});
const port = Number.parseInt(`${process.env.PORT || 2998}`);
const app = express();
app.use(express.static(".", {}));
const wss = new ws.Server({ port: port + 1 });
const connections: ws[] = [];

const sourceDir = path.resolve(path.join(__dirname, "sources"));
console.log("Source dir", sourceDir);
const fileResponses = new Map<string, string>();
const prepareFile = async (file: string) => {
  const relativePath = path.relative(sourceDir, file);
  console.log(`Source File ${file}`, { relativePath });
  const html = fs.readFileSync(file, "utf8");
  const markdown = await new HtmlToMarkdown(html, resolveTag).parsed();
  fileResponses.set(relativePath, markdown);
  const outfile = path.join(
    __dirname,
    "..",
    relativePath.replace(".html", ".md")
  );
  fs.writeFileSync(outfile, markdown);
};

// Get all html files in the current directory and generate markdown files
(async () => {
  const files = fs
    .readdirSync(sourceDir)
    .filter((file) => file.endsWith(".html"));
  for (const file of files) {
    await prepareFile(path.join(sourceDir, file));
  }
})();

// watch files for changes (for "development" mode)
fs.watch(sourceDir, { recursive: true }, async (operation, file) => {
  if (!file || !file.endsWith("html") || operation !== "change") {
    return;
  }
  console.log(file);
  await prepareFile(path.join(sourceDir, file));
  connections.forEach((connection) => {
    connection.send("reload");
  });
});

app.get("/reload.js", (_, res) => {
  res.send(
    `
        const socket = new WebSocket('ws://localhost:${port + 1}');
        socket.addEventListener('message', (event) => {
            if (event.data === 'reload') {
                window.location.reload();
            }
        });
        socket.addEventListener('close', () => {
            console.log('Socket closed, reloading in 1s');
            setTimeout(() => {
                window.location.reload();
            }, 300);
        });
      `
  );
});

app.get("*", async (req, res) => {
  const absolute = req.path.slice(1) || "README.html";
  console.log(`Load ${absolute}`);
  const markdown = fileResponses.get(absolute);
  const compiledTemplatePreview = converter.makeHtml(markdown);
  res.send(
    `<html><head>
    <script src="/reload.js"></script>
    <style>
    body {
      font-family: sans-serif;
      font-size: 16px;
      line-height: 1.5;
      color: rgb(230, 237, 243);
      background: rgb(13, 17, 23);
      width: 100vw;
      margin: 0; 
      padding: 0;
      font-family: -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji";
      font-size: 14px;
      line-height: 1.5;
      word-wrap: break-word;
    }
  
    img {
      max-width: 100%;
      margin-top: 8px;

    }

    table {
      width: max-content;
      max-width: 100%;
      overflow: auto;
      margin-top: 0;
      margin-bottom: 16px;
      border-spacing: 0;
      border-collapse: collapse;
    }

    thead {
      display: table-header-group;
      vertical-align: middle;
    }

    tbody {
      display: table-row-group;
      vertical-align: middle;
    }

    table tr {
      background-color: rgb(13, 17, 23);
      border-top: 1px solid rgb(33, 38, 45);;
    }

    table tr:nth-child(2n) {
      background-color: rgb(22, 27, 34);;
    }

    table th, table td {
      padding: 6px 13px;
      border: 1px solid rgb(48, 54, 61);;
      }

    a {
      color: rgb(47, 129, 247);
      text-decoration: underline;
      text-underline-offset: .2rem;
      line-height: 21px;
    }

    .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6 {
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 600;
      line-height: 1.25;
    }

    #readme {
        max-width: 846px;
        padding: 24px;
        border: 1px solid rgb(48, 54, 61);
        border-radius: 6px;
        margin: 40px auto;
    }
  </style></head><body><div id="readme">${compiledTemplatePreview}</div></body></html>`
  );
  res.end();
});

wss.on("connection", (ws) => {
  connections.push(ws);
  ws.send("welcome");
});

app.use(function (req, res) {
  res.status(404).send("Page not found");
});

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
