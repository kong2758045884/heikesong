import { icon } from "./icons.js";
import "./stack-lab.js";
const $ = (s) => document.querySelector(s),
  app = $("#portal"),
  dlg = $("#formDialog");
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const brand = '<span class="brand"><img alt="" src="/brand.svg">EduMind</span>';
const params = new URLSearchParams(location.search),
  next = params.get("next") || "";
const safeNext =
  /^\/join\/\d{6}$/.test(next) ||
  /^\/teach(?:\?course=[A-Za-z0-9_-]+)?$/.test(next);
const roleDefault = next.startsWith("/join/") ? "student" : "teacher";
const phase = (s) =>
  ({
    lecture: "授课中",
    open: "收集首轮作答",
    variant: "巩固复测中",
    closed: "课堂已结束",
  })[s] || "课堂记录";
const btn = (id, title, cls = "p-btn") =>
  '<button type="button" class="' +
  cls +
  '" id="' +
  id +
  '">' +
  esc(title) +
  "</button>";
const link = (href, txt, cls = "p-btn") =>
  '<a class="' + cls + '" href="' + esc(href) + '">' + esc(txt) + "</a>";
let user = null,
  courses = [],
  learning = null,
  viewVersion = 0,
  disposers = [],
  authKind = "login",
  authRole = roleDefault,
  selectedCourse = "",
  roomTab = "analysis",
  labState = null;
