# 给中文使用者的 AI 原生工作手册

这是一个面向中文使用者的 AI 素养与 AI 原生工作小书站。

它受 OpenAI、Anthropic 等一线 AI 公司公开发布的实践和方法启发，尝试按作者自己的理解，重新写一套更适合中文语境的 AI 科普、工作框架和行动建议。

## 本地生成

```powershell
node build-reader.mjs
```

生成后的入口是 `index.html`。

## 内容配置

书籍和章节来源配置在 `books.config.json`。

## 部署

这是纯静态站点，可以直接部署到 Vercel。
