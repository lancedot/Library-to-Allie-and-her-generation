# 书城项目交接文档

更新时间：2026-05-20

## 1. 项目定位

这是 `Library to Allie and her generation` 书城项目。

它是一个纯静态网页书城，用来发布 Alex Liu 写作、翻译和整理的 AI 相关小书。核心定位不是工具站，而是一个面向 Allie 和她这一代人的 AI 学习、思考与写作档案。

线上站点：

`https://library-to-allie-and-her-generation.vercel.app/`

GitHub 仓库：

`https://github.com/lancedot/Library-to-Allie-and-her-generation`

## 2. 当前书城内容

当前公开书城由 `books.config.json` 管理，页面会按 `category` 自动分组。

### 我写的

- `AI 素养基础`
  - id: `ai-literacy-foundations`
  - 源文件：`Books/AI-Literacy-Foundations/`
  - 单书 HTML：`downloads/ai-literacy-foundations.html`
  - 单书 PDF：`downloads/ai-literacy-foundations.pdf`
- `AI 原生工作基础`
  - id: `ai-native-work-foundations`
  - 源文件：`Books/AI-Native-Work-Foundations/`
  - 单书 HTML：`downloads/ai-native-work-foundations.html`
  - 单书 PDF：`downloads/ai-native-work-foundations.pdf`
- `财务部门的 AI 转型实战手册`
  - id: `finance-ai-playbook`
  - 源文件：`Books/Finance/`
  - 单书 HTML：`downloads/finance-ai-playbook.html`
  - 单书 PDF：`downloads/finance-ai-playbook.pdf`

### 翻译与参考

- `创始人手册：构建 AI 原生创业公司`
  - id: `founders-playbook`
  - 源文件：`Books/Translate/Founders_Playbook_Ch*.zh.md`

## 3. 关键文件

- `books.config.json`
  - 书籍配置入口。
  - 新增书时优先改这里。
  - 每本书建议填写：`id`、`title`、`author`、`kicker`、`category`、`description`、`singleOutput`、`pdfOutput`、`sources`。
- `build-reader.mjs`
  - 把 Markdown 打包成静态阅读器。
  - 会生成主站 `index.html` 和各单书 HTML。
  - 首页“书城”按 `category` 自动分组，目前支持 `原创写作`、`翻译与参考`，未知分类会进入“其他”。
- `scripts/build_book_pdf.py`
  - 为配置了 `pdfOutput` 的书生成 PDF。
  - PDF 会有封面、目录、章节分页和书签。
- `index.html`
  - 生成后的主站入口，需要提交。
- `downloads/*.html`
  - 单书 HTML 产物，需要提交。
- `downloads/*.pdf`
  - 单书 PDF 产物，需要提交。

## 4. 常用命令

重新生成网页：

```powershell
node build-reader.mjs
```

重新生成 PDF：

```powershell
python scripts\build_book_pdf.py
```

检查当前 Git 状态：

```powershell
git status --short
```

发布流程：

```powershell
git add <本次相关文件>
git commit -m "<提交说明>"
git push origin main
```

Vercel 会跟随 GitHub `main` 分支自动部署。

## 5. 新增一本书的推荐流程

1. 把 Markdown 源文件放到 `Books/<Book-Folder>/` 下。
2. 如果是一整份 Markdown，先按章节切成多个 `.md` 文件。文件名建议包含 `Ch1`、`Ch2`，附录建议包含 `Appendix_A`。
3. 在 `books.config.json` 的 `books` 数组中新增书籍配置。
4. 给书设置 `category`：
   - 原创内容用 `原创写作`
   - 翻译、摘录、参考材料用 `翻译与参考`
5. 如果需要单书分发，设置：
   - `singleOutput`: `downloads/<slug>.html`
   - `pdfOutput`: `downloads/<slug>.pdf`
6. 运行 `node build-reader.mjs`。
7. 如果有 PDF，运行 `python scripts\build_book_pdf.py`。
8. 检查生成后的 `index.html` 数据、单书 HTML 和 PDF 页数/目录。
9. 只提交本次相关源文件、配置和产物。

## 6. 当前参考链接

首页“参考与启发”包含：

- OpenAI and Malta partner to bring ChatGPT Plus to all citizens
- OpenAI Academy: How finance teams use Codex
- Anthropic: The founder's playbook
- Socratopia: AI-powered Socratic learning

参考链接写在 `build-reader.mjs` 的 `renderHome()` 中。修改后需要重新运行 `node build-reader.mjs`。

## 7. 不属于书城提交范围的内容

这个目录里有一些基于这些书继续衍生出来的培训材料和本地实验，它们不属于书城项目本身。

不要随书城提交或推送：

- `output/`
  - 企业 AI 培训 HTML PPT、讲稿、演示服务和素材输出。
  - 已在 `.gitignore` 中。
- `TRAINING_MATERIAL_HANDOFF.md`
  - 企业 AI 培训材料的独立交接文档。
  - 这是培训项目自己的 handoff，不是书城 handoff。
- `ai-native-work/`
  - 本地技能/实验目录，当前不属于书城发布内容。

当前未跟踪但不要自动加入的内容：

- `Books/Blog/`
  - 这是潜在博客/文章素材。除非用户明确要求加入书城或发布为文章，不要自动 `git add`。

原则：每次提交前都运行 `git status --short`，只加入本次任务明确相关的文件。不要用 `git add .`。

## 8. 历史内容说明

- `Books/V1/`：旧稿，保留作历史对照，不在当前书城中展示。
- `Books/V2/`：旧合订本阶段的稿件，当前已经拆分为 `AI 素养基础` 和 `AI 原生工作基础` 两本书，不再直接作为公开书籍入口。
- `downloads/ai-native-work-handbook.html` 和 `downloads/ai-native-work-handbook.pdf`：旧合订本单书产物，当前不再作为主入口推荐。不要删除，除非用户明确要求清理旧版本。

## 9. 验证要点

网页生成后，至少确认：

- `index.html` 能解析出所有书籍。
- 首页和书城不再写死“目前收录几本书”，而是按分类展示。
- 正式页面不显示原始 Markdown 文件名。
- 单书 HTML 只包含对应单本书。

PDF 生成后，至少确认：

- 页数合理。
- 目录存在。
- PDF outline/bookmarks 数量和章节数一致。
- 封面作者名正确。
- 抽查封面、目录、正文页和末页渲染正常。

## 10. 已知环境习惯

- Windows PowerShell 环境。
- 本项目没有复杂依赖；生成 HTML 用 Node，生成 PDF 用 Python。
- Git 写入 `.git/index.lock` 有时需要提升权限。
- `.config/git/ignore` 可能出现 permission warning，不影响正常提交。