async function request(path, body, extra = {}) {
  const ctl = new AbortController(),
    timer = setTimeout(() => ctl.abort(), 18000);
  try {
    const r = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: ctl.signal,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(d.error || "请求未成功，请重试");
      e.status = r.status;
      throw e;
    }
    return d;
  } catch (e) {
    if (e instanceof TypeError || e.name === "AbortError")
      throw new Error("网络连接中断，请稍后重试。");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
function clean() {
  viewVersion++;
  for (const fn of disposers.splice(0)) {
    try {
      fn();
    } catch {}
  }
}
function visibleError(el, e) {
  el.textContent = e.message || String(e);
}
const isTeacher = () => user?.role === "teacher";
const choices = () =>
  isTeacher()
    ? [
        ["home", "教师工作台", "grid"],
        ["courses", "课程与班级", "book"],
        ["analytics", "教学分析", "board"],
        ["graph", "知识图谱", "layers"],
        ["lab", "虚拟实验室", "focus"],
      ]
    : [
        ["home", "学生工作台", "grid"],
        ["courses", "我的课程", "book"],
        ["learning", "复习与错题", "pencil"],
        ["graph", "知识图谱", "layers"],
        ["lab", "虚拟实验室", "focus"],
      ];
function route() {
  try {
    return decodeURIComponent(location.hash.slice(1)) || "home";
  } catch {
    return "home";
  }
}
function go(to) {
  if (route() === to) render();
  else location.hash = to;
}
function auth() {
  clean();
  app.innerHTML =
    '<section class="p-auth"><figure class="optics">' +
    brand +
    '<div class="optics-caption"><div>高校智慧教学平台</div><h1>让每一种理解，<br>都被看见。</h1></div><figcaption>EduMind 课堂 · 学习 · 实验</figcaption></figure><div class="auth-side"><div class="auth-form"><h2>' +
    (authKind === "login" ? "登录 EduMind" : "创建账号") +
    '</h2><p class="auth-copy">' +
    (next.startsWith("/join/")
      ? "以学生身份登录，继续加入此课堂。"
      : "进入你的课程与课堂。") +
    '</p><div class="auth-tabs" role="tablist"><button id="loginTab" role="tab" aria-selected="' +
    (authKind === "login") +
    '">登录</button><button id="registerTab" role="tab" aria-selected="' +
    (authKind === "register") +
    '">注册</button></div><form id="authForm"><div class="role-switch">' +
    ["teacher", "student"]
      .map(
        (r) =>
          '<label><input name="role" type="radio" value="' +
          r +
          '" ' +
          (r === authRole ? "checked" : "") +
          ">" +
          icon(r === "teacher" ? "board" : "book", 16) +
          (r === "teacher" ? "教师" : "学生") +
          "</label>",
      )
      .join("") +
    '</div><label class="p-field">账号<input id="account" autocomplete="username" minlength="3" maxlength="40" required placeholder="输入账号，至少 3 个字符"></label>' +
    (authKind === "register"
      ? '<label class="p-field">显示名称<input id="display" maxlength="40" autocomplete="nickname" placeholder="在本人工作台显示，可选"></label>'
      : "") +
    '<label class="p-field">密码<div class="password-field"><input type="password" id="password" required minlength="' +
    (authKind === "register" ? 8 : 1) +
    '" maxlength="128" autocomplete="' +
    (authKind === "login" ? "current-password" : "new-password") +
    '" placeholder="' +
    (authKind === "login" ? "输入密码" : "至少 8 个字符") +
    '"><button type="button" id="showPass">显示</button></div></label><div id="authErr" role="alert" class="err"></div><button type="submit" class="p-btn auth-submit">' +
    (authKind === "login" ? "登录工作台" : "注册并进入") +
    "</button></form></div></div></section>";
  $("#loginTab").onclick = () => {
    authKind = "login";
    auth();
  };
  $("#registerTab").onclick = () => {
    authKind = "register";
    auth();
  };
  $("#showPass").onclick = () => {
    const f = $("#password");
    f.type = f.type === "password" ? "text" : "password";
    $("#showPass").textContent = f.type === "password" ? "显示" : "隐藏";
  };
  app
    .querySelectorAll("[name=role]")
    .forEach((n) => (n.onchange = () => (authRole = n.value)));
  $("#authForm").onsubmit = async (e) => {
    e.preventDefault();
    const b = e.submitter;
    b.disabled = true;
    $("#authErr").textContent = "";
    try {
      const r = await request("/api/auth/" + authKind, {
        username: $("#account").value.trim(),
        password: $("#password").value,
        role: authRole,
        ...(authKind === "register"
          ? { displayName: $("#display").value.trim() }
          : {}),
      });
      user = r.user;
      if (
        safeNext &&
        ((next.startsWith("/join/") && !isTeacher()) ||
          (next.startsWith("/teach") && isTeacher()))
      ) {
        location.replace(next);
        return;
      }
      if (params.has("next")) history.replaceState(null, "", "/");
      await refresh();
    } catch (err) {
      if ($("#authErr")) visibleError($("#authErr"), err);
    } finally {
      b.disabled = false;
    }
  };
}
async function refresh() {
  try {
    const [c, l] = await Promise.all([
      request("/api/courses"),
      isTeacher() ? Promise.resolve(null) : request("/api/learning"),
    ]);
    courses = c.courses || [];
    learning = l;
    render();
  } catch (e) {
    if (e.status === 401) {
      user = null;
      auth();
      return;
    }
    app.innerHTML =
      '<div class="page-loading"><p>' +
      esc(e.message) +
      "</p>" +
      btn("again", "重试") +
      "</div>";
    $("#again").onclick = refresh;
  }
}
function shell(title, view) {
  clean();
  app.innerHTML =
    '<div class="shell"><aside class="side"><a href="#home" aria-label="回到工作台">' +
    brand +
    '</a><div class="mobile-account">' +
    esc(user.displayName || user.username) +
    btn("mobileLogout", "退出", "p-text") +
    '</div><nav aria-label="工作台">' +
    choices()
      .map(
        ([id, t, ic]) =>
          '<a class="rail-link ' +
          (id === view ? "on" : "") +
          '" href="#' +
          id +
          '">' +
          icon(ic, 18) +
          esc(t) +
          "</a>",
      )
      .join("") +
    '</nav><div class="who"><span class="avatar">' +
    esc(Array.from(user.displayName || user.username)[0]) +
    "</span><div><strong>" +
    esc(user.displayName || user.username) +
    "</strong><small>" +
    (isTeacher() ? "任课教师" : "大学生") +
    '</small></div><button id="logout" class="p-text" aria-label="退出登录">' +
    icon("exit", 18) +
    '</button></div></aside><section class="work"><div class="crumb">' +
    icon("layers", 14) +
    "EduMind / " +
    esc(title) +
    '</div><div id="screen"></div></section></div>';
  const logOut = async () => {
    try {
      await request("/api/auth/logout", {});
      location.replace("/");
    } catch (e) {
      alert(e.message);
    }
  };
  $("#logout").onclick = logOut;
  $("#mobileLogout").onclick = logOut;
}
function heading(title, sub = "", action = "") {
  return (
    '<header class="pane-head"><div><h1>' +
    esc(title) +
    "</h1>" +
    (sub ? "<p>" + esc(sub) + "</p>" : "") +
    "</div>" +
    action +
    "</header>"
  );
}
function render() {
  if (!user) return auth();
  const path = route(),
    name = choices().find((x) => x[0] === path)?.[1] || "课堂管理";
  shell(name, path.startsWith("room/") ? "courses" : path);
  if (path.startsWith("room/") && isTeacher()) {
    roomPage(path.slice(5));
    return;
  }
  if (path === "courses") return coursesPage();
  if (path === "analytics" && isTeacher()) return analytics();
  if (path === "learning" && !isTeacher()) return learningPage();
  if (path === "graph") return graphPage();
  if (path === "lab") return labPage();
  home();
}
const rooms = () =>
  courses
    .flatMap((c) => (c.rooms || []).map((r) => ({ ...r, course: c })))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
const pickCourse = () =>
  courses.find((c) => c.id === selectedCourse) || courses[0];
const classroomURL = (r) =>
  isTeacher() ? "#room/" + r.code : "/join/" + encodeURIComponent(r.code);
const teachURL = (course, code) =>
  "/teach?course=" +
  encodeURIComponent(course.id) +
  (code ? "&room=" + encodeURIComponent(code) + "#board" : "#setup");
function courseAction() {
  return btn("courseAction", isTeacher() ? "创建课程" : "加入课程");
}
function lectureButton(course) {
  return (
    '<button type="button" class="p-btn" data-lecture="' +
    esc(course.id) +
    '">开始授课</button>'
  );
}
function openLecture(course) {
  formDialog(
    "开始授课",
    '<label class="p-field">本节主题<input id="lectureTitle" maxlength="240" placeholder="' +
      esc(course.name) +
      '"></label><p class="p-muted">学生进入后就能跟随课件、提问和签到。你可以在讲解中随时发布三问。</p>',
    "进入课堂",
    async () => {
      const room = await request("/api/rooms", {
        courseId: course.id,
        lecture: true,
        topic: $("#lectureTitle").value.trim(),
      });
      roomTab = "copilot";
      history.replaceState(null, "", "#room/" + room.code);
    },
  );
}
const lectureSetupURL = (record) =>
  "/teach?course=" +
  encodeURIComponent(record.course.id) +
  "&lecture=" +
  encodeURIComponent(record.code) +
  "#setup";
async function showJoin(record) {
  const url = record.joinUrl || location.origin + "/join/" + record.code;
  dlg.className = "p-dialog join-dialog";
  dlg.innerHTML =
    '<div class="splitline"><h2>加入本节课堂</h2><button class="p-text" id="closeDlg" aria-label="关闭">' +
    icon("close") +
    '</button></div><p class="p-muted">' +
    esc(record.topic) +
    '</p><img id="joinQR" alt="本节课堂的加入二维码"><label class="p-field">学生加入链接<input id="joinLink" readonly value="' +
    esc(url) +
    '"></label><button class="p-btn" id="copyLink">复制链接</button>';
  dlg.showModal();
  $("#closeDlg").onclick = () => dlg.close();
  $("#copyLink").onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      $("#copyLink").textContent = "已复制";
    } catch {
      $("#joinLink").select();
    }
  };
  try {
    const { qrURL } = await import("./assets/qr.js");
    const src = await qrURL(url);
    if ($("#joinQR")) $("#joinQR").src = src;
  } catch {
    if ($("#joinQR")) $("#joinQR").alt = "请使用下方加入链接";
  }
}
function formDialog(title, fields, action, callback) {
  dlg.className = "p-dialog";
  dlg.innerHTML =
    '<form id="portalForm"><div class="splitline"><h2>' +
    esc(title) +
    '</h2><button class="p-text" type="button" id="closeDlg" aria-label="关闭">' +
    icon("close") +
    "</button></div>" +
    fields +
    '<div class="err" id="formErr" role="alert"></div><button class="p-btn" type="submit">' +
    esc(action) +
    "</button></form>";
  dlg.showModal();
  $("#closeDlg").onclick = () => dlg.close();
  $("#portalForm").onsubmit = async (e) => {
    e.preventDefault();
    e.submitter.disabled = true;
    try {
      await callback();
      dlg.close();
      await refresh();
    } catch (err) {
      visibleError($("#formErr"), err);
    } finally {
      e.submitter.disabled = false;
    }
  };
}
function openCourse() {
  if (isTeacher()) {
    formDialog(
      "创建课程",
      '<label class="p-field">课程名称<input id="courseName" maxlength="80" required placeholder="例如 Python 程序设计"></label><label class="p-field">教学班<input id="className" maxlength="60" required placeholder="例如 计算机科学 1 班"></label>',
      "创建课程",
      async () => {
        const d = await request("/api/courses", {
          name: $("#courseName").value.trim(),
          className: $("#className").value.trim(),
        });
        selectedCourse = d.course.id;
      },
    );
  } else {
    formDialog(
      "加入课程",
      '<label class="p-field">课程邀请码<input id="invite" maxlength="32" required placeholder="输入任课教师分享的邀请码"></label>',
      "加入课程",
      async () => {
        const d = await request("/api/courses/join", {
          inviteCode: $("#invite").value.trim(),
        });
        selectedCourse = d.course.id;
      },
    );
  }
}
function courseList(list = courses) {
  if (!list.length)
    return (
      '<p class="blank">' +
      (isTeacher()
        ? "创建第一门课程后，就可以发讲义、组织签到和开启课堂。"
        : "输入教师分享的课程邀请码，或扫描课堂二维码开始学习。") +
      "</p>"
    );
  return (
    '<section class="course-list">' +
    list
      .map(
        (c, i) =>
          '<details class="course" ' +
          (c.id === selectedCourse || (!selectedCourse && i === 0)
            ? "open"
            : "") +
          "><summary><div><h3>" +
          esc(c.name) +
          '</h3><span class="p-muted">' +
          esc(c.className) +
          '</span></div><div class="course-meta">' +
          (c.roomCount ?? (c.rooms || []).length) +
          " 次课堂" +
          (isTeacher() ? " · " + (c.studentCount || 0) + " 位学生" : "") +
          '</div></summary><div class="inside">' +
          (isTeacher()
            ? '<div class="course-tools">' +
              lectureButton(c) +
              link(teachURL(c), "直接发起三问", "p-ghost") +
              '<span class="chip">邀请码 ' +
              esc(c.inviteCode) +
              '</span><button class="p-text copy-code" data-code="' +
              esc(c.inviteCode) +
              '">复制邀请码</button></div>'
            : "") +
          ((c.rooms || []).length
            ? (c.rooms || [])
                .map(
                  (r) =>
                    '<div class="room-row"><div><strong>' +
                    esc(r.topic) +
                    "</strong><small>" +
                    phase(r.phase) +
                    " · " +
                    esc(r.code) +
                    "</small></div>" +
                    (!isTeacher() &&
                    r.phase === "closed" &&
                    !(learning?.history || []).some((h) => h.code === r.code)
                      ? '<span class="p-muted">已结束</span>'
                      : link(
                          classroomURL(r),
                          isTeacher()
                            ? "课堂管理"
                            : r.phase === "closed"
                              ? "查看课堂"
                              : "进入课堂",
                          "p-ghost",
                        )) +
                    "</div>",
                )
                .join("")
            : '<p class="p-muted">这门课尚未发布课堂活动。</p>') +
          "</div></details>",
      )
      .join("") +
    "</section>"
  );
}
function bindCourses() {
  app
    .querySelectorAll("[data-lecture]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          openLecture(courses.find((c) => c.id === b.dataset.lecture))),
    );
  $("#courseAction")?.addEventListener("click", openCourse);
  document.querySelectorAll(".copy-code").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await navigator.clipboard.writeText(b.dataset.code);
          b.textContent = "已复制";
        } catch {
          b.textContent = b.dataset.code;
        }
      }),
  );
}
function home() {
  const recent = rooms(),
    active = recent.find((r) => r.phase !== "closed"),
    c = pickCourse();
  const name = isTeacher() ? "教师工作台" : "学生工作台";
  const feature = active
    ? {
        label: active.course.name + " · " + active.course.className,
        title: active.topic,
        description: phase(active.phase),
        action: link(
          classroomURL(active),
          isTeacher() ? "管理进行中的课堂" : "继续课堂",
        ),
      }
    : {
        label: isTeacher() ? "教学准备" : "课程学习",
        title: c
          ? c.name
          : isTeacher()
            ? "建立你的第一门课"
            : "加入你的第一门课",
        description: c
          ? c.className
          : isTeacher()
            ? "按教学班保存讲义、签到与课堂反馈。"
            : "使用教师的邀请码加入，课堂活动和复习记录会保存在这里。",
        action: c
          ? isTeacher()
            ? lectureButton(c)
            : link("#courses", "查看课程")
          : btn("courseAction", isTeacher() ? "创建课程" : "输入邀请码"),
      };
  $("#screen").innerHTML =
    heading(
      name,
      (user.displayName || user.username) + "，欢迎回来。",
      c ? courseAction() : "",
    ) +
    '<section class="home-feature"><div><span>' +
    esc(feature.label) +
    "</span><h2>" +
    esc(feature.title) +
    '</h2><p class="p-muted">' +
    esc(feature.description) +
    "</p>" +
    feature.action +
    '</div><img src="/assets/campus-optics.webp" alt=""></section><div class="section-top"><h2>我的课程</h2>' +
    link("#courses", "查看全部", "p-text") +
    "</div>" +
    courseList(courses.slice(0, 3));
  bindCourses();
}
function coursesPage() {
  $("#screen").innerHTML =
    heading(isTeacher() ? "课程与班级" : "我的课程", "", courseAction()) +
    courseList();
  bindCourses();
}
async function chart(el, labels, series) {
  if (!el?.isConnected) return;
  const v = viewVersion;
  try {
    const { mountBars } = await import("./assets/metrics.js");
    if (v !== viewVersion || !el.isConnected) return;
    disposers.push(mountBars(el, labels, series));
  } catch {
    el.textContent = "图表暂未载入，可查看本页的文字统计。";
  }
}
const key = (names) =>
  '<div class="chart-key">' +
  names
    .map(
      (n, i) =>
        '<span style="--c:' +
        ["#304ab6", "#ea865c", "#659a9e"][i] +
        '">' +
        esc(n) +
        "</span>",
    )
    .join("") +
  "</div>";
