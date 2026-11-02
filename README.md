# dsh-save-file

给 DSH Web GUI 右侧内置"文件"面板加文件下载能力：

- **每个文件行**悬停时右侧出现 ⬇ 下载按钮，点击即保存到浏览器默认下载目录；
- **文档预览页**头部多一个下载按钮，直接下载当前预览的文件；
- 超过 32MB 的大文件自动按 2MB 分块续读，按钮上显示进度百分比。

## 原理

纯客户端插件，无宿主端路由：

1. 通过官方 slot `sidebar.right.tab.files.actions` 注册一个隐形组件，捕获当前 Files 页的 `sessionId`；
2. `MutationObserver` 监听文件树 DOM，给每个 `li[data-files-entry="file"]` 追加一个绝对定位的下载按钮（行按钮的兄弟节点，不嵌套、不干扰"打开"点击）；
3. 点击后经内置 RPC `workspaceFiles.readBytes(sessionId, 绝对路径)` 取回字节（整读超限报 `workspace-file/too-large` 时改用 `range` 分块循环），拼成 `Blob` 用 `<a download>` 触发浏览器保存。

## 安装

在 `~/.dsh/profiles/web/package.json` 中：

```jsonc
"dependencies": {
  "@jichong/dsh-save-file": "link:/home/jichong/Projects/dsh-plugins/save-file"
},
"dsh": { "profile": { "bundles": [ /* ... */ "@jichong/dsh-save-file" ] } }
```

然后在该目录执行 `pnpm install`，重启 dsh（`restart.sh`）并刷新浏览器。
