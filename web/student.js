"use strict";

const screen = document.querySelector("#screen");
const network = document.querySelector("#network");
const announcement = document.querySelector("#announcement");
const roomCode = location.pathname.match(/^\/join\/([a-zA-Z0-9_-]+)\/?$/)?.[1];
const base = roomCode ? "/api/rooms/" + encodeURIComponent(roomCode) : "";
const levels = ["基础理解", "误区辨别", "迁移应用"];
const outlines = {
  book: '<path d="M3 5.5c3.2-.8 6.2-.4 9 1.4 2.8-1.8 5.8-2.2 9-1.4v13c-3.2-.8-6.2-.4-9 1.4-2.8-1.8-5.8-2.2-9-1.4zM12 7v12"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  split:
    '<path d="M12 20v-4c0-4 6-4 6-8V4m0 0-3 3m3-3 3 3M12 16c0-4-6-4-6-8V4M3 7l3-3 3 3"/>',
  transfer: '<path d="M4 18 18 4m-8 0h8v8M4 10v9a1 1 0 0 0 1 1h9"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  shield:
    '<path d="M12 3c-2 1.8-5 3-8 3v6c0 4 3.5 7 8 9 4.5-2 8-5 8-9V6c-3 0-6-1.2-8-3Z"/><path d="m8.3 11.8 2.5 2.5 4.8-5"/>',
  waiting: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  feedback: '<path d="M4 4h16v13H9l-5 4V4Zm4 5h8m-8 4h5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  flag: '<path d="M5 21V4c4-4 10 4 15 0v10c-5 4-11-4-15 0"/>',
  network:
    '<path d="M2 8c5-5 15-5 20 0M6 12c3-3 9-3 12 0m-9 4c1.6-1.4 4.4-1.4 6 0"/><circle cx="12" cy="20" r="1"/><path d="M3 3l18 18"/>',
};
const glyph = (name, extra = "") =>
  '<svg aria-hidden="true" focusable="false" class="icon ' +
  extra +
  '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
  outlines[name] +
  "</svg>";
const escapeText = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
const optionLetter = (i) => String.fromCharCode(65 + i);
let snapshot;
let snapshotKey = "";
let sending = false;
let syncing = false;
let epoch = 0;
let timer = 0;
let seenNetworkError = false;
let networkCopy = "";
let initError;
let lastActionError = "";
let cache;
for (const name of ["localStorage", "sessionStorage"]) {
  try {
    const area = window[name];
    const key = "stsw:probe";
    area.setItem(key, "1");
    area.removeItem(key);
    cache = area;
    break;
  } catch {
    /* Some private browsers restrict local storage. */
  }
}
let diskKey,
  work,
  account = null,
  companionsStarted = false,
  livePage = null;
