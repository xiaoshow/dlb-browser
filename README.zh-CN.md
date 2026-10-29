# DLB 浏览器

[English](README.md) | **简体中文**

面向 macOS Apple Silicon 的本地多环境 Chromium 浏览器，原内部名称为 Prism。


![DLB Browser demo](docs/images/demo.png)

脱敏演示图：账号名称、标签和代理地址均为虚构示例，图片经过编辑。


### 功能

- Profile 文件夹：新建可折叠文件夹收纳不常用账号，批量移动环境，不改变登录态或指纹种子。
- 每个 Profile 使用独立浏览器进程和数据目录，分别保存 Cookie、LocalStorage、书签和扩展。
- 原生 Chromium 窗口，共用内核文件，不借用日常 Chrome 的个人数据。
- 独立直连、系统代理、SOCKS5 和 Xray VLESS 网络配置。
- 只读导入本机 v2rayN 节点，由用户选择收藏和默认节点，不反向修改 v2rayN。
- 接入第三方 Fingerprint Chromium 原生内核，使用固定编号和指纹种子。
- 配置时区、语言、屏幕、硬件并发数，并按代理出口查询地区。
- 不再自动添加带账号名称的环境信息页书签，保留其他用户收藏。

### 实测范围与限制

本地测试覆盖存储隔离、重启持久化、Canvas 稳定性、部分页面与 Worker 一致性、代理配置及部分真实联网，测试源码在 `tests/`。这不是所有网站的兼容性保证。

- 测试发现不同 Profile 的音频指纹碰撞，不能承诺每项指纹唯一。
- 真实 WebRTC/STUN、DNS 泄漏、TLS/HTTP 指纹尚未完整审计。
- 部分设备自定义尚未接入，不支持的配置会在启动前报错。
- 当前使用 `password-store=basic`，不要依赖浏览器保存敏感密码和支付信息。
- 签名安装、自动更新和回滚尚不完整，不保证账号不会关联或网站一定放行。
- 内核来自第三方，不是自行研发。固定版本和可执行文件 SHA256 在 `resources/native/engine.json`；固定版本不代表最新安全版本。

### 数据与安全

内部应用标识与数据目录保持兼容，不因显示名称变化迁移或清空账号：

`$HOME/Library/Application Support/prism-fingerprint-browser/`

禁止提交运行目录、workspace.json、Cookie、真实代理链接、访问密钥、个人备注、日志和截图。本仓库只含源码及必要资源，不含真实 Profile。

### 开发与打包

需要 macOS Apple Silicon、Node.js 和 pnpm：

```sh
pnpm install
pnpm run typecheck
pnpm run build
pnpm run dev
```

浏览器内核不随源码分发。请获取与清单匹配的上游 macOS ARM64 内核，放到用户数据目录的 `native/Chromium.app`，然后运行 `node scripts/prepare-native.mjs` 验证。不要绕过校验。

打包必须使用全新目录，不覆盖正在运行的应用：

```sh
pnpm exec electron-builder --mac dir --arm64 --config.directories.output=release-dlb-next
```

部分历史 UI 测试已经过时，不能把 test:environment 当作完整验收。network-live 和 network-diagnose 会读取本机节点并发起真实网络请求，运行前请读代码；隔离测试应只用临时 Profile。


## Third-party components / 第三方组件

- [Fingerprint Chromium](https://github.com/adryfish/fingerprint-chromium): native engine; review upstream licensing and release terms.
- [Xray-core](https://github.com/XTLS/Xray-core): proxy transport; bundled license files are in resources/licenses.
- Electron, React, Vite and other dependencies retain their respective licenses.

Review redistribution rights for binaries and artwork before public release. A private source backup is not a license clearance or production-security certification.
