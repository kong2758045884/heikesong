# EduMind

## 本地开发

在项目目录运行 `npm ci`。需要 Node.js 和 Go 1.20 或更新版本。

```sh
EDUMIND_LOCAL_DEMO=1 go -C server run .
npm run dev -- --host 127.0.0.1
```

在两个终端分别运行上述命令，打开 [本地 EduMind](http://127.0.0.1:5173/)。
本机演示账号为 `admin`、`teacher` 和 `student`，密码均为 `123456`。退出后可用另一账号登录。
演示模式要求后端监听本机地址，账号库与非演示环境分开。Vite 默认代理 `/api` 至监听在 `127.0.0.1:18768` 的 Go 服务。

教师和学生进入各自工作台，管理员进入管理端驾驶舱。直接访问 `/#/knowledge-graph` 等页面也需要有效会话和对应权限。教学模块在此分支仍使用演示数据。

部署时保持演示模式关闭，设定 `EDUMIND_ORIGIN` 为实际 HTTPS 源站。
使用 `EDUMIND_ADMIN_USERNAME` 和 `EDUMIND_ADMIN_PASSWORD_FILE` 在空库中创建管理员，密码文件由部署环境注入。
可配置 `EDUMIND_TEACHER_CODE` 给教师注册使用，学生可直接注册。
`EDUMIND_AUTH_DIR` 指向只由该进程写入的持久目录；`EDUMIND_STATIC_DIR` 可指向 `npm run build` 生成的 `dist`。
凭据使用随机盐与 PBKDF2 保存，会话通过 HttpOnly Cookie 传递。

## React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
