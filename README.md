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

教师和学生进入各自工作台，管理员进入管理端驾驶舱。直接访问模块地址也需要有效会话及对应权限。

### 体验签到与实时课堂

- 教师进入「智能签到」，选定授课班级，设置场次、时限和照片要求并发布。只有发布时在该班名单内的学生能凭教师给出的签到码加入。学生可以提交照片供老师复核，也可申请现场人工核验。教师启用「允许仅凭现场口令直接签到」后，学生可直接提交口令签到。
- MediaPipe 在学生浏览器识别手势。教师复核照片并确认在场，服务端按提交时间区分准时和迟到。签到照片仅对提交学生与发起教师可见，24 小时后停止访问并由服务自动清理。
- 教师先在「班级管理」添加已注册的学生账号，再创建课程、上传课件并点击「开始授课」。学生在「实时课堂」跟随翻页，按课件页提问并查看教师答复。课堂问答在授课期间对提问学生及授课教师可见。
- 双端体验可以分别使用普通窗口与无痕窗口。手机拍照需通过 HTTPS 访问。

在「课程管理」点「邀请学生」可显示课程二维码，开课后可从「实时课堂」查看单次课堂的六位加入码。学生从底栏进入「课堂」，输入加入码，或扫码后登录并确认。课程邀请保留课程归属，课堂码在该次授课结束时失效。教学班、课程、课件及知识点在 Go 服务端保存。

同一局域网中的手机可以使用单独的学生入口。演示模式可配置 `EDUMIND_STUDENT_ADDR`（本机私有 IPv4 和端口）及 `EDUMIND_STUDENT_STATIC_DIR`（前端构建目录），教师端二维码会使用这个地址。学生入口只接受学生账号。

教师右上角的「模型管理」支持模型新增、测试和切换。同一个服务地址可复用已保存的密钥。课件上传后可先预览按页提取的内容，再点「AI 识别知识点」调用当前模型，审核结果并开课。上传支持 PPTX、含文字层的 PDF、TXT 与 Markdown，每份 12 MiB 以内。PDF 文字提取使用 Poppler 的 `pdftotext`。PPTX 预览按内容展示，原课件可下载。

服务端可配置 `EDUMIND_AI_BASE_URL`、`EDUMIND_AI_MODEL` 和 `EDUMIND_AI_API_KEY` 设置默认模型。库内新增的配置按登录账号保存，接口只返回模型配置的公开字段和密钥设置状态。

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
