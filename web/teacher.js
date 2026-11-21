import { icon } from "./icons.js";
import { createBoardViews } from "./board-design.js";
import { qrURL } from "./assets/qr.js";

const $ = (s) => document.querySelector(s);
const app = $("#app"),
  dialog = $("#dialog");
const safe = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const read = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem("sanwen." + k)) ?? d;
  } catch {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem("sanwen." + k, JSON.stringify(v));
  } catch {}
};
const levels = ["基础理解", "误区辨别", "迁移应用"],
  goals = ["核心概念掌握了吗？", "容易错在哪里？", "换个情境还能用吗？"];
const letter = (i) => "ABCD"[i];
const btn = (id, cls, name, label) =>
  '<button id="' +
  id +
  '" class="' +
  cls +
  '">' +
  icon(name) +
  safe(label) +
  "</button>";
let room = read("room", null),
  draft = read("draft", null),
  feedback = read("feedback", false),
  stats = null,
  current = "",
  editIndex = 0,
  selected = null,
  setupDirty = false;
let liveModel = null,
  sceneVersion = 0,
  pollTimer,
  fetching = false,
  networkError = "",
  lastSig = "",
  toastTimer,
  busy = false,
  boardRequest = 0;
const initialView =
  room && location.hash !== "#setup"
    ? "board"
    : location.hash === "#board"
      ? "board"
      : "setup";
async function api(url, { method = "GET", body, token, timeout = 17000 } = {}) {
  const ctrl = new AbortController(),
    timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(data.error || "请求失败，请重试");
      e.status = r.status;
      throw e;
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError" || e instanceof TypeError)
      throw new Error("连接中断，请检查网络后重试");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
const roomAPI = (action, body) =>
  api("/api/rooms/" + encodeURIComponent(room.code) + "/" + action, {
    token: room.teacherToken,
    ...(body ? { method: "POST", body } : {}),
  });
function notify(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3600);
}
function showDialog(html) {
  $("#dialogBody").innerHTML = html;
  if (!dialog.open) dialog.showModal();
  $("#dialogClose")?.setAttribute("aria-label", "关闭");
  $("#dialogClose")?.addEventListener("click", () => dialog.close());
}
function modalTitle(title, sub = "") {
  return (
    '<div class="modal-head"><div><h2>' +
    safe(title) +
    "</h2>" +
    (sub ? "<p>" + safe(sub) + "</p>" : "") +
    "</div>" +
    btn("dialogClose", "icon-btn", "close", "") +
    "</div>"
  );
}
dialog.addEventListener("click", (e) => {
  if (
    e.target === dialog &&
    !(
      e.clientX >= dialog.getBoundingClientRect().left &&
      e.clientX <= dialog.getBoundingClientRect().right &&
      e.clientY >= dialog.getBoundingClientRect().top &&
      e.clientY <= dialog.getBoundingClientRect().bottom
    )
  )
    dialog.close();
});
function resetScene() {
  sceneVersion++;
  liveModel?.destroy();
  liveModel = null;
}
async function model(rates) {
  const host = $(".model-host");
  if (!host) return;
  const ver = sceneVersion;
  try {
    const mod = await import("./assets/model.js");
    if (ver !== sceneVersion || !host.isConnected) return;
    liveModel = mod.mountModel(host, rates);
    if (!liveModel) {
      host.removeAttribute("tabindex");
      host.parentElement?.classList.add("poster-only");
    }
  } catch {
    host.parentElement?.classList.add("poster-only");
  }
}
function stage(mode = "scale") {
  return (
    '<div class="model-stage ' +
    mode +
    '"><div class="model-floor"></div><div class="model-poster"></div><div class="model-host" tabindex="0" role="img" aria-label="' +
    (mode === "scale" ? "可旋转的立体等式天平" : "三层答对比例的立体柱形图") +
    '，左右方向键旋转"></div><span class="model-caption">' +
    icon("rotate", 15) +
    "拖动旋转</span></div>"
  );
}
function tabs(view) {
  current = view;
  document.body.dataset.view = view;
  $("#setupTab").classList.toggle("active", view === "setup");
  $("#boardTab").classList.toggle("active", view === "board");
  for (const [id, key] of [
    ["#setupTab", "setup"],
    ["#boardTab", "board"],
  ])
    $(id).setAttribute("aria-current", view === key ? "page" : "false");
}
function changeView(view) {
  if (busy) return;
  if (current === "setup" && setupDirty && view === "setup") return;
  location.hash = view;
  if (current !== view) navigate(view);
}
function navigate(view) {
  clearTimeout(pollTimer);
  boardRequest++;
  fetching = false;
  resetScene();
  lastSig = "";
  tabs(view);
  if (view === "setup") renderSetup();
  else renderBoardShell();
}
$("#setupTab").innerHTML = icon("layers") + "发起课堂";
$("#boardTab").innerHTML = icon("board") + "诊断大屏";
$("#setupTab").onclick = () => changeView("setup");
$("#boardTab").onclick = () => changeView("board");
window.addEventListener("hashchange", () => {
  const v = location.hash === "#board" ? "board" : "setup";
  if (v !== current && draft) navigate(v);
});
$("#help").innerHTML = icon("help") + "<span>使用指南</span>";
$(".role").innerHTML = icon("screen", 16) + "教师端";
$("#help").onclick = () =>
  showDialog(
    modalTitle("课堂使用指南") +
      '<div class="guide">' +
      [
        "选择学科、年级并输入刚讲完的知识点。生成题目后，逐题核对选项、答案和误区。",
        "确认发布，将二维码投到大屏。学生扫码匿名作答，大屏按真实提交更新。",
        "点击一个集中的错误选项，和学生讨论解题依据。审核巩固题后推送，查看同批学生的两轮表现。",
      ]
        .map((t, i) => "<div><b>" + (i + 1) + "</b><p>" + t + "</p></div>")
        .join("") +
      "</div>",
  );
