// save-file — 浏览器端：给右侧"文件"面板的每个文件行加一个"下载"按钮，
// 并在文档预览页头部加一个下载当前文件的按钮。
// 字节走内置 workspaceFiles.readBytes RPC（整读 ≤32MB，超限自动按 2MB 分块续读），
// 前端拼成 Blob 后用 <a download> 触发浏览器保存。无需宿主端 HTTP 路由。
window.__ModuleLoader__.load({
	id: "@jichong/dsh-save-file",
	factory(require) {
		const React = require("react");
		const h = React.createElement;

		const inject = ["slots", "remote", "remote.workspaceFiles"];

		const CSS_ID = "@jichong/dsh-save-file/wd.css";
		// 与 workspaceFiles 默认 maxBytes（单次 range 上限 2MB）保持一致。
		const CHUNK = 2 * 1024 * 1024;

		let remote = null; // apply() 时捕获的 ctx.remote
		let currentSessionId = null; // 由 Files 页头部的隐形组件捕获

		const ICON = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2.5v7m0 0 2.8-2.8M8 9.5 5.2 6.7M3 11.5v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

		const CSS = `
li[data-files-entry="file"]{position:relative;}
.wd-dl{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:24px;height:24px;
  display:inline-flex;align-items:center;justify-content:center;border:none;background:transparent;
  border-radius:4px;cursor:pointer;color:var(--dsw-alias-label-tertiary,#818b96);opacity:0;
  transition:opacity .12s ease;z-index:1;}
li[data-files-entry="file"]:hover>.wd-dl,.wd-dl:focus-visible{opacity:1;}
.wd-dl:hover{color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));}
.wd-dl.busy{opacity:1;pointer-events:none;}
.wd-dl.busy svg{animation:wd-spin .9s linear infinite;}
.wd-tool{width:28px;height:28px;color:var(--dsw-alias-label-secondary,#59636e);border-radius:4px;
  cursor:pointer;background:transparent;border:none;flex:none;justify-content:center;align-items:center;
  padding:6px;line-height:1;display:inline-flex;}
.wd-tool:hover{color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));}
.wd-tool:disabled{opacity:.45;cursor:default;}
@keyframes wd-spin{to{transform:rotate(360deg);}}`;

		function ensureCss() {
			if (document.getElementById(CSS_ID) !== null) return;
			const style = document.createElement("style");
			style.id = CSS_ID;
			style.textContent = CSS;
			document.head.appendChild(style);
		}

		function basename(path) {
			const i = path.lastIndexOf("/");
			return i >= 0 ? path.slice(i + 1) : path;
		}

		function saveBlob(chunks, filename) {
			const url = URL.createObjectURL(new Blob(chunks));
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(url), 30_000);
		}

		// 读取整个文件：先尝试整读；超过整文件上限（默认 32MB）时按 range 分块续读。
		async function fetchBytes(absolutePath, onProgress) {
			if (remote === null || typeof currentSessionId !== "string") throw new Error("会话尚未就绪");
			const signal = new AbortController().signal;
			const first = await remote.workspaceFiles.readBytes(currentSessionId, absolutePath, {}, signal);
			if (first.ok) return first.value.data.length === 0 ? [] : [first.value.data];
			if (first.error?.code !== "workspace-file/too-large")
				throw new Error(first.error?.message ?? "读取失败");
			const chunks = [];
			let offset = 0;
			for (;;) {
				const next = await remote.workspaceFiles.readBytes(
					currentSessionId,
					absolutePath,
					{ range: { offset, length: CHUNK } },
					signal,
				);
				if (!next.ok) throw new Error(next.error?.message ?? "读取失败");
				if (next.value.data.length === 0) break;
				chunks.push(next.value.data);
				offset += next.value.data.length;
				onProgress?.(offset, next.value.bytes);
				if (next.value.eof) break;
			}
			return chunks;
		}

		// 文件行按钮的下载流程（带按钮状态反馈）。
		async function startDownload(btn, absolutePath) {
			if (btn.classList.contains("busy")) return;
			btn.classList.add("busy");
			btn.title = "下载中…";
			try {
				const chunks = await fetchBytes(absolutePath, (offset, total) => {
					if (typeof total === "number" && total > 0)
						btn.title = `下载中… ${Math.min(100, Math.round((offset / total) * 100))}%`;
				});
				saveBlob(chunks, basename(absolutePath));
				btn.title = "已保存";
			} catch (error) {
				console.warn("[save-file]", error);
				btn.title = `下载失败：${error?.message ?? error}`;
			} finally {
				setTimeout(() => {
					btn.classList.remove("busy");
					btn.title = "下载";
				}, 1600);
			}
		}

		// 给每个文件行补一个下载按钮（作为行按钮的兄弟节点，绝对定位在右侧，
		// 避免嵌套 <button>，点击也不会触发行上的"打开"）。
		function enhance() {
			for (const li of document.querySelectorAll('li[data-files-entry="file"]')) {
				if (li.querySelector(":scope > .wd-dl") !== null) continue;
				const path = li.getAttribute("data-files-path");
				if (typeof path !== "string" || path.length === 0) continue;
				const btn = document.createElement("button");
				btn.type = "button";
				btn.className = "wd-dl";
				btn.title = "下载";
				btn.innerHTML = ICON;
				btn.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					startDownload(btn, path);
				});
				li.appendChild(btn);
			}
		}

		// 隐形组件：挂在 Files 页头部官方 slot 上，捕获当前会话 id。
		function SessionAnchor(props) {
			React.useEffect(() => {
				if (typeof props.sessionId === "string" && props.sessionId.length > 0)
					currentSessionId = props.sessionId;
			}, [props.sessionId]);
			return null;
		}

		// 文档预览页头部的下载按钮（props 带 absolutePath / sessionId）。
		function DocDownloadAction(props) {
			const absolutePath = props.absolutePath;
			const [busy, setBusy] = React.useState(false);
			React.useEffect(() => {
				if (typeof props.sessionId === "string" && props.sessionId.length > 0)
					currentSessionId = props.sessionId;
			}, [props.sessionId]);
			if (typeof absolutePath !== "string" || absolutePath.length === 0) return null;
			return h("button", {
				type: "button",
				className: "wd-tool",
				title: "下载此文件",
				disabled: busy,
				dangerouslySetInnerHTML: { __html: ICON },
				onClick: () => {
					setBusy(true);
					void (async () => {
						try {
							saveBlob(await fetchBytes(absolutePath), basename(absolutePath));
						} catch (error) {
							console.warn("[save-file]", error);
						} finally {
							setBusy(false);
						}
					})();
				},
			});
		}

		function apply(ctx) {
			remote = ctx.remote;
			ensureCss();
			ctx.slots.inject("sidebar.right.tab.files.actions", () =>
				ctx.slots.register(
					{ name: "sidebar.right.tab.files.actions", id: "save-file" },
					SessionAnchor,
				),
			);
			ctx.slots.inject("sidebar.right.tab.document.actions", () =>
				ctx.slots.register(
					{ name: "sidebar.right.tab.document.actions", id: "save-file", label: "下载" },
					DocDownloadAction,
				),
			);
			enhance();
			let scheduled = false;
			const observer = new MutationObserver(() => {
				if (scheduled) return;
				scheduled = true;
				setTimeout(() => {
					scheduled = false;
					enhance();
				}, 80);
			});
			observer.observe(document.body, { childList: true, subtree: true });
		}

		return { name: "save-file", inject, apply };
	},
});
