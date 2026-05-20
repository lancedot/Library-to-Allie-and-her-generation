import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const configPath = path.join(cwd, "books.config.json");

function readConfig() {
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  }

  return {
    libraryTitle: "本地阅读器",
    output: "writing-planner.html",
    books: [
      {
        id: "ai-literacy",
        title: "AI 素养与 AI 原生工作基础",
        description: "第一本书",
        sources: [
          {
            part: "Part I - 全民 AI 素养基础",
            files: "AI_Literacy_PartI_Ch*.md",
            chapterOffset: 0,
            titleExcludes: ["AI 素养与 AI 原生工作基础"],
          },
          {
            part: "Part II - AI 原生工作基础",
            files: "AI_Literacy_PartII_Ch*.md",
            chapterOffset: 7,
          },
        ],
      },
    ],
  };
}

function wildcardToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp("^" + escaped + "$", "i");
}

function chapterNumber(fileName, fallback) {
  const displayFileName = path.basename(fileName);
  return Number(displayFileName.match(/(?:^|[_-])Ch(?:apter)?(\d+)/i)?.[1] ?? displayFileName.match(/(\d+)/)?.[1] ?? fallback);
}

function chineseNumber(value) {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (value <= 10) return value === 10 ? "十" : digits[value];
  if (value < 20) return "十" + digits[value - 10];
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return digits[tens] + "十" + (ones ? digits[ones] : "");
}

function sourceFiles(source) {
  const allFiles = fs.readdirSync(cwd).filter((name) => name.toLowerCase().endsWith(".md"));
  const patterns = Array.isArray(source.files) ? source.files : [source.files];
  if (patterns.every((pattern) => pattern && !pattern.includes("*") && !pattern.includes("?"))) {
    return patterns.filter((pattern) => fs.existsSync(path.join(cwd, pattern)));
  }
  const matched = new Set();

  for (const pattern of patterns) {
    if (!pattern) continue;
    if (pattern.includes("*") || pattern.includes("?")) {
      const matcher = wildcardToRegExp(pattern);
      allFiles.filter((name) => matcher.test(name)).forEach((name) => matched.add(name));
    } else if (fs.existsSync(path.join(cwd, pattern))) {
      matched.add(pattern);
    }
  }

  return [...matched].sort((a, b) => chapterNumber(a, 0) - chapterNumber(b, 0) || a.localeCompare(b, "zh-Hans-CN"));
}