function totals(arr) {
  return (
    '<div class="summary-row">' +
    arr
      .map(([t, n]) => "<span><b>" + esc(n) + "</b>" + esc(t) + "</span>")
      .join("") +
    "</div>"
  );
}
function analytics() {
  const r = rooms().slice(0, 10),
    names = ["已加入", "已提交"];
  $("#screen").innerHTML =
    heading(
      "教学分析",
      "按课堂对照参与情况，打开课堂管理查看题目分布和教学建议。",
    ) +
    '<section class="panel"><h2>最近课堂参与</h2>' +
    totals([
      ["门课程", courses.length],
      ["次课堂", rooms().length],
      ["份首轮提交", rooms().reduce((a, b) => a + (b.submitted || 0), 0)],
    ]) +
    (r.length
      ? key(names) + '<div class="chart" id="chart"></div>'
      : '<p class="blank">发布课堂并收到学生参与后，图表会在这里呈现。</p>') +
    "</section>" +
    r
      .map(
        (x) =>
          '<div class="room-row"><div><strong>' +
          esc(x.topic) +
          "</strong><small>" +
          esc(x.course.name) +
          " · " +
          x.joined +
          " 人加入 / " +
          x.submitted +
          " 人提交</small></div>" +
          link(classroomURL(x), "分析课堂", "p-ghost") +
          "</div>",
      )
      .join("");
  if (r.length)
    chart(
      $("#chart"),
      r.map((x) => x.topic),
      [
        { name: names[0], data: r.map((x) => x.joined) },
        { name: names[1], data: r.map((x) => x.submitted) },
      ],
    );
}
function learningPage() {
  const l = learning || {},
    levels = l.levels || [],
    mistakes = l.mistakes || [],
    hist = l.history || [],
    s = l.summary || {};
  $("#screen").innerHTML =
    heading("复习与错题", "根据你已提交且教师已开放反馈的答卷安排复习。") +
    '<div class="two-col"><section class="panel"><h2>个人学习路径</h2>' +
    totals([
      ["次首轮提交", s.submitted || 0],
      ["项待复习", mistakes.filter((x) => !x.reviewed).length],
      ["次已复测", s.variantSubmitted || 0],
    ]) +
    (mistakes.length
      ? mistakes
          .map(
            (m, i) =>
              '<article class="task-row"><p class="p-muted">' +
              esc(m.courseName) +
              " / " +
              esc(m.topic) +
              " · " +
              esc(m.level) +
              "</p><h3>" +
              esc(m.misconception || m.prompt) +
              "</h3><details><summary>查看原题与复习依据</summary><p>" +
              esc(m.prompt) +
              "</p><p>你的选项：" +
              esc(m.options[m.selected]) +
              "　正确选项：" +
              esc(m.options[m.correct]) +
              "</p><p>" +
              esc(m.explanation) +
              '</p></details><div class="control-row"><button class="p-ghost" data-diagnose="' +
              i +
              '">分析这道错题</button><button class="p-ghost" data-review="' +
              i +
              '">' +
              (m.reviewed ? "已复习 · 撤销" : "标记已复习") +
              "</button>" +
              link("/join/" + m.code, "回到课堂", "p-text") +
              "</div></article>",
          )
          .join("")
      : '<p class="blank">目前没有待复习错题。</p>') +
    '</section><section class="panel"><h2>三层作答记录</h2>' +
    key(["答对", "作答"]) +
    '<div id="chart" class="chart"></div><p class="p-muted">' +
    levels
      .map((x) => esc(x.level) + " " + x.correct + " / " + x.total)
      .join("　") +
    '</p></section></div><div class="section-top"><h2>课堂历史</h2></div>' +
    hist
      .map(
        (h) =>
          '<div class="room-row"><div><strong>' +
          esc(h.topic) +
          "</strong><small>" +
          esc(h.courseName) +
          " · " +
          (h.submitted ? "已提交" : "已加入") +
          (h.retried ? " · 已复测" : "") +
          "</small></div>" +
          link("/join/" + h.code, "查看", "p-ghost") +
          "</div>",
      )
      .join("");
  app.querySelectorAll("[data-diagnose]").forEach(
    (b) =>
      (b.onclick = async () => {
        const m = mistakes[Number(b.dataset.diagnose)];
        b.disabled = true;
        b.textContent = "分析中…";
        try {
          const d = await request("/api/learning/diagnose", {
            code: m.code,
            questionIndex: m.questionIndex,
            isVariant: m.isVariant,
          });
          if (!b.isConnected) return;
          const detail = document.createElement("div");
          detail.className = "node-detail";
          detail.innerHTML =
            "<strong>" +
            esc(d.mode) +
            "</strong><p>可能的原因：" +
            esc(d.possibleCause) +
            "</p><p>下一步：" +
            esc(d.nextStep) +
            "</p>" +
            (m.topic === "递归出口与调用栈"
              ? link("#lab", "在实验室验证", "p-text")
              : "");
          b.closest(".task-row").append(detail);
          b.textContent = "已分析";
        } catch (e) {
          b.disabled = false;
          b.textContent = "重试错因分析";
          alert(e.message);
        }
      }),
  );
  app.querySelectorAll("[data-review]").forEach(
    (b) =>
      (b.onclick = async () => {
        const m = mistakes[Number(b.dataset.review)];
        b.disabled = true;
        try {
          await request("/api/learning/review", {
            code: m.code,
            questionIndex: m.questionIndex,
            isVariant: m.isVariant,
            done: !m.reviewed,
          });
          await refresh();
        } catch (e) {
          b.disabled = false;
          alert(e.message);
        }
      }),
  );
  if (levels.some((x) => x.total))
    chart(
      $("#chart"),
      levels.map((x) => x.level),
      [
        { name: "答对", data: levels.map((x) => x.correct) },
        { name: "作答", data: levels.map((x) => x.total) },
      ],
    );
  else $("#chart").outerHTML = '<p class="blank">尚无可展示的作答证据。</p>';
}
async function roomPage(code) {
  const record = rooms().find((x) => x.code === code);
  if (!record) {
    $("#screen").innerHTML =
      heading("未找到该课堂") + link("#courses", "回到我的课程");
    return;
  }
  const host = $("#screen");
  host.innerHTML =
    heading(
      record.topic,
      record.course.name + " / " + record.course.className,
      '<div class="control-row">' +
        btn("joinThisRoom", "邀请学生", "p-ghost") +
        (record.phase === "lecture"
          ? link(lectureSetupURL(record), "编排随堂三问")
          : link(teachURL(record.course, code), "打开诊断大屏")) +
        "</div>",
    ) +
    '<div class="module-tabs">' +
    [
      ["analysis", "课堂诊断"],
      ["copilot", "课件与副驾驶"],
      ["attendance", "课堂签到"],
    ]
      .map(
        ([k, v]) =>
          '<button class="' +
          (k === roomTab ? "on" : "") +
          '" data-tab="' +
          k +
          '">' +
          v +
          "</button>",
      )
      .join("") +
    '</div><div id="roomPane"></div>';
  $("#joinThisRoom").onclick = () => showJoin(record);
  host.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        roomTab = b.dataset.tab;
        render();
      }),
  );
  const el = $("#roomPane"),
    version = viewVersion;
  try {
    if (roomTab === "copilot") {
      const m = await import("./copilot.js");
      if (!el.isConnected) return;
      const d = await m.mountCopilot(el, code, record.teacherToken, {
        onCreateQuiz: (page) => {
          const ref = crypto.randomUUID?.() || Date.now().toString(36);
          const item = {
            title: String(page.title || record.topic).slice(0, 100),
            material: String(page.material || "").slice(0, 6000),
            pageNumber: page.pageNumber,
          };
          try {
            sessionStorage.setItem(
              "edumind.slide." + user.id + "." + record.course.id + "." + ref,
              JSON.stringify(item),
            );
            location.href =
              "/teach?course=" +
              encodeURIComponent(record.course.id) +
              (record.phase === "lecture"
                ? "&lecture=" + encodeURIComponent(record.code)
                : "") +
              "&slide=" +
              encodeURIComponent(ref) +
              "#setup";
          } catch {
            alert("当前浏览器无法保存备题资料，请使用文本讲义导入。");
          }
        },
      });
      if (typeof d === "function") {
        if (!el.isConnected) d();
        else disposers.push(d);
      } else if (d?.dispose) disposers.push(() => d.dispose());
      return;
    }
    if (roomTab === "attendance") {
      const m = await import("./attendance.js");
      if (!el.isConnected) return;
      const d = await m.mountAttendance(el, code, {
        role: "teacher",
        teacherToken: record.teacherToken,
      });
      if (typeof d === "function") {
        if (!el.isConnected) d();
        else disposers.push(d);
      } else if (d?.dispose) disposers.push(() => d.dispose());
      return;
    }
    let running = false,
      last = "",
      disposeChart;
    const update = async () => {
      if (running || version !== viewVersion) return;
      running = true;
      try {
        const s = await request("/api/rooms/" + code + "/stats", undefined, {
          Authorization: "Bearer " + record.teacherToken,
        });
        if (version !== viewVersion) return;
        const sig = JSON.stringify(s);
        if (sig === last) return;
        last = sig;
        if (!s.questions?.length) {
          el.innerHTML =
            '<section class="panel"><h2>' +
            esc(phase(s.phase)) +
            '</h2><p class="p-muted">本节已加入 ' +
            s.joined +
            " 人。" +
            (s.phase === "lecture"
              ? "发布三问后，这里将显示作答分布。"
              : "本节课没有发布诊断题。") +
            "</p>" +
            (s.phase === "lecture"
              ? btn("closeLecture", "结束本节授课", "p-ghost")
              : "") +
            "</section>";
          if ($("#closeLecture"))
            $("#closeLecture").onclick = () =>
              formDialog(
                "结束本节授课？",
                "<p>学生将停止加入本节课，已保存的课件和签到仍可查阅。</p>",
                "结束授课",
                async () => {
                  await request(
                    "/api/rooms/" + code + "/close",
                    {},
                    { Authorization: "Bearer " + record.teacherToken },
                  );
                },
              );
          return;
        }
        const ws = s.questions
            .flatMap((q, i) =>
              q.counts
                .map((n, j) => ({ q, i, j, n }))
                .filter((x) => x.n && x.j !== q.correct),
            )
            .sort((a, b) => b.n - a.n),
          w = ws[0];
        disposeChart?.();
        el.innerHTML =
          '<div class="two-col"><section class="panel"><h2>课堂参与</h2>' +
          totals([
            ["人加入", s.joined],
            ["人提交", s.submitted],
            ["人待提交", s.pending],
          ]) +
          '<h3>下一步讲什么</h3><p class="p-muted">' +
          (w
            ? esc(
                "第 " +
                  (w.i + 1) +
                  " 问，" +
                  w.n +
                  " 人选择「" +
                  w.q.options[w.j] +
                  "」。" +
                  (w.q.misconceptions[w.j] || "请核对这一步。"),
              )
            : s.submitted
              ? "本轮已交答卷均答对。"
              : "等待本堂第一份作答。") +
          "</p>" +
          (w ? '<p class="notice">' + esc(w.q.explanation) + "</p>" : "") +
          link(
            teachURL(record.course, code),
            "在大屏讲解并推送变式",
            "p-text",
          ) +
          '</section><section class="panel"><h2>三层诊断</h2>' +
          key(["答对人数", "作答人数"]) +
          '<div class="chart" id="roomChart"></div><p class="p-muted">' +
          s.questions
            .map((q) => esc(q.level) + " " + q.right + "/" + s.submitted)
            .join("　") +
          "</p></section></div>";
        const { mountBars } = await import("./assets/metrics.js");
        if (version === viewVersion && $("#roomChart"))
          disposeChart = mountBars(
            $("#roomChart"),
            s.questions.map((q) => q.level),
            [
              { name: "答对人数", data: s.questions.map((q) => q.right) },
              { name: "作答人数", data: s.questions.map(() => s.submitted) },
            ],
          );
      } catch (e) {
        if (version === viewVersion) {
          last = "";
          el.textContent = "连接待恢复：" + e.message;
        }
      } finally {
        running = false;
      }
    };
    await update();
    if (version !== viewVersion) {
      disposeChart?.();
      return;
    }
    const timer = setInterval(update, 3500);
    disposers.push(() => {
      clearInterval(timer);
      disposeChart?.();
    });
  } catch (e) {
    if (el.isConnected) el.textContent = "模块未能载入：" + e.message;
  }
}
async function graphPage() {
  const c = pickCourse(),
    version = viewVersion;
  $("#screen").innerHTML =
    heading("知识图谱", "选择节点，查看概念之间的关系与课堂作答依据。") +
    '<div class="control-row">' +
    (c
      ? '<label>课程 <select id="graphCourse" class="p-select">' +
        courses
          .map(
            (k) =>
              '<option value="' +
              esc(k.id) +
              '" ' +
              (c.id === k.id ? "selected" : "") +
              ">" +
              esc(k.name + " / " + k.className) +
              "</option>",
          )
          .join("") +
        "</select></label>"
      : '<span class="chip">示例课程 · Python 程序设计</span>') +
    '</div><div id="graphResult" aria-live="polite">正在读取课程节点…</div>';
  if (c)
    $("#graphCourse").onchange = (e) => {
      selectedCourse = e.target.value;
      render();
    };
  let data;
  if (c) {
    try {
      data = await request(
        "/api/knowledge?courseId=" + encodeURIComponent(c.id),
      );
    } catch (e) {
      if (version === viewVersion) $("#graphResult").textContent = e.message;
      return;
    }
  } else {
    const defs = [
      ["call", "函数调用", "函数保存参数与执行位置。"],
      ["base", "递归出口", "最小输入直接返回。"],
      ["stack", "调用栈", "子调用完成后，恢复上一层。"],
      ["return", "逐层返回", "用子调用的结果完成上一层计算。"],
    ];
    data = {
      nodes: defs.map(([id, label, description]) => ({
        id,
        label,
        description,
        status: "示例节点",
        examples: [],
        rounds: 0,
        attempts: 0,
        right: 0,
      })),
      edges: [
        ["call", "base"],
        ["call", "stack"],
        ["base", "return"],
        ["stack", "return"],
      ],
    };
  }
  if (version !== viewVersion) return;
  const all = data.nodes || [],
    edges = data.edges || [],
    palette = {
      尚无作答证据: "#aeb8c8",
      仅有一轮记录: "#8ea7d5",
      建议优先复习: "#e98a67",
      建议再练一次: "#ecc56e",
      多轮答对较稳定: "#68af9d",
    };
  const direct = all.slice(0, 14),
    coords = [
      [-2.3, 0.1, 0],
      [-1.3, 0.6, -0.15],
      [-0.35, 1.38, 0.1],
      [-0.3, -0.55, 0.3],
      [1.05, 0.47, 0.2],
      [2.3, -0.23, -0.1],
    ];
  const drawNodes = direct.map((n, i) => ({
    ...n,
    color: palette[n.status] || "#8f9fc2",
    position:
      direct.length <= 6
        ? coords[i]
        : i === 0
          ? [0, 0, 0]
          : [
              2.4 * Math.cos((2 * Math.PI * (i - 1)) / (direct.length - 1)),
              1.4 * Math.sin((2 * Math.PI * (i - 1)) / (direct.length - 1)),
              ((i % 3) - 1) * 0.8,
            ],
  }));
  const sceneEdges = edges
    .map((pair) => pair.map((id) => direct.findIndex((n) => n.id === id)))
    .filter(([a, b]) => a >= 0 && b >= 0);
  $("#graphResult").innerHTML =
    '<div class="space-view" id="space"></div><p class="p-muted">拖动旋转，滚轮缩放。' +
    (all.length > 14 ? "场景展示前 14 个节点，完整列表见下方。" : "") +
    '</p><div class="node-key">' +
    all
      .map(
        (n, i) =>
          '<button type="button" data-node="' +
          i +
          '">' +
          esc(n.label) +
          "</button>",
      )
      .join("") +
    '</div><div class="node-detail" id="nodeDetail"></div>';
  function select(i) {
    const n = all[i];
    if (!n) return;
    const linked = edges
      .filter((pair) => pair.includes(n.id))
      .map(
        (pair) =>
          all.find((x) => x.id === pair.find((id) => id !== n.id))?.label,
      )
      .filter(Boolean);
    $("#nodeDetail").innerHTML =
      "<h3>" +
      esc(n.label) +
      "</h3><p>" +
      esc(n.description) +
      "</p><p><b>" +
      esc(n.status) +
      "</b>" +
      (n.attempts
        ? " · " +
          n.rounds +
          " 轮课堂作答，" +
          n.right +
          " / " +
          n.attempts +
          " 次答对"
        : "") +
      "</p>" +
      (linked.length ? "<p>相连节点：" + esc(linked.join("、")) + "</p>" : "") +
      (n.examples || [])
        .map(
          (e) =>
            "<details><summary>" +
            esc(e.topic) +
            " · " +
            (e.variant ? "复测" : "首轮") +
            " · " +
            e.right +
            "/" +
            e.total +
            "</summary><p>" +
            esc(e.prompt) +
            "</p></details>",
        )
        .join("") +
      (!isTeacher() && n.attempts > n.right
        ? link("#learning", "查看相关错题与复习任务", "p-text")
        : "");
    app
      .querySelectorAll("[data-node]")
      .forEach((b, j) => b.classList.toggle("on", j === i));
  }
  app
    .querySelectorAll("[data-node]")
    .forEach((b) => (b.onclick = () => select(Number(b.dataset.node))));
  select(0);
  mountLearningSpace(drawNodes, sceneEdges, select, false);
}
async function mountLearningSpace(nodes, edges, onSelect, stack) {
  const host = $("#space"),
    v = viewVersion;
  try {
    const { mountSpace } = await import("./assets/model.js");
    if (v !== viewVersion || !host.isConnected) return;
    const end = mountSpace(host, { nodes, edges, onSelect, stack });
    if (end) {
      disposers.push(end);
      return;
    }
  } catch {}
  if (host?.isConnected)
    host.innerHTML =
      '<div class="fallback-scene"><strong>' +
      (stack ? "栈内数值（栈底到栈顶）" : "节点关系") +
      "</strong><p>" +
      esc(
        stack
          ? nodes.map((n) => n.label).join(" → ") || "空栈"
          : edges
              .map(([a, b]) => nodes[a].label + " → " + nodes[b].label)
              .join("　"),
      ) +
      "</p></div>";
}
function labKey() {
  return "edumind.lab." + user.id;
}
function loadLab() {
  if (labState) return;
  try {
    const stored = JSON.parse(sessionStorage.getItem(labKey()));
    if (
      Array.isArray(stored?.stack) &&
      stored.stack.length <= 6 &&
      stored.stack.every(Number.isFinite) &&
      Array.isArray(stored.log) &&
      stored.log.every((x) => typeof x === "string")
    )
      labState = stored;
  } catch {}
  labState ??= { stack: [], log: [] };
}
function labPage() {
  loadLab();
  const st = labState;
  const completed = st.log
    .join(",")
    .includes("压入 3,压入 2,压入 1,弹出 1,弹出 2,弹出 3");
  $("#screen").innerHTML =
    heading(
      "虚拟实验室",
      "数据结构实验 · 在三维空间操作栈，验证后进先出顺序。",
    ) +
    '<div class="two-col"><section><div class="space-view" id="space"></div><div class="lab-note"><span>从栈底到栈顶</span><b>' +
    esc(st.stack.join(" → ") || "空栈") +
    '</b></div><div class="control-row"><label>数值 <input id="stackInput" type="number" min="-99" max="99" step="1" value="3" aria-label="入栈数值" style="width:70px;padding:8px"></label>' +
    btn("push", "入栈") +
    btn("pop", "出栈", "p-ghost") +
    btn("reset", "重置实验", "p-text") +
    '</div><p role="status" class="err" id="labErr"></p></section><section class="panel"><h2>验证栈的返回顺序</h2><p>依次压入 3、2、1，再逐个弹出，观察每一步的栈顶。</p><p class="notice">' +
    (completed
      ? "已完成：弹出顺序为 1、2、3。"
      : "任务进行中 · 当前栈深 " + st.stack.length + " / 6") +
    "</p><h3>你的操作记录</h3>" +
    (st.log.length
      ? "<ol>" +
        st.log
          .slice(-8)
          .map((x) => "<li>" + esc(x) + "</li>")
          .join("") +
        "</ol>"
      : '<p class="p-muted">入栈后会记录第一步。</p>') +
    '</section></div><details class="panel" style="margin-top:22px"><summary>对照实验 · Python 递归调用栈</summary><edu-stack></edu-stack></details>';
  function update(op, n) {
    if (op === "push") st.stack.push(n);
    if (op === "pop") st.stack.pop();
    if (op === "reset") {
      st.stack = [];
      st.log = [];
    } else st.log.push((op === "push" ? "压入 " : "弹出 ") + n);
    st.log = st.log.slice(-120);
    try {
      sessionStorage.setItem(labKey(), JSON.stringify(st));
    } catch {}
    render();
  }
  $("#push").onclick = () => {
    const f = $("#stackInput"),
      v = f.valueAsNumber;
    if (!f.value || !Number.isInteger(v) || v < -99 || v > 99) {
      $("#labErr").textContent = "请输入 −99 到 99 的整数。";
      return;
    }
    if (st.stack.length >= 6) {
      $("#labErr").textContent = "栈已满，请先弹出一个元素。";
      return;
    }
    update("push", v);
  };
  $("#pop").onclick = () => {
    if (!st.stack.length) {
      $("#labErr").textContent = "空栈没有可弹出的元素。";
      return;
    }
    update("pop", st.stack.at(-1));
  };
  $("#reset").onclick = () => update("reset");
  mountLearningSpace(
    st.stack.map((n, i) => ({
      label: String(n),
      color: i === st.stack.length - 1 ? "#ee9873" : "#7996e2",
      position: [0, -1.24 + i * 0.45, 0],
    })),
    [],
    (i) => {
      $("#labErr").textContent = "第 " + (i + 1) + " 层 · 数值 " + st.stack[i];
    },
    true,
  );
}
window.addEventListener("hashchange", () => {
  if (user) render();
});
(async () => {
  try {
    user = (await request("/api/auth/me")).user;
    if (user) {
      if (
        safeNext &&
        ((next.startsWith("/join/") && !isTeacher()) ||
          (next.startsWith("/teach") && isTeacher()))
      ) {
        location.replace(next);
        return;
      }
      await refresh();
    } else auth();
  } catch (e) {
    app.innerHTML =
      '<div class="page-loading"><p>' +
      esc(e.message) +
      "</p>" +
      btn("retry", "重新连接") +
      "</div>";
    $("#retry").onclick = () => location.reload();
  }
})();
