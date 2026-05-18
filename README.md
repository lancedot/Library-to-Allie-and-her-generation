# Library to Allie and her generation

这是一个给 Allie 和她这一代人的 AI 学习与写作小书站。

它用来分享我对 AI 的学习过程、思考，以及试着和 AI 讨论来写作的实验。当前公开展示的是重写后的 V2 内容；V1 稿件保留在 `Books/V1/` 中，暂不展示在网页上。

## 本地生成

```powershell
node build-reader.mjs
```

生成后的入口是 `index.html`。

同时会生成 `downloads/ai-native-work-handbook.html`，这是只包含第一本书正文阅读器的单页分发版，不带首页、书城和导入工具。

生成单书 PDF：

```powershell
python scripts/build_book_pdf.py
```

PDF 输出到 `downloads/ai-native-work-handbook.pdf`。

## 内容配置

书籍和章节来源配置在 `books.config.json`。正文 Markdown 统一放在 `Books/` 下。

## 部署

这是纯静态站点，可以直接部署到 Vercel。