function parseMeta(book, source, fileName, sourceIndex, fileIndex) {
  const markdown = fs.readFileSync(path.join(cwd, fileName), "utf8");
  const displayFileName = path.basename(fileName);
  const partKey = source.id ?? `part-${sourceIndex + 1}`;
  const rawChapterMatch = displayFileName.match(/(?:^|[_-])Ch(?:apter)?(\d+)/i);
  const appendixMatch = displayFileName.match(/Appendix[_-]?([A-Z])/i);
  const introductionMatch = /Introduction/i.test(displayFileName);
  const prefaceMatch = /Preface/i.test(displayFileName);
  const chapterInPart = rawChapterMatch ? Number(rawChapterMatch[1]) : fileIndex + 1;
  const h1 = [...markdown.matchAll(/^#\s+(.+)$/gm)].map((match) => match[1].trim());
  const h2 = [...markdown.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1].trim());
  const excludes = new Set([book.title, ...(source.titleExcludes ?? [])]);
  const chapterTitle =
    h1.find((title) => ![...excludes].some((exclude) => exclude && title.includes(exclude))) ??
    h2.find((title) => !title.startsWith("Part ")) ??
    displayFileName.replace(/\.md$/i, "");
  const globalChapter = Number(source.chapterOffset ?? 0) + chapterInPart;
  const displayTitle =
    Number(source.chapterOffset ?? 0) > 0 && !appendixMatch
      ? chapterTitle.replace(/^第[一二三四五六七八九十]+章([：:])/, `第${chineseNumber(globalChapter)}章$1`)
      : chapterTitle;

  return {
    id: `${book.id}-${partKey}-${chapterInPart}`.toLowerCase(),
    bookId: book.id,
    fileName: displayFileName,
    partKey,
    partTitle: source.part ?? source.title ?? `Part ${sourceIndex + 1}`,
    chapterInPart,
    globalChapter,
    numberLabel: introductionMatch ? "引" : prefaceMatch ? "序" : appendixMatch ? appendixMatch[1].toUpperCase() : "",
    metaLabel: introductionMatch ? "引言" : prefaceMatch ? "序言" : appendixMatch ? `附录 ${appendixMatch[1].toUpperCase()}` : "",
    title: displayTitle,
    markdown,
    wordCount: Array.from(markdown.replace(/```[\s\S]*?```/g, "").replace(/\s/g, "")).length,
  };
}

const config = readConfig();
const library = {
  title: config.libraryTitle ?? "本地阅读器",
  authorTools: config.authorTools === true,
  singleBook: false,
  books: (config.books ?? []).map((book, bookIndex) => {
    const normalizedBook = {
      id: book.id ?? `book-${bookIndex + 1}`,
      title: book.title ?? `Book ${bookIndex + 1}`,
      author: book.author ?? "",
      description: book.description ?? "",
      category: book.category ?? "原创写作",
      singleOutput: book.singleOutput ?? "",
      sources: book.sources ?? [{ part: "正文", files: book.files ?? "*.md" }],
    };
    const chapters = normalizedBook.sources
      .flatMap((source, sourceIndex) =>
        sourceFiles(source).map((fileName, fileIndex) => parseMeta(normalizedBook, source, fileName, sourceIndex, fileIndex))
      )
      .sort((a, b) => a.globalChapter - b.globalChapter || a.fileName.localeCompare(b.fileName, "zh-Hans-CN"));

    return {
      id: normalizedBook.id,
      title: normalizedBook.title,
      author: normalizedBook.author,
      description: normalizedBook.description,
      category: normalizedBook.category,
      singleOutput: normalizedBook.singleOutput,
      chapters,
      chapterCount: chapters.length,
      wordCount: chapters.reduce((total, chapter) => total + chapter.wordCount, 0),
    };
  }),
};

const outputFile = config.output ?? "writing-planner.html";
const singleBookOutputFile = config.singleBookOutput ?? "book-one.html";

const html = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>__LIBRARY_TITLE__</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f5ef;
      --panel: #fffdf8;
      --panel-strong: #ffffff;
      --text: #24211b;
      --muted: #746d60;
      --line: #ded7c8;
      --accent: #206a5d;
      --accent-soft: #e3f1eb;
      --mark: #fff1a8;
      --shadow: 0 18px 50px rgba(57, 45, 27, 0.12);
      --reader-width: 760px;
      --font-size: 19px;
      --line-height: 1.88;
    }

    [data-theme="dark"] {
      color-scheme: dark;
      --bg: #151515;
      --panel: #202020;
      --panel-strong: #262626;
      --text: #eee9de;
      --muted: #aaa294;
      --line: #393734;
      --accent: #7bc8b6;
      --accent-soft: #17332d;
      --mark: #6a5818;
      --shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif;
    }

    button, input, select {
      font: inherit;
    }

    .app {
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr);
      min-height: 100vh;
    }

    body[data-view="home"] .app,
    body[data-view="bookstore"] .app,
    body[data-view="about"] .app {
      grid-template-columns: 1fr;
    }

    body[data-view="home"] .sidebar,
    body[data-view="bookstore"] .sidebar,
    body[data-view="about"] .sidebar,
    body[data-view="home"] .topbar,
    body[data-view="bookstore"] .topbar,
    body[data-view="about"] .topbar {
      display: none;
    }

    .public-nav {
      display: none;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      padding: 18px 42px;
      border-bottom: 1px solid var(--line);
      background: color-mix(in srgb, var(--bg) 92%, transparent);
      backdrop-filter: blur(14px);
      position: sticky;
      top: 0;
      z-index: 8;
    }

    body[data-view="home"] .public-nav,
    body[data-view="bookstore"] .public-nav,
    body[data-view="about"] .public-nav {
      display: flex;
    }

    .public-brand {
      font-size: 15px;
      font-weight: 900;
      color: var(--text);
    }

    .public-nav-links {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .public-nav .text-button.active {
      border-color: var(--accent);
      background: var(--accent-soft);
      color: var(--accent);
    }

    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      padding: 22px 18px;
      border-right: 1px solid var(--line);
      background: var(--panel);
      overflow: auto;
    }

    .brand {
      margin: 0 0 16px;
      font-size: 20px;
      line-height: 1.35;
      font-weight: 800;
      letter-spacing: 0;
    }

    .book-picker {
      display: grid;
      gap: 8px;
      margin-bottom: 14px;
    }

    .book-select {
      width: 100%;
      min-height: 42px;
      padding: 8px 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel-strong);
      color: var(--text);
      outline: none;
      font-weight: 800;
    }

    .book-description {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
    }

    .site-nav {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      margin-bottom: 14px;
    }

    .site-nav .text-button {
      width: 100%;
    }

    .site-nav .active {
      border-color: var(--accent);
      background: var(--accent-soft);
      color: var(--accent);
    }

    body.single-book .site-nav,
    body.single-book .book-picker,
    body.single-book .import-tools {
      display: none !important;
    }

    .import-tools {
      display: grid;
      gap: 8px;
      margin-bottom: 14px;
    }

    .drop-zone {
      padding: 12px;
      border: 1px dashed var(--line);
      border-radius: 8px;
      background: var(--panel-strong);
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
      text-align: center;
    }

    .drop-zone.drag-over {
      border-color: var(--accent);
      background: var(--accent-soft);
      color: var(--text);
    }

    .hidden-input {
      display: none;
    }

    .search-row {
      display: grid;
      grid-template-columns: 1fr;
      margin-bottom: 14px;
    }

    .search {
      width: 100%;
      min-height: 40px;
      padding: 9px 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel-strong);
      color: var(--text);
      outline: none;
    }

    .search:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }

    .part-title {
      margin: 18px 0 8px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
    }

    .chapter-list {
      display: grid;
      gap: 6px;
    }

    .chapter-button {
      width: 100%;
      display: grid;
      grid-template-columns: 34px 1fr;
      gap: 10px;
      align-items: start;
      padding: 10px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--text);
      text-align: left;
      cursor: pointer;
    }

    .chapter-button:hover,
    .chapter-button.active {
      background: var(--accent-soft);
    }

    .chapter-num {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--panel-strong);
      border: 1px solid var(--line);
      color: var(--accent);
      font-size: 13px;
      font-weight: 800;
    }

    .chapter-name {
      min-width: 0;
      font-size: 14px;
      line-height: 1.45;
      font-weight: 700;
    }

    .chapter-meta {
      margin-top: 3px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.35;
    }

    .main {
      min-width: 0;
      display: grid;
      grid-template-rows: auto 1fr;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      min-height: 64px;
      padding: 10px 26px;
      border-bottom: 1px solid var(--line);
      background: color-mix(in srgb, var(--bg) 88%, transparent);
      backdrop-filter: blur(16px);
    }

    .current-title {
      min-width: 0;
      font-size: 15px;
      font-weight: 800;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .icon-button,
    .text-button {
      min-width: 40px;
      height: 40px;
      padding: 0 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel-strong);
      color: var(--text);
      cursor: pointer;
      font-weight: 800;
    }

    .icon-button {
      padding: 0;
      font-size: 18px;
    }

    .icon-button:hover,
    .text-button:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .progress-wrap {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 10;
      height: 3px;
      background: transparent;
    }

    .progress {
      width: 0%;
      height: 100%;
      background: var(--accent);
      transition: width 120ms linear;
    }

    .reader-shell {
      padding: 44px 28px 70px;
    }

    body[data-view="home"] .reader-shell,
    body[data-view="bookstore"] .reader-shell,
    body[data-view="about"] .reader-shell {
      padding: 60px 46px 70px;
    }

    .reader {
      width: min(var(--reader-width), 100%);
      margin: 0 auto;
      padding: 54px 58px 64px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: var(--shadow);
    }

    body[data-view="home"] .reader,
    body[data-view="bookstore"] .reader,
    body[data-view="about"] .reader {
      width: min(1120px, 100%);
      padding: 0;
      border: 0;
      background: transparent;
      box-shadow: none;
    }

    body[data-view="home"] .search-row,
    body[data-view="home"] #toc,
    body[data-view="home"] .notes-panel,
    body[data-view="bookstore"] .search-row,
    body[data-view="bookstore"] #toc,
    body[data-view="bookstore"] .notes-panel,
    body[data-view="about"] .search-row,
    body[data-view="about"] #toc {
      display: none;
    }

    .article-meta {
      margin-bottom: 24px;
      color: var(--muted);
      font-size: 14px;
      font-weight: 700;
    }

    .content {
      font-family: "Microsoft YaHei", "PingFang SC", "Noto Serif CJK SC", serif;
      font-size: var(--font-size);
      line-height: var(--line-height);
      word-break: break-word;
    }

    .content h1,
    .content h2,
    .content h3 {
      font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif;
      line-height: 1.35;
      letter-spacing: 0;
    }

    .content h1 {
      margin: 0 0 28px;
      font-size: 34px;
    }

    .content h2 {
      margin: 44px 0 16px;
      font-size: 25px;
      border-top: 1px solid var(--line);
      padding-top: 30px;
    }

    .content h3 {
      margin: 28px 0 10px;
      font-size: 20px;
    }

    .content p {
      margin: 14px 0;
    }

    .content blockquote {
      margin: 24px 0;
      padding: 14px 18px;
      border-left: 4px solid var(--accent);
      background: var(--accent-soft);
      border-radius: 0 8px 8px 0;
    }

    .content hr {
      margin: 34px 0;
      border: 0;
      border-top: 1px solid var(--line);
    }

    .content ul,
    .content ol {
      padding-left: 1.4em;
    }

    .content table {
      width: 100%;
      margin: 24px 0;
      border-collapse: collapse;
      font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif;
      font-size: 0.92em;
      line-height: 1.55;
    }

    .content th,
    .content td {
      padding: 10px 12px;
      border: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }

    .content th {
      background: var(--accent-soft);
      color: var(--text);
      font-weight: 800;
    }

    .content mark {
      background: var(--mark);
      color: inherit;
      padding: 0 2px;
      border-radius: 3px;
    }

    .content pre {
      margin: 24px 0;
      padding: 16px 18px;
      overflow-x: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel-strong);
      font-family: "Consolas", "Microsoft YaHei", monospace;
      font-size: 0.86em;
      line-height: 1.55;
      white-space: pre;
    }

    .home-kicker {
      margin: 0 0 12px;
      color: var(--accent);
      font-size: 14px;
      font-weight: 800;
    }

    .home-title {
      margin: 0 0 22px;
      font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif;
      font-size: 52px;
      line-height: 1.15;
      letter-spacing: 0;
    }

    .home-layout {
      display: grid;
      grid-template-columns: 1fr;
      gap: 36px;
      align-items: center;
      min-height: min(660px, calc(100vh - 150px));
    }

    .home-copy {
      min-width: 0;
    }

    .home-lede {
      max-width: 680px;
      margin: 0 0 22px;
      color: var(--muted);
      font-size: 21px;
      line-height: 1.75;
    }

    .home-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin: 24px 0 34px;
    }

    .book-shelf {
      display: grid;
      grid-template-columns: repeat(2, minmax(260px, 1fr));
      gap: 18px;
      align-self: stretch;
      align-content: center;
    }

    .bookstore-title {
      margin: 0 0 10px;
      font-size: 34px;
      line-height: 1.25;
      font-weight: 900;
    }

    .bookstore-lede {
      margin: 0 0 28px;
      color: var(--muted);
      font-size: 18px;
      line-height: 1.7;
    }

    .book-group + .book-group {
      margin-top: 34px;
    }

    .book-group-title {
      margin: 0 0 8px;
      font-size: 20px;
      line-height: 1.35;
      font-weight: 900;
      color: var(--accent);
    }

    .book-group-lede {
      margin: 0 0 16px;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.65;
    }

    .book-cover {
      position: relative;
      display: grid;
      align-content: space-between;
      min-height: 330px;
      padding: 34px 30px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--panel-strong) 92%, var(--accent-soft)), var(--panel-strong));
      color: var(--text);
      text-align: left;
      cursor: pointer;
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .book-cover::before {
      content: "";
      position: absolute;
      inset: 16px;
      border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line));
      border-radius: 6px;
      pointer-events: none;
    }

    .book-cover:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
      transition: transform 160ms ease, border-color 160ms ease;
    }

    .cover-kicker {
      position: relative;
      color: var(--accent);
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
    }

    .cover-title {
      position: relative;
      display: block;
      margin: 46px 0 18px;
      font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif;
      font-size: 34px;
      line-height: 1.22;
      font-weight: 900;
      letter-spacing: 0;
    }

    .cover-subtitle {
      position: relative;
      display: block;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.7;
    }

    .cover-footer {
      position: relative;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: end;
      color: var(--muted);
      font-size: 13px;
      font-weight: 800;
    }

    .source-list {
      display: grid;
      gap: 10px;
      margin: 16px 0 0;
      padding: 0;
      list-style: none;
    }

    .source-list a {
      color: var(--accent);
      font-weight: 800;
      text-decoration: none;
    }

    .source-list a:hover {
      text-decoration: underline;
    }

    .footer-nav {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      width: min(var(--reader-width), 100%);
      margin: 18px auto 0;
    }

    .nav-card {
      min-height: 76px;
      padding: 14px 16px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      color: var(--text);
      text-align: left;
      cursor: pointer;
    }

    .nav-card[disabled] {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .nav-label {
      color: var(--muted);
      font-size: 13px;
      font-weight: 800;
    }

    .nav-title {
      margin-top: 6px;
      font-weight: 800;
      line-height: 1.4;
    }

    .note-highlight {
      background: color-mix(in srgb, var(--mark) 75%, var(--accent-soft));
      border-bottom: 2px solid var(--accent);
      cursor: pointer;
    }

    .selection-popup {
      position: fixed;
      z-index: 30;
      width: min(360px, calc(100vw - 24px));
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel-strong);
      box-shadow: var(--shadow);
      display: none;
      gap: 10px;
    }

    .selection-popup.open {
      display: grid;
    }

    .selection-popup-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }

    .selection-popup-title {
      margin: 0;
      font-size: 13px;
      color: var(--muted);
      font-weight: 800;
    }

    .popup-close {
      width: 32px;
      height: 32px;
      padding: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      color: var(--muted);
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
    }

    .popup-close:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .selected-preview {
      max-height: 72px;
      overflow: auto;
      padding: 9px 10px;
      border-radius: 8px;
      background: var(--accent-soft);
      color: var(--text);
      font-size: 13px;
      line-height: 1.5;
    }

    .note-input {
      width: 100%;
      min-height: 88px;
      resize: vertical;
      padding: 9px 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      color: var(--text);
      font: inherit;
      line-height: 1.5;
    }

    .popup-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .text-button[disabled] {
      opacity: 0.45;
      cursor: not-allowed;
      color: var(--muted);
      border-color: var(--line);
    }

    .notes-panel {
      margin-top: 20px;
      padding-top: 14px;
      border-top: 1px solid var(--line);
    }

    .notes-title {
      margin: 0 0 8px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 800;
    }

    .note-list {
      display: grid;
      gap: 8px;
    }

    .note-item {
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel-strong);
      color: var(--text);
      text-align: left;
      cursor: pointer;
    }

    .note-quote {
      display: block;
      color: var(--text);
      font-size: 13px;
      line-height: 1.45;
      font-weight: 800;
    }

    .note-text {
      display: block;
      margin-top: 5px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
    }

    .mobile-menu {
      display: none;
    }

    @media (max-width: 860px) {
      .app {
        grid-template-columns: 1fr;
      }

      .sidebar {
        position: fixed;
        inset: 0 auto 0 0;
        z-index: 20;
        width: min(84vw, 330px);
        transform: translateX(-105%);
        transition: transform 180ms ease;
        box-shadow: var(--shadow);
      }

      body.menu-open .sidebar {
        transform: translateX(0);
      }

      .mobile-menu {
        display: inline-grid;
        place-items: center;
      }

      .topbar {
        padding: 10px 12px;
      }

      .reader-shell {
        padding: 20px 12px 46px;
      }

      body[data-view="home"] .reader-shell,
      body[data-view="bookstore"] .reader-shell,
      body[data-view="about"] .reader-shell {
        padding: 24px 16px 46px;
      }

      .reader {
        padding: 30px 20px 42px;
      }

      .content h1 {
        font-size: 28px;
      }

      .content h2 {
        font-size: 22px;
      }

      .home-title {
        font-size: 34px;
      }

      .home-lede {
        font-size: 18px;
      }

      .home-layout {
        grid-template-columns: 1fr;
        min-height: 0;
        gap: 28px;
      }

      .public-nav {
        padding: 14px 14px;
        align-items: flex-start;
        flex-direction: column;
      }

      .public-nav-links {
        width: 100%;
      }

      .public-nav .text-button {
        flex: 1;
      }

      .book-shelf {
        grid-template-columns: 1fr;
      }

      .book-cover {
        min-height: 300px;
      }

      .selection-popup {
        left: 12px !important;
        right: 12px;
        bottom: 12px;
        top: auto !important;
        width: auto;
      }

      .footer-nav {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="progress-wrap" aria-hidden="true"><div class="progress" id="progress"></div></div>
  <nav class="public-nav" aria-label="站点导航">
    <div class="public-brand">Library to Allie and her generation</div>
    <div class="public-nav-links">
      <button class="text-button" id="publicHomeButton" type="button">首页</button>
      <button class="text-button" id="publicBookstoreButton" type="button">书城</button>
      <button class="text-button" id="publicAboutButton" type="button">关于</button>
    </div>
  </nav>
  <div class="app">
    <aside class="sidebar" id="sidebar">
      <h1 class="brand" id="libraryTitle">__LIBRARY_TITLE__</h1>
      <div class="site-nav">
        <button class="text-button" id="homeButton" type="button">首页</button>
        <button class="text-button" id="bookstoreButton" type="button">书城</button>
        <button class="text-button" id="aboutButton" type="button">关于</button>
      </div>
      <div class="book-picker" id="bookPicker">
        <select class="book-select" id="bookSelect" aria-label="选择书籍"></select>
        <div class="book-description" id="bookDescription"></div>
      </div>
      <div class="import-tools" id="importTools">
        <button class="text-button" id="importButton" type="button">导入 MD 成书</button>
        <input class="hidden-input" id="fileInput" type="file" accept=".md,text/markdown,text/plain" multiple>
        <div class="drop-zone" id="dropZone">拖一批 Markdown 到这里</div>
      </div>
      <div class="search-row">
        <input class="search" id="search" type="search" placeholder="搜索章节或正文" autocomplete="off">
      </div>
      <nav id="toc" aria-label="章节目录"></nav>
      <section class="notes-panel" aria-label="批注">
        <h2 class="notes-title">批注</h2>
        <div class="note-list" id="noteList"></div>
      </section>
    </aside>
    <main class="main">
      <header class="topbar">
        <button class="icon-button mobile-menu" id="menuButton" title="目录" aria-label="目录">☰</button>
        <div class="current-title" id="currentTitle"></div>
        <div class="toolbar">
          <button class="icon-button" id="decreaseFont" title="减小字号" aria-label="减小字号">A-</button>
          <button class="icon-button" id="increaseFont" title="增大字号" aria-label="增大字号">A+</button>
          <button class="text-button" id="notesButton">批注</button>
          <button class="text-button" id="themeButton">深色</button>
        </div>
      </header>
      <section class="reader-shell">
        <article class="reader">
          <div class="article-meta" id="articleMeta"></div>
          <div class="content" id="content"></div>
        </article>
        <div class="footer-nav" id="footerNav">
          <button class="nav-card" id="prevButton"></button>
          <button class="nav-card" id="nextButton"></button>
        </div>
      </section>
    </main>
  </div>
  <div class="selection-popup" id="selectionPopup">
    <div class="selection-popup-head">
      <p class="selection-popup-title">添加批注</p>
      <button class="popup-close" id="cancelNoteButton" type="button" aria-label="取消批注">×</button>
    </div>
    <div class="selected-preview" id="selectedPreview"></div>
    <textarea class="note-input" id="noteInput" placeholder="写下这句话旁边的想法"></textarea>
    <div class="popup-actions">
      <button class="text-button" id="cancelNoteTextButton" type="button">取消</button>
      <button class="text-button" id="saveNoteButton" type="button" disabled>保存</button>
    </div>
  </div>

  <script id="library-data" type="application/json">__LIBRARY_DATA__</script>
  <script>
    const library = JSON.parse(document.getElementById("library-data").textContent);
    const packagedBooks = library.books || [];
    let importedBooks = library.singleBook ? [] : loadJson("reader.importedBooks", []);
    let notes = loadJson("reader.notes", []);
    let selectedTextForNote = "";
    let pendingNoteId = "";
    const state = {
      activeBookId: library.singleBook ? packagedBooks[0]?.id : localStorage.getItem("reader.activeBookId") || allBooks()[0]?.id,
      activeId: library.singleBook ? localStorage.getItem("reader.singleBook.activeId") : localStorage.getItem("reader.activeId"),
      view: library.singleBook ? "reader" : localStorage.getItem("reader.view") || "home",
      query: "",
      fontSize: Number(localStorage.getItem("reader.fontSize") || 19),
      theme: localStorage.getItem("reader.theme") || "light",
    };

    const toc = document.getElementById("toc");
    const content = document.getElementById("content");
    const search = document.getElementById("search");
    const libraryTitle = document.getElementById("libraryTitle");
    const publicHomeButton = document.getElementById("publicHomeButton");
    const publicBookstoreButton = document.getElementById("publicBookstoreButton");
    const publicAboutButton = document.getElementById("publicAboutButton");
    const homeButton = document.getElementById("homeButton");
    const bookstoreButton = document.getElementById("bookstoreButton");
    const aboutButton = document.getElementById("aboutButton");
    const bookPicker = document.getElementById("bookPicker");
    const bookSelect = document.getElementById("bookSelect");
    const bookDescription = document.getElementById("bookDescription");
    const importTools = document.getElementById("importTools");
    const importButton = document.getElementById("importButton");
    const fileInput = document.getElementById("fileInput");
    const dropZone = document.getElementById("dropZone");
    const noteList = document.getElementById("noteList");
    const selectionPopup = document.getElementById("selectionPopup");
    const selectedPreview = document.getElementById("selectedPreview");
    const noteInput = document.getElementById("noteInput");
    const cancelNoteButton = document.getElementById("cancelNoteButton");
    const cancelNoteTextButton = document.getElementById("cancelNoteTextButton");
    const saveNoteButton = document.getElementById("saveNoteButton");
    const currentTitle = document.getElementById("currentTitle");
    const articleMeta = document.getElementById("articleMeta");
    const footerNav = document.getElementById("footerNav");
    const prevButton = document.getElementById("prevButton");
    const nextButton = document.getElementById("nextButton");
    const progress = document.getElementById("progress");

    document.documentElement.dataset.theme = state.theme;
    document.documentElement.style.setProperty("--font-size", state.fontSize + "px");
    document.body.classList.toggle("single-book", Boolean(library.singleBook));
    libraryTitle.textContent = library.title || "本地阅读器";
    importTools.style.display = library.authorTools ? "" : "none";

    function loadJson(key, fallback) {
      try {
        return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
      } catch (error) {
        return fallback;
      }
    }

    function saveImportedBooks() {
      if (library.singleBook) return;
      localStorage.setItem("reader.importedBooks", JSON.stringify(importedBooks));
    }

    function saveNotes() {
      localStorage.setItem("reader.notes", JSON.stringify(notes));
    }

    function allBooks() {
      return packagedBooks.concat(importedBooks);
    }

    function activeBook() {
      const books = allBooks();
      return books.find((book) => book.id === state.activeBookId) || books[0] || { chapters: [] };
    }

    function chapters() {
      return activeBook().chapters || [];
    }

    function renderBookPicker() {
      const books = allBooks();
      bookPicker.style.display = books.length > 1 || library.authorTools ? "" : "none";
      bookSelect.innerHTML = books.map((book) =>
        '<option value="' + escapeHtml(book.id) + '">' + escapeHtml(book.title) + '</option>'
      ).join("");
      bookSelect.value = activeBook().id || "";
      const book = activeBook();
      const countText = (book.chapterCount || 0) + " 章 · " + (Math.round((book.wordCount || 0) / 100) / 10) + " 千字";
      bookDescription.textContent = [book.description, countText].filter(Boolean).join(" / ");
    }

    function setView(view) {
      state.view = view;
      if (!library.singleBook) localStorage.setItem("reader.view", view);
      document.body.dataset.view = view;
      homeButton.classList.toggle("active", view === "home");
      bookstoreButton.classList.toggle("active", view === "bookstore");
      aboutButton.classList.toggle("active", view === "about");
      publicHomeButton.classList.toggle("active", view === "home");
      publicBookstoreButton.classList.toggle("active", view === "bookstore");
      publicAboutButton.classList.toggle("active", view === "about");
      footerNav.style.display = view === "reader" ? "" : "none";
      document.body.classList.remove("menu-open");
    }

    function renderBookCovers(bookList) {
      const sourceBooks = allBooks();
      const books = bookList || sourceBooks;
      return books.map((item) => {
        const globalIndex = sourceBooks.findIndex((book) => book.id === item.id);
        const displayIndex = globalIndex >= 0 ? globalIndex + 1 : 1;
        return (
        '<button class="book-cover" data-start-book="' + escapeHtml(item.id) + '" type="button" aria-label="打开' + escapeHtml(item.title) + '">' +
          '<span class="cover-kicker">Book ' + String(displayIndex).padStart(2, "0") + '</span>' +
          '<span>' +
            '<span class="cover-title">' + escapeHtml(item.title) + '</span>' +
            '<span class="cover-subtitle">' + escapeHtml(item.description || "点击进入阅读。") + '</span>' +
          '</span>' +
          '<span class="cover-footer"><span>' + (item.chapterCount || 0) + ' 篇</span><span>点击阅读</span></span>' +
        '</button>'
        );
      }).join("");
    }

    function renderBookGroups() {
      const groups = [
        {
          key: "原创写作",
          title: "我写的",
          lede: "我的 AI 学习、实践和写作实验。"
        },
        {
          key: "翻译与参考",
          title: "翻译与参考",
          lede: "来自公开材料的翻译、摘录和再理解。"
        }
      ];
      const books = allBooks();
      const rendered = groups.map((group) => {
        const groupBooks = books.filter((book) => (book.category || "原创写作") === group.key);
        if (!groupBooks.length) return "";
        return (
          '<section class="book-group">' +
            '<h3 class="book-group-title">' + escapeHtml(group.title) + '</h3>' +
            '<p class="book-group-lede">' + escapeHtml(group.lede) + '</p>' +
            '<div class="book-shelf">' + renderBookCovers(groupBooks) + '</div>' +
          '</section>'
        );
      });
      const knownKeys = new Set(groups.map((group) => group.key));
      const otherBooks = books.filter((book) => !knownKeys.has(book.category || "原创写作"));
      if (otherBooks.length) {
        rendered.push(
          '<section class="book-group">' +
            '<h3 class="book-group-title">其他</h3>' +
            '<p class="book-group-lede">暂未归类的内容。</p>' +
            '<div class="book-shelf">' + renderBookCovers(otherBooks) + '</div>' +
          '</section>'
        );
      }
      return rendered.join("");
    }

    function renderHome() {
      setView("home");
      renderBookPicker();
      currentTitle.textContent = "首页";
      articleMeta.textContent = "给 Allie 和她这一代人的 AI 学习笔记";
      content.innerHTML =
        '<div class="home-layout">' +
          '<div class="home-copy">' +
            '<p class="home-kicker">Library to Allie and her generation</p>' +
            '<h1 class="home-title">给 Allie 和她这一代人的 AI 学习笔记</h1>' +
            '<p class="home-lede">这个网站是给我的女儿 Allie，以及和她同一代正在长大的孩子看的。等他们真正进入世界时，AI 很可能已经像搜索、手机和互联网一样普通。</p>' +
            '<p>这里会放我对 AI 的学习、思考和写作实验：有些是面向小学生也能慢慢理解的 AI 科普，有些是我受到一线 AI 公司公开材料启发后的整理，也有一些是我和 AI 反复讨论、追问、改写后留下来的文章。</p>' +
            '<div class="home-actions">' +
              '<button class="text-button" data-show-bookstore="true">进入书城</button>' +
              '<button class="text-button" data-show-about="true">关于这个网站</button>' +
            '</div>' +
          '</div>' +
          '<div>' +
            '<h2 class="bookstore-title">书城</h2>' +
            '<p class="bookstore-lede">这里按内容来源分成两类：一类是我自己的 AI 学习、实践和写作；另一类是公开材料的翻译与参考。</p>' +
            renderBookGroups() +
          '</div>' +
          '<div class="home-copy">' +
            '<h2>参考与启发</h2>' +
            '<ul class="source-list">' +
              '<li><a href="https://openai.com/index/malta-chatgpt-plus-partnership/" target="_blank" rel="noreferrer">OpenAI and Malta partner to bring ChatGPT Plus to all citizens</a></li>' +
              '<li><button class="text-button" data-start-book="founders-playbook" type="button">Anthropic: The founder&#39;s playbook（AI 翻译稿 / Book 02）</button></li>' +
              '<li><a href="https://www.socratopia.app/" target="_blank" rel="noreferrer">Socratopia: AI-powered Socratic learning</a></li>' +
            '</ul>' +
          '</div>' +
        '</div>';
      renderToc();
      renderNotes();
      requestAnimationFrame(updateProgress);
    }

    function renderBookstore() {
      setView("bookstore");
      renderBookPicker();
      currentTitle.textContent = "书城";
      articleMeta.textContent = "当前收录的书";
      content.innerHTML =
        '<h1>书城</h1>' +
        '<p class="bookstore-lede">这里放我正在整理和写作的书。按内容来源分成两类：我写的，以及翻译与参考。以后新增书只要在配置里标好分类，就会自动进入对应区域。</p>' +
        renderBookGroups();
      renderToc();
      renderNotes();
      requestAnimationFrame(updateProgress);
    }

    function renderAbout() {
      setView("about");
      renderBookPicker();
      currentTitle.textContent = "关于";
      articleMeta.textContent = "项目说明";
      content.innerHTML =
        '<h1>关于这个项目</h1>' +
        '<p>这个站点不是一个泛泛的 AI 工具导航，也不是一份追热点的教程。它想做的是：受 OpenAI、Anthropic 等一线 AI 公司公开实践的启发，重新写一份更适合中文使用者阅读和行动的 AI 科普与 AI 原生工作手册。</p>' +
        '<p>我会把原始材料、自己的理解和中文语境下的延展尽量分清楚。这里的观点不一定都对，但它们应该是可讨论、可实践、也可被修正的。</p>' +
        '<h2>为什么叫“AI 原生工作”</h2>' +
        '<p>因为 AI 不只是提高某个动作的效率。更深的变化在于：如果 AI 能力已经存在，我们是不是应该重新设计任务、流程、角色和组织协作方式。</p>' +
        '<div class="home-actions"><button class="text-button" data-start-reading="true">从前言开始</button></div>';
      renderToc();
      renderNotes();
      requestAnimationFrame(updateProgress);
    }

    function renderView() {
      if (state.view === "about") {
        renderAbout();
      } else if (state.view === "bookstore") {
        renderBookstore();
      } else if (state.view === "reader") {
        renderArticle();
      } else {
        renderHome();
      }
    }

    function chapterNumberText(chapter) {
      if (chapter.numberLabel) return chapter.numberLabel;
      return chapter.globalChapter === 0 ? "序" : String(chapter.globalChapter);
    }

    function chapterMetaText(chapter) {
      const chapterText = chapter.metaLabel || (chapter.globalChapter === 0 ? "前言" : "第 " + chapter.globalChapter + " 章");
      return chapter.partTitle + " / " + chapterText + " / " + (Math.round(chapter.wordCount / 100) / 10) + " 千字";
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function inlineMarkdown(value) {
      let html = escapeHtml(value);
      html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html = html.replace(new RegExp(String.fromCharCode(96) + "([^" + String.fromCharCode(96) + "]+)" + String.fromCharCode(96), "g"), "<code>$1</code>");
      return html;
    }

    function renderMarkdown(markdown, query = "") {
      const lines = markdown.split(/\r?\n/);
      const blocks = [];
      let paragraph = [];
      let list = [];
      let listType = null;
      let tableRows = [];
      let codeLines = [];
      let inCodeBlock = false;

      function flushParagraph() {
        if (!paragraph.length) return;
        blocks.push("<p>" + inlineMarkdown(paragraph.join(" ")) + "</p>");
        paragraph = [];
      }

      function flushList() {
        if (!list.length) return;
        const tag = listType === "ol" ? "ol" : "ul";
        blocks.push("<" + tag + ">" + list.map((item) => "<li>" + inlineMarkdown(item) + "</li>").join("") + "</" + tag + ">");
        list = [];
        listType = null;
      }

      function tableCells(line) {
        return line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
      }

      function isSeparatorRow(cells) {
        return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
      }

      function flushTable() {
        if (!tableRows.length) return;
        const rows = tableRows.map(tableCells);
        const hasHeader = rows.length > 1 && isSeparatorRow(rows[1]);
        const bodyRows = hasHeader ? rows.slice(2) : rows;
        if (hasHeader) {
          blocks.push(
            "<table><thead><tr>" +
              rows[0].map((cell) => "<th>" + inlineMarkdown(cell) + "</th>").join("") +
              "</tr></thead><tbody>" +
              bodyRows.map((row) => "<tr>" + row.map((cell) => "<td>" + inlineMarkdown(cell) + "</td>").join("") + "</tr>").join("") +
              "</tbody></table>"
          );
        } else {
          blocks.push(
            "<table><tbody>" +
              bodyRows.map((row) => "<tr>" + row.map((cell) => "<td>" + inlineMarkdown(cell) + "</td>").join("") + "</tr>").join("") +
              "</tbody></table>"
          );
        }
        tableRows = [];
      }

      function flushCode() {
        if (!codeLines.length) return;
        blocks.push("<pre><code>" + escapeHtml(codeLines.join("\n")) + "</code></pre>");
        codeLines = [];
      }

      for (const rawLine of lines) {
        if (rawLine.trim().startsWith(String.fromCharCode(96).repeat(3))) {
          if (inCodeBlock) {
            flushCode();
            inCodeBlock = false;
          } else {
            flushParagraph();
            flushList();
            flushTable();
            inCodeBlock = true;
          }
          continue;
        }
        if (inCodeBlock) {
          codeLines.push(rawLine);
          continue;
        }
        const line = rawLine.trim();
        if (!line) {
          flushParagraph();
          flushList();
          flushTable();
          continue;
        }
        if (/^---+$/.test(line)) {
          flushParagraph();
          flushList();
          flushTable();
          blocks.push("<hr>");
          continue;
        }
        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
          flushParagraph();
          flushList();
          flushTable();
          const level = heading[1].length;
          blocks.push("<h" + level + ">" + inlineMarkdown(heading[2]) + "</h" + level + ">");
          continue;
        }
        if (line.startsWith(">")) {
          flushParagraph();
          flushList();
          flushTable();
          blocks.push("<blockquote>" + inlineMarkdown(line.replace(/^>\s?/, "")) + "</blockquote>");
          continue;
        }
        if (line.startsWith("|") && line.endsWith("|")) {
          flushParagraph();
          flushList();
          tableRows.push(line);
          continue;
        }
        const unordered = line.match(/^[-*]\s+(.+)$/);
        const ordered = line.match(/^\d+\.\s+(.+)$/);
        if (unordered || ordered) {
          flushParagraph();
          flushTable();
          const type = ordered ? "ol" : "ul";
          if (listType && listType !== type) flushList();
          listType = type;
          list.push((unordered || ordered)[1]);
          continue;
        }
        flushTable();
        paragraph.push(line);
      }
      flushParagraph();
      flushList();
      flushTable();
      flushCode();

      let html = blocks.join("\n");
      if (query.trim()) {
        const safeQuery = escapeRegExp(query.trim());
        html = html.replace(new RegExp("(" + safeQuery + ")", "gi"), "<mark>$1</mark>");
      }
      return html;
    }

    function escapeRegExp(value) {
      return value.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
    }

    function filteredChapters() {
      const query = state.query.trim().toLowerCase();
      const bookChapters = chapters();
      if (!query) return bookChapters;
      return bookChapters.filter((chapter) =>
        chapter.title.toLowerCase().includes(query) ||
        chapter.partTitle.toLowerCase().includes(query) ||
        chapter.markdown.toLowerCase().includes(query)
      );
    }

    function renderToc() {
      const visible = filteredChapters();
      const groups = new Map();
      visible.forEach((chapter) => {
        if (!groups.has(chapter.partKey)) groups.set(chapter.partKey, []);
        groups.get(chapter.partKey).push(chapter);
      });

      toc.innerHTML = [...groups.entries()].map(([partKey, group]) => {
        const items = group.map((chapter) =>
          '<button class="chapter-button ' + (chapter.id === state.activeId ? "active" : "") + '" data-id="' + chapter.id + '">' +
            '<span class="chapter-num">' + chapterNumberText(chapter) + '</span>' +
            '<span>' +
              '<span class="chapter-name">' + escapeHtml(chapter.title) + '</span>' +
              '<span class="chapter-meta">' + (Math.round(chapter.wordCount / 100) / 10) + ' 千字</span>' +
            '</span>' +
          '</button>'
        ).join("");
        return '<div class="part-title">' + escapeHtml(group[0].partTitle) + '</div><div class="chapter-list">' + items + '</div>';
      }).join("");
    }

    function renderArticle() {
      const bookChapters = chapters();
      const chapter = bookChapters.find((item) => item.id === state.activeId) || bookChapters[0];
      if (!chapter) return;
      setView("reader");
      state.activeId = chapter.id;
      state.activeBookId = activeBook().id;
      localStorage.setItem("reader.activeBookId", state.activeBookId);
      localStorage.setItem("reader.activeId", state.activeId);
      if (library.singleBook) localStorage.setItem("reader.singleBook.activeId", state.activeId);
      renderBookPicker();
      currentTitle.textContent = activeBook().title + " / " + chapter.title;
      articleMeta.textContent = chapterMetaText(chapter);
      content.innerHTML = renderMarkdown(chapter.markdown, state.query);
      applyNoteHighlights(chapter);
      renderNotes();

      const index = bookChapters.findIndex((item) => item.id === chapter.id);
      updateNav(prevButton, bookChapters[index - 1], "上一章");
      updateNav(nextButton, bookChapters[index + 1], "下一章");
      renderToc();
      requestAnimationFrame(() => {
        updateProgress();
        if (pendingNoteId) {
          scrollToNote(pendingNoteId);
          pendingNoteId = "";
        }
      });
    }

    function activeChapter() {
      return chapters().find((item) => item.id === state.activeId);
    }

    function notesForActiveBook() {
      return notes.filter((note) => note.bookId === activeBook().id);
    }

    function applyNoteHighlights(chapter) {
      const chapterNotes = notes.filter((note) => note.chapterId === chapter.id && note.selectedText);
      chapterNotes.forEach((note) => highlightFirstMatch(note.selectedText, note.id));
    }

    function highlightFirstMatch(text, noteId) {
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const index = node.nodeValue.indexOf(text);
        if (index >= 0) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + text.length);
          const span = document.createElement("span");
          span.className = "note-highlight";
          span.dataset.noteId = noteId;
          span.title = "查看批注";
          range.surroundContents(span);
          return;
        }
        node = walker.nextNode();
      }
    }

    function renderNotes() {
      const bookNotes = notesForActiveBook().slice().sort((a, b) => b.createdAt - a.createdAt);
      if (!bookNotes.length) {
        noteList.innerHTML = '<div class="chapter-meta">还没有批注。划选正文里的句子就可以写。</div>';
        return;
      }
      noteList.innerHTML = bookNotes.map((note) =>
        '<button class="note-item" data-note-id="' + note.id + '">' +
          '<span class="note-quote">' + escapeHtml(note.selectedText.slice(0, 42)) + '</span>' +
          '<span class="note-text">' + escapeHtml(note.noteText || "无文字批注") + '</span>' +
          '<span class="chapter-meta">' + escapeHtml(note.chapterTitle || "") + '</span>' +
        '</button>'
      ).join("");
    }

    function scrollToNote(noteId) {
      const target = content.querySelector('[data-note-id="' + noteId + '"]');
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.animate([{ outlineColor: "transparent" }, { outlineColor: "var(--accent)" }, { outlineColor: "transparent" }], { duration: 1000 });
    }

    function hideSelectionPopup() {
      selectionPopup.classList.remove("open");
      selectedTextForNote = "";
      noteInput.value = "";
      selectedPreview.textContent = "";
      saveNoteButton.disabled = true;
    }

    function showSelectionPopup(range, selectedText) {
      selectedTextForNote = selectedText;
      noteInput.value = "";
      selectedPreview.textContent = selectedText.length > 120 ? selectedText.slice(0, 120) + "..." : selectedText;
      saveNoteButton.disabled = true;
      const rect = range.getBoundingClientRect();
      const popupWidth = Math.min(360, window.innerWidth - 24);
      const left = Math.min(window.innerWidth - popupWidth - 12, Math.max(12, rect.left));
      const bottomTop = rect.bottom + 10;
      const top = bottomTop > window.innerHeight - 230 ? Math.max(12, rect.top - 230) : bottomTop;
      selectionPopup.style.left = left + "px";
      selectionPopup.style.top = top + "px";
      selectionPopup.classList.add("open");
      noteInput.focus();
    }

    function makeImportedChapter(bookId, file, markdown, index) {
      const h1 = [...markdown.matchAll(/^#\s+(.+)$/gm)].map((match) => match[1].trim());
      const title = h1[0] || file.name.replace(/\.md$/i, "");
      return {
        id: bookId + "-chapter-" + (index + 1),
        bookId,
        fileName: file.name,
        partKey: "imported",
        partTitle: "导入内容",
        chapterInPart: index + 1,
        globalChapter: index + 1,
        title,
        markdown,
        wordCount: Array.from(markdown.replace(new RegExp(String.fromCharCode(96).repeat(3) + "[\\s\\S]*?" + String.fromCharCode(96).repeat(3), "g"), "").replace(/\s/g, "")).length,
      };
    }

    async function importMarkdownFiles(fileList) {
      const files = [...fileList].filter((file) => file.name.toLowerCase().endsWith(".md"));
      if (!files.length) return;
      files.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN", { numeric: true }));
      const bookName = window.prompt("给这批 Markdown 起一个书名", files[0].name.replace(/\.md$/i, ""));
      if (!bookName) return;
      const bookId = "imported-" + Date.now();
      const texts = await Promise.all(files.map((file) => file.text()));
      const chapters = files.map((file, index) => makeImportedChapter(bookId, file, texts[index], index));
      const book = {
        id: bookId,
        title: bookName,
        description: "浏览器导入",
        chapters,
        chapterCount: chapters.length,
        wordCount: chapters.reduce((total, chapter) => total + chapter.wordCount, 0),
      };
      importedBooks.push(book);
      saveImportedBooks();
      state.activeBookId = book.id;
      state.activeId = chapters[0]?.id;
      renderArticle();
    }

    function updateNav(button, chapter, label) {
      button.disabled = !chapter;
      button.innerHTML = chapter
        ? '<div class="nav-label">' + label + '</div><div class="nav-title">' + escapeHtml(chapter.title) + '</div>'
        : '<div class="nav-label">' + label + '</div><div class="nav-title">没有更多章节</div>';
      button.onclick = () => {
        if (!chapter) return;
        state.activeId = chapter.id;
        window.scrollTo({ top: 0, behavior: "smooth" });
        renderArticle();
      };
    }

    function updateProgress() {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(100, Math.max(0, (scrollTop / max) * 100)) : 0;
      progress.style.width = ratio + "%";
    }

    toc.addEventListener("click", (event) => {
      const button = event.target.closest("[data-id]");
      if (!button) return;
      state.activeId = button.dataset.id;
      document.body.classList.remove("menu-open");
      window.scrollTo({ top: 0, behavior: "smooth" });
      renderArticle();
    });

    content.addEventListener("mouseup", () => {
      if (state.view !== "reader") return;
      const selection = window.getSelection();
      const selectedText = selection ? selection.toString().trim() : "";
      if (!selection || !selectedText || selectedText.length < 2) return;
      if (!content.contains(selection.anchorNode) || !content.contains(selection.focusNode)) return;
      showSelectionPopup(selection.getRangeAt(0), selectedText);
    });

    content.addEventListener("mousedown", (event) => {
      if (!selectionPopup.classList.contains("open")) return;
      if (event.target.closest("[data-note-id]")) return;
      hideSelectionPopup();
    });

    content.addEventListener("click", (event) => {
      const bookButton = event.target.closest("[data-start-book]");
      if (bookButton) {
        state.activeBookId = bookButton.dataset.startBook;
        state.activeId = chapters()[0]?.id;
        localStorage.setItem("reader.activeBookId", state.activeBookId);
        localStorage.setItem("reader.activeId", state.activeId || "");
        window.scrollTo({ top: 0, behavior: "smooth" });
        renderArticle();
        return;
      }
      const startButton = event.target.closest("[data-start-reading]");
      if (startButton) {
        state.activeId = chapters()[0]?.id;
        window.scrollTo({ top: 0, behavior: "smooth" });
        renderArticle();
        return;
      }
      const aboutTrigger = event.target.closest("[data-show-about]");
      if (aboutTrigger) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        renderAbout();
        return;
      }
      const bookstoreTrigger = event.target.closest("[data-show-bookstore]");
      if (bookstoreTrigger) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        renderBookstore();
        return;
      }
      const highlight = event.target.closest("[data-note-id]");
      if (!highlight) return;
      const note = notes.find((item) => item.id === highlight.dataset.noteId);
      if (note) window.alert((note.selectedText || "") + "\n\n" + (note.noteText || "无文字批注"));
    });

    saveNoteButton.addEventListener("click", () => {
      const chapter = activeChapter();
      const noteText = noteInput.value.trim();
      if (!chapter || !selectedTextForNote || !noteText) {
        hideSelectionPopup();
        window.getSelection()?.removeAllRanges();
        return;
      }
      const note = {
        id: "note-" + Date.now(),
        bookId: activeBook().id,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        selectedText: selectedTextForNote,
        noteText,
        createdAt: Date.now(),
      };
      notes.push(note);
      saveNotes();
      pendingNoteId = note.id;
      hideSelectionPopup();
      window.getSelection()?.removeAllRanges();
      renderArticle();
    });

    noteInput.addEventListener("input", () => {
      saveNoteButton.disabled = !noteInput.value.trim();
    });

    cancelNoteButton.addEventListener("click", () => {
      hideSelectionPopup();
      window.getSelection()?.removeAllRanges();
    });

    cancelNoteTextButton.addEventListener("click", () => {
      hideSelectionPopup();
      window.getSelection()?.removeAllRanges();
    });

    selectionPopup.addEventListener("mousedown", (event) => {
      event.stopPropagation();
    });

    document.addEventListener("mousedown", (event) => {
      if (!selectionPopup.classList.contains("open")) return;
      if (selectionPopup.contains(event.target)) return;
      if (content.contains(event.target)) return;
      hideSelectionPopup();
      window.getSelection()?.removeAllRanges();
    });

    noteList.addEventListener("click", (event) => {
      const item = event.target.closest("[data-note-id]");
      if (!item) return;
      const note = notes.find((entry) => entry.id === item.dataset.noteId);
      if (!note) return;
      state.activeBookId = note.bookId;
      state.activeId = note.chapterId;
      pendingNoteId = note.id;
      renderArticle();
      document.body.classList.remove("menu-open");
    });

    search.addEventListener("input", () => {
      state.query = search.value;
      const first = filteredChapters()[0];
      if (first && !filteredChapters().some((chapter) => chapter.id === state.activeId)) {
        state.activeId = first.id;
      }
      renderArticle();
    });

    homeButton.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      renderHome();
    });

    bookstoreButton.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      renderBookstore();
    });

    aboutButton.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      renderAbout();
    });

    publicHomeButton.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      renderHome();
    });

    publicBookstoreButton.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      renderBookstore();
    });

    publicAboutButton.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      renderAbout();
    });

    importButton.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => importMarkdownFiles(fileInput.files));
    dropZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropZone.classList.add("drag-over");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
    dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      dropZone.classList.remove("drag-over");
      importMarkdownFiles(event.dataTransfer.files);
    });

    bookSelect.addEventListener("change", () => {
      state.activeBookId = bookSelect.value;
      state.activeId = chapters()[0]?.id;
      localStorage.setItem("reader.activeBookId", state.activeBookId);
      localStorage.setItem("reader.activeId", state.activeId || "");
      window.scrollTo({ top: 0, behavior: "smooth" });
      renderView();
    });

    document.getElementById("increaseFont").addEventListener("click", () => {
      state.fontSize = Math.min(24, state.fontSize + 1);
      localStorage.setItem("reader.fontSize", state.fontSize);
      document.documentElement.style.setProperty("--font-size", state.fontSize + "px");
    });

    document.getElementById("decreaseFont").addEventListener("click", () => {
      state.fontSize = Math.max(16, state.fontSize - 1);
      localStorage.setItem("reader.fontSize", state.fontSize);
      document.documentElement.style.setProperty("--font-size", state.fontSize + "px");
    });

    document.getElementById("themeButton").addEventListener("click", (event) => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      localStorage.setItem("reader.theme", state.theme);
      document.documentElement.dataset.theme = state.theme;
      event.currentTarget.textContent = state.theme === "dark" ? "浅色" : "深色";
    });

    document.getElementById("menuButton").addEventListener("click", () => {
      document.body.classList.toggle("menu-open");
    });

    document.getElementById("notesButton").addEventListener("click", () => {
      document.body.classList.add("menu-open");
      noteList.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideSelectionPopup();
    });

    window.addEventListener("scroll", () => {
      updateProgress();
      if (selectionPopup.classList.contains("open")) hideSelectionPopup();
    }, { passive: true });
    window.addEventListener("resize", updateProgress);

    document.getElementById("themeButton").textContent = state.theme === "dark" ? "浅色" : "深色";
    if (!chapters().some((chapter) => chapter.id === state.activeId)) {
      state.activeId = chapters()[0]?.id;
    }
    renderBookPicker();
    renderView();
  </script>
</body>
</html>`;

function writeReader(outputName, readerLibrary, title) {
  const output = html
    .replaceAll("__LIBRARY_TITLE__", title)
    .replace("__LIBRARY_DATA__", JSON.stringify(readerLibrary).replace(/</g, "\\u003c"));
  const outputPath = path.join(cwd, outputName);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, "utf8");
  console.log(
    `Wrote ${outputName} with ${readerLibrary.books.length} book(s), ${readerLibrary.books.reduce(
      (total, book) => total + book.chapterCount,
      0
    )} chapters.`
  );
}

writeReader(outputFile, library, config.libraryTitle ?? "本地阅读器");

function writeSingleBook(book, outputName) {
  const singleBookLibrary = {
    title: book.title,
    authorTools: false,
    singleBook: true,
    books: [book],
  };
  writeReader(outputName, singleBookLibrary, book.title);
}

if (library.books[0]) {
  writeSingleBook(library.books[0], singleBookOutputFile);
}

for (const book of library.books) {
  if (book.singleOutput && book.singleOutput !== singleBookOutputFile) {
    writeSingleBook(book, book.singleOutput);
  }
}