function workspaceCrumb(label, extra = "") {
  return (
    '<div class="context"><span>' +
    icon("grid", 15) +
    "教学工作台 " +
    icon("chev", 13) +
    " <strong>" +
    label +
    "</strong></span><span>" +
    extra +
    "</span></div>"
  );
}
function setupHero() {
  return (
    '<aside class="book-cover"><div class="cover-top"><span>' +
    icon("book", 17) +
    "随堂讲义</span><span>" +
    safe(draft.grade) +
    " / " +
    safe(draft.subject) +
    "</span></div><h1>" +
    (draft.topic === "一元一次方程的移项"
      ? '<span class="book-line">一元一次方程</span><span class="book-line">的移项</span>'
      : safe(draft.topic)) +
    '</h1><div class="cover-art" id="coverArt"><img class="cover-photo" src="/assets/lesson-cover.webp" alt="木尺、色块与球组成的平衡教具"></div><div class="cover-bottom"><span>三层理解诊断</span><button type="button" id="coverModel">' +
    icon("rotate", 16) +
    "旋转教具</button></div></aside>"
  );
}
const subjectList = [
  "数学",
  "语文",
  "英语",
  "物理",
  "化学",
  "生物",
  "历史",
  "地理",
  "道德与法治",
  "科学",
  "信息科技",
  "其他学科",
];
const grades = [
  "一年级",
  "二年级",
  "三年级",
  "四年级",
  "五年级",
  "六年级",
  "七年级",
  "八年级",
  "九年级",
  "高一",
  "高二",
  "高三",
  "大学",
];
function optionList(list, current) {
  return [...new Set([...list, current])]
    .map(
      (x) =>
        "<option" +
        (x === current ? " selected" : "") +
        ">" +
        safe(x) +
        "</option>",
    )
    .join("");
}
function renderSetup() {
  if (!draft) return;
  setupDirty = false;
  app.innerHTML =
    '<div class="studio-spread">' +
    setupHero() +
    '<div class="work-sheet"><div class="sheet-intro"><div><span class="sheet-overline">教师工作台</span><h2>编排随堂三问</h2></div><button class="quiet" id="sample">' +
    icon("book", 16) +
    "载入示例</button></div>" +
    '<section class="config"><form id="topicForm"><label>学科<select id="subject">' +
    optionList(subjectList, draft.subject) +
    '</select></label><label>年级<select id="grade">' +
    optionList(grades, draft.grade) +
    '</select></label><label class="topic-label">知识点<input id="topic" maxlength="100" required value="' +
    safe(draft.topic) +
    '" placeholder="刚讲完的知识点"></label><button class="gen-btn" type="submit" id="generate">' +
    icon("spark", 16) +
    "生成三问</button></form></section>" +
    '<section class="questions-region"><div class="review-heading"><h3>题目审核</h3><span>' +
    safe(draft.source) +
    '</span></div><div class="proofs">' +
    draft.questions.map((q, i) => questionCard(q, i)).join("") +
    "</div></section>" +
    '<section class="publish-row"><label class="feedback-label"><input type="checkbox" id="feedback" ' +
    (feedback ? "checked" : "") +
    '><span class="switch"></span><span>向学生展示解析</span></label><div><span id="publishNote" class="publish-note" role="status"></span>' +
    btn("publish", "primary", "play", "确认并开始课堂") +
    "</div></section></div></div>";
  $("#coverModel").onclick = () => {
    const el = $("#coverArt"),
      active = !!el.querySelector(".model-stage");
    resetScene();
    el.innerHTML = active
      ? '<img class="cover-photo" src="/assets/lesson-cover.webp" alt="木尺、色块与球组成的平衡教具">'
      : stage();
    $("#coverModel").innerHTML =
      icon(active ? "rotate" : "book", 16) + (active ? "旋转教具" : "返回封面");
    if (!active) model(null);
  };
  $("#topicForm").oninput = () => {
    setupDirty =
      $("#topic").value.trim() !== draft.topic ||
      $("#subject").value !== draft.subject ||
      $("#grade").value !== draft.grade;
    $("#publish").disabled = setupDirty;
    $("#publishNote").textContent = setupDirty
      ? "主题已修改，请重新生成三问"
      : "";
  };
  $("#topicForm").onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const input = {
      subject: $("#subject").value,
      grade: $("#grade").value,
      topic: $("#topic").value.trim(),
    };
    if (!input.topic) {
      $("#topic").focus();
      return;
    }
    busy = true;
    $("#generate").disabled = true;
    $("#publish").disabled = true;
    $("#generate").textContent = "正在生成…";
    try {
      const d = await api("/api/generate", {
        method: "POST",
        body: input,
        timeout: 45000,
      });
      applyDraft(d);
      notify(
        d.source.includes("预置")
          ? "已载入数学示例，请核对课堂主题"
          : "题目已生成，可以逐题审核",
      );
    } catch (e) {
      notify(e.message);
    } finally {
      busy = false;
      if ($("#generate")) {
        $("#generate").disabled = false;
        $("#generate").innerHTML = icon("spark") + "生成三问";
        $("#publish").disabled = setupDirty;
      }
    }
  };
  $("#sample").onclick = () => {
    if (busy) return;
    const load = async () => {
      try {
        applyDraft(await api("/api/sample"));
        notify("已载入七年级数学示例");
      } catch (e) {
        notify(e.message);
      }
    };
    if (read("edited", false)) {
      confirmAction(
        "载入示例题目？",
        "当前草稿中的题目将替换为七年级数学示例。",
        "载入示例",
        load,
      );
    } else load();
  };
  $("#feedback").onchange = (e) => {
    feedback = e.target.checked;
    save("feedback", feedback);
  };
  app
    .querySelectorAll("[data-edit]")
    .forEach((b) => (b.onclick = () => editor(Number(b.dataset.edit))));
  $("#publish").onclick = () => {
    if (busy || setupDirty) return;
    if (room && stats?.phase !== "closed") {
      confirmAction(
        "创建另一间课堂？",
        "原课堂继续收集作答。你可以从本机的课堂列表回到原课堂。",
        "创建新课堂",
        publish,
      );
    } else publish();
  };
}
function applyDraft(d) {
  draft = d;
  save("draft", d);
  save("edited", false);
  resetScene();
  renderSetup();
}
function questionCard(q, i) {
  return (
    '<article class="proof proof-' +
    i +
    '"><div class="proof-no" aria-label="第 ' +
    (i + 1) +
    ' 问">0' +
    (i + 1) +
    '</div><div class="proof-copy"><h4>' +
    levels[i] +
    "</h4><p>" +
    safe(q.prompt) +
    "</p><small>参考答案 <b>" +
    letter(q.correct) +
    "</b> " +
    safe(q.options[q.correct]) +
    '</small></div><button class="proof-edit" data-edit="' +
    i +
    '" aria-label="审核编辑第 ' +
    (i + 1) +
    ' 问">' +
    icon("pencil", 18) +
    "<span>编辑</span></button></article>"
  );
}
function confirmAction(title, text, label, action) {
  showDialog(
    modalTitle(title) +
      '<p class="confirm-text">' +
      safe(text) +
      '</p><div class="modal-actions"><button class="outline" id="cancelAction">取消</button><button class="primary" id="okAction">' +
      safe(label) +
      "</button></div>",
  );
  $("#cancelAction").onclick = () => dialog.close();
  $("#okAction").onclick = () => {
    dialog.close();
    action();
  };
}
function formFields(q) {
  return (
    '<label class="field">题干<textarea id="qPrompt" required maxlength="800">' +
    safe(q.prompt) +
    '</textarea></label><div class="field">选项与正确答案<small>选中圆点设置正确答案</small></div><div class="option-edit">' +
    q.options
      .map(
        (v, j) =>
          '<div><label class="radio-letter"><input type="radio" name="correct" value="' +
          j +
          '" ' +
          (q.correct === j ? "checked" : "") +
          ">" +
          letter(j) +
          '</label><input aria-label="选项 ' +
          letter(j) +
          '" class="opt" required maxlength="320" value="' +
          safe(v) +
          '"></div>',
      )
      .join("") +
    '</div><label class="field">讲解要点<textarea required id="explanation" maxlength="1000">' +
    safe(q.explanation) +
    '</textarea></label><details class="mis-edit"><summary>选项对应误区</summary>' +
    q.options
      .map(
        (_, j) =>
          "<label>" +
          letter(j) +
          '<input class="mis" maxlength="400" placeholder="可选，填写该选项反映的误解" value="' +
          safe(q.misconceptions?.[j]) +
          '"></label>',
      )
      .join("") +
    "</details>"
  );
}
function collectQuestion(q) {
  return {
    ...q,
    prompt: $("#qPrompt").value.trim(),
    options: [...dialog.querySelectorAll(".opt")].map((e) => e.value.trim()),
    correct: Number(dialog.querySelector("input[name=correct]:checked").value),
    explanation: $("#explanation").value.trim(),
    misconceptions: [...dialog.querySelectorAll(".mis")].map((e) =>
      e.value.trim(),
    ),
  };
}
function editor(i) {
  if (busy) return;
  editIndex = i;
  const q = draft.questions[i];
  showDialog(
    modalTitle("审核第 " + (i + 1) + " 问", levels[i] + " · " + goals[i]) +
      '<form id="editForm">' +
      formFields(q) +
      '<div class="modal-actions"><button type="button" class="outline" id="cancelEdit">取消</button><button class="primary" type="submit">保存题目</button></div></form>',
  );
  $("#dialogClose").setAttribute("aria-label", "关闭");
  $("#cancelEdit").onclick = () => dialog.close();
  $("#editForm").onsubmit = (e) => {
    e.preventDefault();
    const q2 = collectQuestion(q);
    if (!validQ(q2)) return;
    draft.questions[editIndex] = q2;
    save("draft", draft);
    save("edited", true);
    dialog.close();
    resetScene();
    renderSetup();
    notify("题目已保存");
  };
}
function validQ(q) {
  if (
    !q.prompt ||
    !q.explanation ||
    q.options.some((v) => !v) ||
    new Set(q.options).size !== 4
  ) {
    notify("请填写题干、解析和四个不同的选项");
    return false;
  }
  return true;
}
function rememberRoom() {
  const list = read("rooms", []);
  save(
    "rooms",
    [
      { ...room, topic: draft.topic },
      ...list.filter((x) => x.code !== room.code),
    ].slice(0, 30),
  );
  save("room", room);
}
async function publish() {
  if (busy) return;
  busy = true;
  $("#publish").disabled = true;
  $("#publish").textContent = "正在发布…";
  try {
    room = await api("/api/rooms", {
      method: "POST",
      body: { draft, feedback },
    });
    rememberRoom();
    stats = null;
    selected = null;
    networkError = "";
    busy = false;
    changeView("board");
  } catch (e) {
    notify(e.message);
    $("#publish").disabled = false;
    $("#publish").innerHTML = icon("play") + "确认题目，开始课堂";
  } finally {
    busy = false;
  }
}
function emptyStats() {
  return {
    code: "",
    topic: draft.topic,
    subject: draft.subject,
    grade: draft.grade,
    phase: "preview",
    joined: 0,
    submitted: 0,
    pending: 0,
    questions: draft.questions.map((q) => ({
      ...q,
      counts: [0, 0, 0, 0],
      right: 0,
    })),
    variants: draft.variants,
    variantIndex: null,
    variantSubmitted: 0,
    variantRight: 0,
  };
}
function wrongs(s) {
  return s.questions
    .flatMap((q, i) =>
      q.counts
        .map((n, j) => ({ i, j, n }))
        .filter((w) => w.n > 0 && w.j !== q.correct),
    )
    .sort((a, b) => b.n - a.n || a.i - b.i || a.j - b.j);
}
function choose(s) {
  const ws = wrongs(s);
  return (
    ws.find((w) => selected && w.i === selected.i && w.j === selected.j) ||
    ws[0]
  );
}
function boardTop() {
  return workspaceCrumb(
    "诊断大屏",
    '<button class="quiet" id="rooms">本机课堂</button><button class="quiet" id="expand">' +
      icon("expand", 15) +
      "投屏模式</button>",
  );
}
function renderBoardShell() {
  app.innerHTML =
    boardTop() +
    '<div id="connection" role="status"></div><div id="boardMain"></div>';
  $("#rooms").onclick = showRooms;
  $("#expand").onclick = async () => {
    try {
      if (!document.fullscreenElement)
        await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      document.body.classList.toggle("projecting");
    }
  };
  if (!room) {
    paintBoard(emptyStats(), true);
    return;
  }
  if (stats?.code === room.code) paintBoard(stats, true);
  else $("#boardMain").innerHTML = '<div class="loading">正在读取课堂…</div>';
  poll();
}
function showRooms() {
  const list = read("rooms", []);
  showDialog(
    modalTitle("本机课堂", "此浏览器创建的最近课堂") +
      (list.length
        ? list
            .map(
              (r, i) =>
                '<button class="room-select" data-room="' +
                i +
                '"><b>' +
                safe(r.topic) +
                "</b><span>课堂码 " +
                safe(r.code) +
                " " +
                icon("chev", 16) +
                "</span></button>",
            )
            .join("")
        : '<p class="confirm-text">发布三问后，课堂会保存在这里。</p>'),
  );
  dialog.querySelectorAll("[data-room]").forEach(
    (b) =>
      (b.onclick = () => {
        room = list[Number(b.dataset.room)];
        save("room", room);
        stats = null;
        selected = null;
        networkError = "";
        dialog.close();
        navigate("board");
      }),
  );
}
async function poll() {
  if (current !== "board" || !room || fetching) return;
  const seq = boardRequest;
  fetching = true;
  try {
    const s = await roomAPI("stats");
    if (current !== "board" || seq !== boardRequest) return;
    stats = s;
    networkError = "";
    showConnection();
    paintBoard(s);
  } catch (e) {
    if (current !== "board" || seq !== boardRequest) return;
    networkError = e.message;
    showConnection();
    if (!stats)
      $("#boardMain").innerHTML =
        '<div class="loading">课堂数据尚未载入。</div>';
  } finally {
    if (seq === boardRequest) {
      fetching = false;
      clearTimeout(pollTimer);
      if (current === "board" && (stats?.phase !== "closed" || networkError))
        pollTimer = setTimeout(poll, 1600);
    }
  }
}
function showConnection() {
  const el = $("#connection");
  if (!el) return;
  el.innerHTML = networkError
    ? '<div class="netwarn">' +
      icon("wifi") +
      safe(networkError) +
      (stats ? " · 显示上次收到的数据" : "") +
      '<button id="pollNow">立即重试</button></div>'
    : "";
  if ($("#pollNow"))
    $("#pollNow").onclick = () => {
      clearTimeout(pollTimer);
      poll();
    };
}
const { boardHero, diagnostic, performance, variantResult } = createBoardViews({
  safe,
  choose,
  stage,
});
async function bigQR(url) {
  showDialog(
    modalTitle("扫码加入课堂", "课堂码 " + stats.code) +
      '<div class="join-modal"><img id="modalQR" alt="课堂二维码"><label>备用加入链接<input id="joinText" readonly value="' +
      safe(url) +
      '"></label>' +
      btn("modalCopy", "primary", "copy", "复制加入链接") +
      "</div>",
  );
  $("#modalQR").src = await qrURL(url);
  $("#modalCopy").onclick = () => copyJoin(url);
}
async function copyJoin(url) {
  try {
    if (navigator.clipboard?.writeText)
      await navigator.clipboard.writeText(url);
    else {
      const field = document.createElement("textarea");
      field.value = url;
      (dialog.open ? dialog : document.body).append(field);
      field.select();
      const ok = document.execCommand("copy");
      field.remove();
      if (!ok) throw Error();
    }
    notify("学生加入链接已复制");
  } catch {
    if (!dialog.open) await bigQR(url);
    $("#joinText")?.select();
    notify("请复制已选中的加入链接");
  }
}
function paintBoard(s, force = false) {
  const sig = JSON.stringify([s, selected]);
  if (!force && sig === lastSig) return;
  lastSig = sig;
  const main = $("#boardMain"),
    existing = main.querySelector(".live-hero"),
    oldPhase = existing?.dataset.phase;
  if (!existing || oldPhase !== s.phase || existing.dataset.code !== s.code) {
    resetScene();
    main.innerHTML = boardHero(s) + '<div id="liveDetails"></div>';
    const hero = main.querySelector(".live-hero");
    hero.dataset.phase = s.phase;
    hero.dataset.code = s.code;
    model(s.questions.map((q) => (s.submitted ? q.right / s.submitted : 0)));
    if ($("#smallQR")) {
      const img = $("#smallQR");
      qrURL(s.joinUrl)
        .then((u) => (img.src = u))
        .catch(() => notify("二维码生成失败，可复制链接加入"));
      $("#copyJoin").onclick = () => copyJoin(s.joinUrl);
      $("#largeQR").onclick = () => bigQR(s.joinUrl);
    }
    if ($("#goSetup")) $("#goSetup").onclick = () => changeView("setup");
  } else {
    for (const k of ["joined", "submitted", "pending"])
      $("#" + k).textContent = s[k];
    liveModel?.update(
      s.questions.map((q) => (s.submitted ? q.right / s.submitted : 0)),
    );
  }
  $("#liveDetails").innerHTML =
    diagnostic(s) +
    variantResult(s) +
    '<div class="section-line"><div><h2>三层理解分布</h2></div><span class="legend">' +
    icon("check", 14) +
    '正确选项 · 柱长表示选择人数</span></div><section class="question-grid">' +
    s.questions.map((q, i) => performance(q, i, s)).join("") +
    '</section><div class="board-bottom"><span>' +
    icon("lock", 15) +
    "仅展示全班汇总 · 结果供课堂即时反馈</span>" +
    (s.phase === "closed"
      ? btn("newClass", "outline", "layers", "发起新课堂")
      : s.phase !== "preview"
        ? btn("endClass", "quiet", "exit", "结束课堂")
        : "") +
    "</div>";
  main.querySelectorAll(".bar.actionable").forEach(
    (b) =>
      (b.onclick = () => {
        const [i, j] = b.dataset.pick.split("-").map(Number);
        selected = { i, j };
        paintBoard(s, true);
        if (s.phase === "open") intervention(s, i, j);
      }),
  );
  if ($("#intervene"))
    $("#intervene").onclick = () => {
      const w = choose(s);
      intervention(s, w?.i ?? 0, w?.j ?? null);
    };
  if ($("#endClass"))
    $("#endClass").onclick = () =>
      confirmAction(
        "结束本次课堂？",
        "结束后将停止接收作答，你仍可查看这次课堂的汇总。",
        "结束课堂",
        async () => {
          try {
            stats = await roomAPI("close", {});
            boardRequest++;
            fetching = false;
            clearTimeout(pollTimer);
            paintBoard(stats, true);
            notify("课堂已结束");
          } catch (e) {
            notify(e.message);
          }
        },
      );
  if ($("#newClass")) $("#newClass").onclick = () => changeView("setup");
}
function intervention(s, i, j) {
  const q = s.questions[i],
    v = s.variants[i];
  showDialog(
    modalTitle("讲解与巩固", "第 " + (i + 1) + " 问 · " + levels[i]) +
      '<div class="lesson"><b>' +
      safe(
        j == null
          ? "讲解要点"
          : q.misconceptions?.[j] || "解释选项 " + letter(j),
      ) +
      "</b><p>" +
      safe(q.explanation) +
      '</p></div><h3 class="variant-title">审核要推送的变式题</h3><form id="variantForm">' +
      formFields(v) +
      '<div class="modal-actions"><button type="button" class="outline" id="cancelVar">返回大屏</button><button class="primary" type="submit">' +
      icon("retest") +
      "推送给全班</button></div></form>",
  );
  $("#cancelVar").onclick = () => dialog.close();
  $("#variantForm").onsubmit = async (e) => {
    e.preventDefault();
    const question = collectQuestion(v);
    if (!validQ(question)) return;
    const b = e.submitter;
    b.disabled = true;
    try {
      stats = await roomAPI("variant", { index: i, question });
      boardRequest++;
      fetching = false;
      clearTimeout(pollTimer);
      dialog.close();
      paintBoard(stats, true);
      notify("已向学生推送变式题");
      poll();
    } catch (err) {
      notify(err.message);
    } finally {
      b.disabled = false;
    }
  };
}
document.addEventListener("fullscreenchange", () => {
  document.body.classList.toggle("projecting", !!document.fullscreenElement);
  if ($("#expand"))
    $("#expand").innerHTML =
      icon("expand", 15) +
      (document.fullscreenElement ? "退出投屏" : "投屏模式");
});
async function start() {
  try {
    if (!draft?.questions?.length) draft = await api("/api/sample");
    navigate(initialView);
  } catch (e) {
    app.innerHTML =
      '<div class="loading"><h2>暂时无法打开课堂</h2><p>' +
      safe(e.message) +
      '</p><button class="primary" id="retryStart">重新连接</button></div>';
    $("#retryStart").onclick = start;
  }
}
start();