function restoreProgress() {
  diskKey = "stsw:student:v1:" + roomCode + (account ? ":" + account.id : "");
  work = {
    sessionId: "",
    step: 0,
    answers: [null, null, null],
    variantAnswer: null,
    reviewed: [],
  };
  try {
    const old = JSON.parse(cache?.getItem(diskKey) || "null");
    if (old && /^[a-f0-9]{32}$/.test(old.sessionId)) {
      work.sessionId = old.sessionId;
      work.reviewed = Array.isArray(old.reviewed)
        ? old.reviewed.filter((i) => Number.isInteger(i) && i >= 0 && i <= 3)
        : [];
      work.step =
        Number.isInteger(old.step) && old.step >= 0 && old.step < 3
          ? old.step
          : 0;
      work.answers = work.answers.map((_, i) =>
        validAnswer(old.answers?.[i]) ? old.answers[i] : null,
      );
      work.variantAnswer = validAnswer(old.variantAnswer)
        ? old.variantAnswer
        : null;
    }
  } catch {
    /* Discard incomplete browser drafts. */
  }
  if (!work.sessionId && roomCode) {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    work.sessionId = Array.from(bytes, (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    remember();
  }
}
function validAnswer(value) {
  return Number.isInteger(value) && value >= 0 && value <= 3;
}
function remember() {
  try {
    cache?.setItem(diskKey, JSON.stringify(work));
  } catch {
    cache = null;
  }
}
async function api(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    path === "ask" ? 45000 : 9000,
  );
  try {
    const headers = {
      Accept: "application/json",
      Authorization: "Bearer " + work.sessionId,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(base + "/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) {
      const err = new Error(
        typeof json?.error === "string" ? json.error : "暂时无法获取课堂状态",
      );
      err.status = res.status;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

function notebookSketch() {
  if (snapshot.topic === "递归出口与调用栈") {
    return `<path d="M13 48h48M13 48V17" stroke="#8b97bf"/>
      <g stroke="#314795" fill="#e0e8fa" stroke-width="1.4">
        <path d="m18 40 22-6 18 5-22 6z"/><path d="m18 32 22-6 18 5-22 6z"/><path d="m18 24 22-6 18 5-22 6z"/>
      </g><path d="M42 9v8m-3-3 3 3 3-3" stroke="#bd462b" fill="none" stroke-width="2"/>`;
  }
  return `<path d="M9 49h55M19 57V8" stroke="#8b97bf"/>
    <path d="M22 44 38 17l19 24-35 3Z" stroke="#2843a0" stroke-width="1.8"/>
    <g fill="#c5462b"><circle cx="22" cy="44" r="2.3"/><circle cx="38" cy="17" r="2.3"/><circle cx="57" cy="41" r="2.3"/></g>`;
}
function topicCover() {
  const closed = snapshot.phase === "closed";
  const status = closed
    ? "课堂已结束"
    : snapshot.phase === "lecture"
      ? "正在授课"
      : snapshot.phase === "variant"
        ? "课堂巩固中"
        : "课堂进行中";
  const meta = [snapshot.grade, snapshot.subject]
    .filter(Boolean)
    .map((value) => `<span class="meta-piece">${escapeText(value)}</span>`)
    .join('<i class="meta-sep" aria-hidden="true"></i>');
  return `<section class="topic-cover${closed ? " closed" : ""}">
    <div class="topic-info">
      <div class="hero-top"><i class="light"></i>${status}</div>
      <h1>${escapeText(snapshot.topic)}</h1>
      <div class="topic-meta">${meta}</div>
    </div>
    <div class="cover-art" aria-hidden="true">
      <div class="workbook">
        <i class="sheet under"></i>
        <i class="sheet front">
          <svg class="draft-diagram" viewBox="0 0 75 64" fill="none">
            ${notebookSketch()}
          </svg>
        </i>
        <i class="pencil"><i></i></i>
      </div>
    </div>
  </section>`;
}
function isVariantTurn() {
  return (
    snapshot?.submitted &&
    !snapshot.retried &&
    snapshot.phase === "variant" &&
    !!snapshot.variant
  );
}
function questionView(variant) {
  const idx = variant ? 3 : work.step;
  const item = variant ? snapshot.variant : snapshot.questions[idx];
  const selected = variant ? work.variantAnswer : work.answers[idx];
  const section = variant ? "变式巩固" : levels[idx];
  const title = variant ? "老师发来了巩固题" : "三问进度";
  const count = variant ? "01 / 01" : "0" + (idx + 1) + " / 03";
  const bits = (variant ? [0] : [0, 1, 2])
    .map(
      (i) =>
        '<span class="' +
        (variant || i === idx
          ? "current"
          : validAnswer(work.answers[i])
            ? "done"
            : "") +
        '"></span>',
    )
    .join("");
  const options = item.options
    .map(
      (text, i) => `
    <label class="choice">
      <input type="radio" name="choice" value="${i}"${selected === i ? " checked" : ""}${sending ? " disabled" : ""}>
      <span class="letter">${optionLetter(i)}</span>
      <span class="choice-text">${escapeText(text)}</span>
      <span class="choice-mark">${glyph("check")}</span>
    </label>`,
    )
    .join("");
  const back =
    !variant && idx > 0
      ? `<button class="back" type="button" data-back${sending ? " disabled" : ""}>上一题</button>`
      : "";
  const action = variant
    ? "提交巩固回答"
    : idx === 2
      ? "提交三道回答"
      : "下一题";
  const busyLabel =
    '<i class="loader inline-loader" aria-hidden="true"></i>正在提交';
  return `<form id="answer-form" class="tone-${idx}">
    <div class="meter">
      <div class="meter-label"><b>${title}</b><span class="meter-count">${count}</span></div>
      <div class="meter-rail" aria-hidden="true">${bits}</div>
    </div>
    <section class="question-card">
      <div class="question-top">
        <span class="kind"><i class="registration" aria-hidden="true"></i>${section}</span>
        <span class="question-type">单选题</span>
      </div>
      <h2 id="question-heading" tabindex="-1">${escapeText(item.prompt)}</h2>
      <fieldset aria-labelledby="question-heading">${options}</fieldset>
    </section>
    <div class="actions">
      ${back}
      <button id="next" class="primary" type="submit"${sending || selected === null ? " disabled" : ""}>
        ${sending ? busyLabel : action}
      </button>
    </div>
  </form>`;
}
function resources() {
  const hasMaterial = !!snapshot.material?.trim();
  if (!hasMaterial && !livePage) return "";
  return `<nav class="resource-tools" aria-label="课程学习资料">
    ${livePage ? `<button type="button" data-resource="live">${glyph("layers")}授课第 ${livePage.current + 1} 页</button>` : ""}
    ${
      hasMaterial
        ? `<button type="button" data-resource="reading">${glyph("book")}课程讲义</button>
    <button type="button" data-resource="asking">${glyph("feedback")}讲义答疑</button>`
        : ""
    }
  </nav>`;
}

async function mountCompanions() {
  if (companionsStarted) return;
  companionsStarted = true;
  const attendance = import("/attendance.js").then(({ mountAttendance }) =>
    mountAttendance(document.querySelector("#student-attendance"), roomCode, {
      role: "student",
      sessionId: work.sessionId,
    }),
  );
  const pilot = import("/copilot.js").then(({ mountStudentCopilot }) =>
    mountStudentCopilot(
      document.querySelector("#live"),
      roomCode,
      work.sessionId,
      (data) => {
        livePage = data.page ? data : null;
        const old = screen.querySelector(".resource-tools");
        if (old) old.outerHTML = resources();
        else if (snapshot)
          screen
            .querySelector(".topic-cover")
            ?.insertAdjacentHTML("afterend", resources());
      },
    ),
  );
  await Promise.allSettled([attendance, pilot]);
}

function revisionList(entries) {
  const toReview = entries
    .map((entry, index) => ({ ...entry, index }))
    .filter(
      ({ selected, correct }) =>
        validAnswer(selected) && validAnswer(correct) && selected !== correct,
    );
  if (!toReview.length) {
    return '<section class="revision"><h2>本次复习清单</h2><p>已开放反馈的题目中，暂无错题需要回看。</p></section>';
  }
  const actions = [
    "遮住解析，用自己的话重述正确选项，再指出原选项遗漏的条件。",
    "对照原选项和正确选项，写下一处会改变结论的差别。",
    "换一个条件再推演一次，检查原先那一步会得到什么结果。",
    "回看巩固题，把这一次修正的解题步骤写在笔记里。",
  ];
  function actionFor(q, index) {
    if (
      snapshot.topic === "递归出口与调用栈" &&
      q.prompt.includes("执行 total(3)")
    ) {
      return "从 total(0) 开始画出四个栈帧，逐层填写返回值，再圈出最终交给调用者的值。";
    }
    return actions[index];
  }
  const tasks = toReview
    .map(
      ({ q, selected, correct, explanation, title, index }) => `
    <li>
      <label><input type="checkbox" data-review="${index}" ${work.reviewed.includes(index) ? "checked" : ""}>
        <b>${escapeText(title)}</b><span>已复习</span>
      </label>
      <p class="revision-action">${actionFor(q, index)}</p>
      <p>原选 ${optionLetter(selected)}「${escapeText(q.options[selected])}」 · 正确 ${optionLetter(correct)}「${escapeText(q.options[correct])}」</p>
      <details><summary>回看解析</summary><p>${escapeText(explanation)}</p></details>
    </li>`,
    )
    .join("");
  return `<section class="revision"><h2>本次复习清单</h2><ul>${tasks}</ul></section>`;
}

function review() {
  const fb = snapshot.feedback;
  if (!fb || !snapshot.submitted) return "";
  const entries = (snapshot.questions || []).map((q, i) => ({
    q,
    selected: fb.answers?.[i],
    correct: fb.correct?.[i],
    explanation: fb.explanations?.[i],
    title: "第 " + (i + 1) + " 题 · " + levels[i],
  }));
  if (snapshot.retried && snapshot.variant && validAnswer(fb.variantCorrect)) {
    entries.push({
      q: snapshot.variant,
      selected: validAnswer(fb.variantAnswer)
        ? fb.variantAnswer
        : work.variantAnswer,
      correct: fb.variantCorrect,
      explanation: fb.variantExplanation,
      title: "变式巩固",
    });
  }
  const details = entries
    .filter((e) => validAnswer(e.correct))
    .map(({ q, selected, correct, explanation, title }) => {
      const right = selected === correct;
      const badge = validAnswer(selected)
        ? `<span class="result-chip${right ? " right" : ""}">${right ? "答对了" : "再想一想"}</span>`
        : "";
      const own =
        !right && validAnswer(selected)
          ? `<p>你的选择 · ${optionLetter(selected)}　${escapeText(q.options[selected])}</p>`
          : "";
      return `<details>
      <summary>${title}${badge}${glyph("chevron", "fold")}</summary>
      <div class="review-body">
        <p><b>${escapeText(q.prompt)}</b></p>
        ${own}
        <p>正确答案 · ${optionLetter(correct)}　${escapeText(q.options[correct])}</p>
        <p>${escapeText(explanation)}</p>
      </div>
    </details>`;
    })
    .join("");
  return details
    ? '<section class="feedback"><h2 class="feedback-heading">' +
        glyph("feedback") +
        "我的答题反馈</h2>" +
        details +
        "</section>" +
        revisionList(entries)
    : "";
}
function receipt() {
  const closed = snapshot.phase === "closed";
  let title = "三道回答已送达";
  let copy = "老师已收到你的作答。讲解后，巩固题会自动出现在这里。";
  let label = "等待老师推送";
  if (snapshot.retried) {
    title = "巩固回答已送达";
    copy = "两轮作答都已记录，可以回到课堂听讲。";
    label = "已完成两轮作答";
  } else if (closed) {
    title = "本次课堂已结束";
    copy = snapshot.submitted
      ? "你的三道回答已记录，可以关闭此页面。"
      : "老师已经结束了本次活动，答题入口已关闭。";
    label = snapshot.submitted ? "三问已提交" : "活动已结束";
  }
  return `<section class="receipt">
    <div class="receipt-art" aria-hidden="true">
      <i class="receipt-copy"></i>
      <i class="confirmed-sheet">${glyph(snapshot.submitted ? "check" : "flag")}</i>
      <i class="pencil"><i></i></i>
    </div>
    <h2>${title}</h2><p>${copy}</p>
    <span class="receipt-status">${glyph(closed || snapshot.retried ? "check" : "waiting")}${label}</span>
  </section>`;
}
function render() {
  screen.removeAttribute("aria-busy");
  const lecture = snapshot.phase === "lecture";
  const ask =
    !lecture &&
    snapshot.questions.length > 0 &&
    snapshot.phase !== "closed" &&
    (!snapshot.submitted || isVariantTurn());
  const waiting = `<section class="lecture-wait"><div>${glyph("book")}课堂授课中</div><h2>随教师查看本页课件</h2>
    <p>遇到疑问可以点选课件内容提问。教师发布随堂三问后，题目会自动出现在这里。</p></section>`;
  const content = lecture
    ? waiting
    : ask
      ? questionView(isVariantTurn())
      : receipt();
  const note = cache
    ? account
      ? "账号参与 · 投屏仅展示班级汇总"
      : "匿名参与"
    : "匿名参与 · 当前浏览器无法保存进度，请保持页面打开";
  screen.innerHTML =
    topicCover() +
    resources() +
    content +
    (snapshot.submitted ? review() : "") +
    (snapshot.submitted && snapshot.topic === "递归出口与调用栈"
      ? '<details class="stack-practice"><summary>动手推演调用栈</summary><edu-stack></edu-stack></details>'
      : "") +
    '<p class="privacy">' +
    glyph("shield") +
    note +
    "</p>";
}
function displayNetwork(copy) {
  if (copy === networkCopy) return;
  networkCopy = copy;
  network.hidden = !copy;
  network.innerHTML = copy
    ? '<span class="net-copy">' +
      glyph("network") +
      escapeText(copy) +
      '</span><button type="button" class="retry-connect" data-sync>重连</button>'
    : "";
}
function renderInitialError(error) {
  const closed = error?.status === 409 || error?.status === 410;
  const missing = !roomCode || error?.status === 404;
  const title = closed
    ? "这堂课已结束"
    : missing
      ? "没有找到这堂课"
      : "暂时未能加入";
  const reason = closed
    ? "本次活动已停止接收答题。"
    : missing
      ? "请核对加入链接，或重新扫描老师大屏上的二维码。"
      : "请检查网络连接，确认手机与老师的大屏可以访问同一个课堂地址。";
  screen.removeAttribute("aria-busy");
  screen.innerHTML =
    '<section class="start-state"><div class="receipt-symbol">' +
    glyph(closed || missing ? "book" : "network") +
    "</div><h1>" +
    title +
    "</h1><p>" +
    reason +
    "</p>" +
    (roomCode && !closed
      ? '<button class="primary" type="button" data-sync>重新加入</button>'
      : "") +
    "</section>";
}
function accept(state) {
  const questions = state.questions ?? [];
  const awaiting =
    (state.phase === "lecture" || state.phase === "closed") &&
    questions.length === 0;
  if (!Array.isArray(questions) || (!awaiting && questions.length !== 3))
    throw new Error("题目数据不完整");
  state.questions = questions;
  const nowPublished = snapshot?.phase === "lecture" && state.phase === "open";
  const key = JSON.stringify(state);
  const hasNewVariant =
    snapshot &&
    !isVariantTurn() &&
    state.variant &&
    state.phase === "variant" &&
    state.submitted &&
    !state.retried;
  snapshot = state;
  initError = null;
  seenNetworkError = false;
  if (
    state.retried ||
    state.phase === "closed" ||
    (state.submitted && state.phase === "open")
  )
    lastActionError = "";
  displayNetwork(lastActionError);
  if (key !== snapshotKey) {
    snapshotKey = key;
    render();
    mountCompanions();
    document.title = state.topic + " · EduMind · 随堂三问";
    if (hasNewVariant) announcement.textContent = "老师发布了新的巩固题。";
    if (nowPublished) announcement.textContent = "老师已发布随堂三问。";
  }
}
function schedule(delay) {
  clearTimeout(timer);
  if (
    document.hidden ||
    !roomCode ||
    snapshot?.phase === "closed" ||
    [404, 409, 410].includes(initError?.status)
  )
    return;
  timer = setTimeout(() => sync(), delay ?? (seenNetworkError ? 4500 : 2000));
}
async function sync(explicit = false) {
  if (sending || syncing || !roomCode) return;
  syncing = true;
  const started = epoch;
  try {
    let data;
    if (!snapshot) {
      data = await api("join", { sessionId: work.sessionId });
    } else {
      data = await api("state");
    }
    if (started !== epoch) return;
    if (explicit) lastActionError = "";
    accept(data);
  } catch (err) {
    if (started !== epoch) return;
    if (err.status === 401 && (!snapshot || account)) {
      location.replace("/?next=" + encodeURIComponent(location.pathname));
      return;
    }
    seenNetworkError = true;
    if (!snapshot) {
      initError = err;
      renderInitialError(err);
    } else {
      displayNetwork(
        snapshot.submitted
          ? "连接中断。已记录的作答将保留，正在重新连接。"
          : "连接中断。你的选择已保留，正在重新连接。",
      );
    }
  } finally {
    syncing = false;
    schedule();
  }
}
async function submit(variant) {
  if (sending) return;
  sending = true;
  epoch++;
  clearTimeout(timer);
  lastActionError = "";
  displayNetwork("");
  render();
  let failed = false;
  try {
    const response = await api(
      variant ? "retry" : "answers",
      variant ? { answer: work.variantAnswer } : { answers: work.answers },
    );
    accept(response);
    announcement.textContent = variant
      ? "巩固回答提交成功。"
      : "三道回答提交成功。";
  } catch {
    failed = true;
  } finally {
    sending = false;
    render();
  }
  if (failed) {
    // Read server state before inviting a retry. The server may have saved a request whose response was lost.
    try {
      accept(await api("state"));
    } catch {
      seenNetworkError = true;
    }
    if (
      !(variant ? snapshot.retried : snapshot.submitted) &&
      snapshot.phase !== "closed"
    ) {
      lastActionError = "尚未确认提交。请检查连接后再次点击提交。";
      displayNetwork(lastActionError);
    }
  }
  schedule();
}
screen.addEventListener("change", (event) => {
  const task = event.target.closest("input[data-review]");
  if (task) {
    const index = Number(task.dataset.review);
    work.reviewed = work.reviewed.filter((item) => item !== index);
    if (task.checked) work.reviewed.push(index);
    remember();
    return;
  }
  const input = event.target.closest('input[name="choice"]');
  if (!input || sending) return;
  const answer = Number(input.value);
  if (!validAnswer(answer)) return;
  if (isVariantTurn()) work.variantAnswer = answer;
  else work.answers[work.step] = answer;
  lastActionError = "";
  if (!seenNetworkError) displayNetwork("");
  remember();
  document.querySelector("#next").disabled = false;
});
function moveStep(step) {
  work.step = step;
  remember();
  render();
  const title = document.querySelector("#question-heading");
  title?.focus({ preventScroll: true });
  if (title && title.getBoundingClientRect().top < 0)
    title.scrollIntoView({ block: "start" });
  announcement.textContent = "第 " + (step + 1) + " 题，" + levels[step] + "。";
}
screen.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!snapshot || sending || snapshot.phase === "closed") return;
  if (isVariantTurn()) {
    if (validAnswer(work.variantAnswer)) submit(true);
    return;
  }
  if (snapshot.submitted || !validAnswer(work.answers[work.step])) return;
  if (work.step < 2) moveStep(work.step + 1);
  else if (work.answers.every(validAnswer)) submit(false);
  else moveStep(work.answers.findIndex((value) => !validAnswer(value)));
});
const resourceDialog = document.querySelector("#course-desk");
const questionInput = document.querySelector("#course-question");
const askSubmit = document.querySelector("#ask-submit");
const resultPanel = document.querySelector("#ask-result");
let lastResource = "reading";

function showResource(tab) {
  if (tab === "live" ? !livePage : !snapshot.material?.trim()) return;
  lastResource = tab;
  document.querySelector("#reading-title").textContent = snapshot.topic;
  const material = snapshot.material?.trim() || "";
  const withoutHeading =
    material.split("\n")[0].trim() === snapshot.topic
      ? material.slice(material.indexOf("\n") + 1).trimStart()
      : material;
  document.querySelector("#reading-material").textContent = withoutHeading;
  for (const section of ["live", "reading", "asking"]) {
    resourceDialog.querySelector(`[data-resource-tab="${section}"]`).hidden =
      section === "live" ? !livePage : !material;
    document.getElementById(section).hidden = section !== tab;
    resourceDialog
      .querySelector(`[data-resource-tab="${section}"]`)
      .setAttribute("aria-pressed", String(section === tab));
  }
  if (!resourceDialog.open) resourceDialog.showModal();
}
document.querySelector("#leave-resource").onclick = () =>
  resourceDialog.close();
resourceDialog.addEventListener("close", () =>
  screen
    .querySelector(`[data-resource="${lastResource}"]`)
    ?.focus({ preventScroll: true }),
);
document
  .querySelector("#ask-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const question = questionInput.value.trim();
    if (!question || askSubmit.disabled) {
      questionInput.focus();
      return;
    }
    askSubmit.disabled = true;
    questionInput.readOnly = true;
    resultPanel.setAttribute("aria-busy", "true");
    resultPanel.textContent = "正在查阅本课讲义…";
    try {
      const reply = await api("ask", { question });
      const quote = typeof reply.source === "string" ? reply.source.trim() : "";
      if (quote) {
        const fromModel = reply.mode === "ai" || reply.mode === "AI 讲义问答";
        const mode = fromModel ? "AI 讲义问答" : "讲义检索";
        resultPanel.innerHTML = `<p class="answer-mode">${mode}</p>
        <h3>${escapeText(question)}</h3>
        <p class="grounded-answer">${escapeText(reply.answer)}</p>
        <h4>讲义原文</h4><blockquote>${escapeText(quote)}</blockquote>`;
      } else {
        resultPanel.innerHTML = `<h3>本次答疑没有可引用的讲义原文</h3><p>${escapeText(reply.answer || "请换用讲义中的术语重新提问，或向任课教师确认。")}</p>`;
      }
    } catch (err) {
      resultPanel.textContent = err.status
        ? err.message
        : "暂未收到答复。请检查网络后再次提问。";
    } finally {
      resultPanel.removeAttribute("aria-busy");
      askSubmit.disabled = false;
      questionInput.readOnly = false;
    }
  });
document.addEventListener("click", (event) => {
  const btn = event.target.closest("button");
  if (!btn || btn.disabled) return;
  if (btn.dataset.resource || btn.dataset.resourceTab)
    showResource(btn.dataset.resource || btn.dataset.resourceTab);
  if (btn.hasAttribute("data-back") && !sending && work.step > 0)
    moveStep(work.step - 1);
  if (btn.hasAttribute("data-sync")) sync(true);
});
document.addEventListener("visibilitychange", () =>
  document.hidden ? clearTimeout(timer) : sync(),
);
window.addEventListener("online", () => sync(true));
window.addEventListener("offline", () => {
  seenNetworkError = true;
  if (snapshot?.phase !== "closed" && snapshot)
    displayNetwork("网络已断开。你可以继续选择，恢复连接后再提交。");
});
if (roomCode) {
  const tag = document.querySelector("#session-tag");
  tag.hidden = false;
  tag.innerHTML =
    '<span>课堂码</span><b class="room-digits">' +
    escapeText(roomCode) +
    "</b>";
  async function startSession() {
    try {
      const res = await fetch("/api/auth/me", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (res.ok) account = (await res.json()).user;
      if (account && account.role !== "student") {
        location.replace("/?next=" + encodeURIComponent(location.pathname));
        return;
      }
      restoreProgress();
      await sync();
    } catch {
      restoreProgress();
      await sync();
    }
  }
  startSession();
} else {
  renderInitialError();
}
