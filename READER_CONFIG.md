# 配置式阅读器说明

这个目录现在有三个关键文件：

- `books.config.json`：书籍配置。
- `build-reader.mjs`：把配置中的 Markdown 打包进阅读器。
- `writing-planner.html`：生成后的单文件阅读器，可以直接打开。

## 重新生成

```powershell
node build-reader.mjs
```

## 在网页里临时导入

打开 `writing-planner.html` 后，可以点击 `导入 MD 成书`，或者把一批 `.md` 文件拖到左侧导入区。

导入后的书会保存在当前浏览器的本地存储里，不会写回这个文件夹。适合自己临时阅读、整理材料。

## 批注

在正文中划选一段文字，会弹出批注输入框。保存后，左侧 `批注` 区可以快速跳回对应位置。

当前批注也保存在当前浏览器本地。如果换电脑、换浏览器、清理浏览器数据，批注不会自动同步。

## 增加一本书

把一批 `.md` 文件放进当前目录，然后在 `books.config.json` 的 `books` 数组里新增一项：

```json
{
  "id": "my-second-book",
  "title": "第二本书",
  "description": "说明文字，可不填",
  "sources": [
    {
      "part": "正文",
      "files": "SecondBook_Ch*.md",
      "chapterOffset": 0
    }
  ]
}
```

如果一本书分上下篇，可以写多个 `sources`：

```json
{
  "id": "example-book",
  "title": "示例书",
  "sources": [
    {
      "part": "上篇",
      "files": "Example_PartI_Ch*.md",
      "chapterOffset": 0
    },
    {
      "part": "下篇",
      "files": "Example_PartII_Ch*.md",
      "chapterOffset": 10
    }
  ]
}
```

`files` 支持 `*` 和 `?` 通配符，也可以写成文件名数组。

## 分发建议

如果只是自己用，直接打开 `writing-planner.html` 就够了。

如果要发给别人阅读，最好把它当成静态网页发布成 URL，而不是直接把 `.html` 文件丢进聊天软件。很多聊天软件会把 `.html` 当普通文件预览，显示源代码，而不是执行成网页。
