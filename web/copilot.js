// Shared lecture slide UI. Student questions remain private until the separate share action.
const styleURL = "/copilot.css";
if (!document.querySelector('link[href="/copilot.css"]')) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = styleURL;
  document.head.append(link);
}
const safe = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const kindText = { text: "段落", code: "代码", formula: "公式", image: "图片" };

function makeAPI(code, token) {
  const base = "/api/rooms/" + encodeURIComponent(code) + "/copilot/";
  return async (action, body) => {
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    const isFile = body instanceof File;
    if (body !== undefined)
      headers["Content-Type"] = isFile
        ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        : "application/json";
    const ctrl = new AbortController();
    const timeout = setTimeout(
      () => ctrl.abort(),
      action === "ask" || isFile ? 45000 : 12000,
    );
    try {
      const res = await fetch(base + action, {
        method: body === undefined ? "GET" : "POST",
        headers,
        body: isFile ? body : JSON.stringify(body),
        credentials: "same-origin",
        cache: "no-store",
        signal: ctrl.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "操作未完成，请重试。");
      return data;
    } catch (e) {
      if (e.name === "AbortError" || e instanceof TypeError)
        throw new Error("暂未收到服务器响应，请检查连接后重试。");
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  };
}
function slideHTML(page, idx, interactive) {
  if (!page) return '<p class="cp-empty">教师尚未发布课件页。</p>';
  const elements = page.elements
    .map((el) => {
      const image =
        el.kind === "image" && el.image
          ? `<img data-slide-image="${safe(el.image)}" alt="${safe(el.text)}">`
          : "";
      const content = `<span class="cp-element-label">${kindText[el.kind]}</span>${image}<span class="cp-element-text">${safe(el.text)}</span>`;
      return interactive
        ? `<button type="button" class="cp-element cp-${safe(el.kind)}" data-element="${safe(el.id)}" aria-pressed="false">${content}</button>`
        : `<div class="cp-element cp-${safe(el.kind)}">${content}</div>`;
    })
    .join("");
  return `<div class="cp-slide-caption"><span>第 ${idx + 1} 页</span><span>${safe(page.source)}</span></div>
    <h3>${safe(page.title)}</h3><div class="cp-elements">${elements || '<p class="cp-empty">本页没有可显示的元素。</p>'}</div>`;
}
function loadImages(container, call, cache) {
  for (const img of container.querySelectorAll("img[data-slide-image]")) {
    const id = img.dataset.slideImage;
    let pending = cache.get(id);
    if (!pending) {
      pending = call("image?id=" + encodeURIComponent(id)).then(
        (data) => data.data,
      );
      cache.set(id, pending);
    }
    pending
      .then((url) => {
        if (img.isConnected) img.src = url;
      })
      .catch(() => {
        cache.delete(id);
        if (img.isConnected) img.alt += " · 图片加载失败，请重新打开课件。";
      });
  }
}
function keepLive(el, refresh) {
  let stopped = false,
    started = false,
    timer;
  async function tick() {
    if (stopped) return;
    if (el.isConnected) started = true;
    if (started && !el.isConnected) {
      stopped = true;
      return;
    }
    try {
      if (!document.hidden) await refresh();
    } catch {
      /* The panel shows its request error. */
    }
    if (!stopped) timer = setTimeout(tick, 2600);
  }
  tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
function groupHTML(groups) {
  if (!groups.length)
    return '<p class="cp-empty">收到学生主动分享的疑问后，在这里按课件页和问题关键词汇总。</p>';
  return groups
    .map(
      (g) => `<article class="cp-group">
    <div><strong>${safe(g.group)}</strong><span>${g.count} 人提到</span></div>
    <p>${safe(g.summary || g.example)}</p>
    <small>${safe(g.mode || "关键词与元素规则")}</small>
    <small>${safe(g.pageTitle)} · ${safe(g.suggestion)}</small>
    <button type="button" data-reteach="${safe(g.pageId)}">切到此页重讲</button>
  </article>`,
    )
    .join("");
}

export function mountCopilot(
  container,
  code,
  teacherToken,
  { onCreateQuiz } = {},
) {
  const api = makeAPI(code, teacherToken),
    imageCache = new Map();
  const root = document.createElement("section");
  root.className = "cp-panel cp-teacher";
  container.replaceChildren(root);
  root.innerHTML = `<header class="cp-header"><div><p class="cp-kicker">课堂副驾驶</p><h2>授课页与课堂疑问</h2></div>
    <div class="cp-actions">${onCreateQuiz ? '<button type="button" class="cp-secondary" data-create-quiz>用本页编排三问</button>' : ""}<button type="button" class="cp-secondary" data-manual>手工增页</button>
    <label class="cp-upload">导入 PPTX<input type="file" accept=".pptx" aria-label="导入 PPTX 课件"></label></div></header>
    <p class="cp-file-guide"><a href="/copilot-demo.pptx" download="递归求和课堂示例.pptx">下载示例课件</a> · 支持 .pptx，最大 12 MB</p>
    <p class="cp-status" aria-live="polite"></p>
    <form class="cp-editor" hidden><label>课件页标题<input name="title" maxlength="130" required></label>
      <div class="cp-editor-elements"></div><button type="button" data-add-el>增加一个元素</button>
      <div class="cp-actions"><button type="button" data-cancel>取消</button><button type="submit" class="cp-primary">发布并切到本页</button></div></form>
    <div class="cp-columns"><section class="cp-course"><div class="cp-page-nav">
      <label>当前授课页<select aria-label="切换当前授课页"></select></label>
      <div><button type="button" data-prev>上一页</button><button type="button" data-next>下一页</button></div>
    </div><div class="cp-slide"></div></section><aside class="cp-sidebar"><h3>匿名疑问</h3><div class="cp-groups"></div></aside></div>`;
  const find = (s) => root.querySelector(s),
    msg = find(".cp-status"),
    select = find("select"),
    editor = find(".cp-editor");
  let data,
    signature = "",
    pageSig = "",
    groupsSig = "",
    updating = false,
    seq = 0,
    disposed = false;
  function notice(message) {
    msg.textContent = message;
  }
  function paint(s) {
    if (disposed) return;
    data = s;
    const options = JSON.stringify([s.current, s.pages]);
    if (options !== signature) {
      signature = options;
      select.replaceChildren(
        ...(s.pages || []).map(
          (p, i) =>
            new Option(i + 1 + " · " + p.title, p.id, false, i === s.current),
        ),
      );
      if (find("[data-create-quiz]"))
        find("[data-create-quiz]").disabled = !s.page;
      select.disabled = !s.total;
      find("[data-prev]").disabled = s.current <= 0;
      find("[data-next]").disabled = s.current >= s.total - 1;
    }
    const page = JSON.stringify([s.current, s.page]);
    if (page !== pageSig) {
      pageSig = page;
      find(".cp-slide").innerHTML = slideHTML(s.page, s.current, false);
      loadImages(find(".cp-slide"), api, imageCache);
    }
    const group = JSON.stringify(s.groups || []);
    if (group !== groupsSig) {
      groupsSig = group;
      find(".cp-groups").innerHTML = groupHTML(s.groups || []);
    }
  }
  async function mutate(action, body, done) {
    if (updating) return false;
    updating = true;
    ++seq;
    root.setAttribute("aria-busy", "true");
    try {
      paint(await api(action, body));
      notice(done);
      return true;
    } catch (e) {
      notice(e.message);
      return false;
    } finally {
      updating = false;
      root.removeAttribute("aria-busy");
      if (data?.page) select.value = data.page.id;
    }
  }
  function setPage(id) {
    if (id) mutate("current", { pageId: id }, "学生已同步到当前课件页。");
  }
  function appendElement() {
    const list = find(".cp-editor-elements");
    if (list.children.length >= 30) {
      notice("手工编辑最多 30 个元素。");
      return;
    }
    const row = document.createElement("div");
    row.innerHTML =
      '<label>元素类型<select><option value="text">段落</option><option value="code">代码</option><option value="formula">公式</option></select></label><label>内容<textarea maxlength="6000" required rows="3"></textarea></label><button type="button" data-remove>移除</button>';
    list.append(row);
  }
  select.onchange = () => setPage(select.value);
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-create-quiz") && data?.page) {
      const page = data.page;
      const material = [
        page.title,
        page.source,
        ...page.elements.map((el) => kindText[el.kind] + " · " + el.text),
      ].join("\n");
      onCreateQuiz({
        title: page.title,
        material,
        pageId: page.id,
        pageNumber: data.current + 1,
        source: page.source,
      });
    }
    if (b.hasAttribute("data-manual")) {
      editor.hidden = false;
      if (!find(".cp-editor-elements").children.length) appendElement();
      editor.elements.title.focus();
    }
    if (b.hasAttribute("data-cancel")) editor.hidden = true;
    if (b.hasAttribute("data-add-el")) appendElement();
    if (b.hasAttribute("data-remove")) {
      const list = find(".cp-editor-elements");
      if (list.children.length > 1) b.parentElement.remove();
    }
    if (b.hasAttribute("data-reteach")) setPage(b.dataset.reteach);
    if (b.hasAttribute("data-prev")) setPage(data?.pages[data.current - 1]?.id);
    if (b.hasAttribute("data-next")) setPage(data?.pages[data.current + 1]?.id);
  });
  editor.onsubmit = async (e) => {
    e.preventDefault();
    const elements = [...find(".cp-editor-elements").children].map((row) => ({
      kind: row.querySelector("select").value,
      text: row.querySelector("textarea").value.trim(),
    }));
    if (
      await mutate(
        "pages",
        { title: editor.elements.title.value.trim(), elements },
        "手工课件页已发布。",
      )
    ) {
      editor.hidden = true;
      editor.reset();
      find(".cp-editor-elements").replaceChildren();
    }
  };
  find('input[type="file"]').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024)
      notice("请选择不超过 12 MB 的 PPTX 课件。");
    else {
      notice("正在提取课件页、公式、代码和图片…");
      await mutate(
        "import?filename=" + encodeURIComponent(file.name),
        file,
        "课件已导入，学生已切换到新课件第一页。",
      );
    }
    e.target.value = "";
  };
  const stop = keepLive(root, async () => {
    if (updating) return;
    const before = seq;
    try {
      const s = await api("state");
      if (before === seq) paint(s);
    } catch (e) {
      notice(e.message);
    }
  });
  const dispose = () => {
    disposed = true;
    stop();
    imageCache.clear();
  };
  dispose.dispose = dispose;
  return dispose;
}

export function mountStudentCopilot(container, code, token, onProgress) {
  const api = makeAPI(code, token),
    imageCache = new Map();
  const root = document.createElement("section");
  root.className = "cp-panel cp-student";
  container.replaceChildren(root);
  root.innerHTML = `<p class="cp-sync" role="status"></p>
    <div class="cp-slide"></div><form class="cp-question" hidden>
    <label>对当前页提问<textarea maxlength="300" rows="2" placeholder="可先点选上方段落、公式、代码或图片" required></textarea></label>
    <p class="cp-selection"></p>
    <label class="cp-consent" hidden><input type="checkbox" data-allow-ai>允许把本条疑问、授课页标题及对应课件文字发送至已配置的 AI 服务，辅助匿名归类和提出重讲建议。</label>
    <div class="cp-actions"><button type="submit" class="cp-primary">私下询问</button>
    <button type="button" data-share class="cp-secondary">匿名分享给教师</button></div>
    <small>主动分享后，教师会看到疑问文字及其所属课件页。请勿填写姓名或学号。</small><p class="cp-status" role="status"></p></form>
    <div class="cp-reply" aria-live="polite"></div>`;
  const find = (s) => root.querySelector(s),
    form = find("form"),
    input = find("textarea"),
    status = find(".cp-status"),
    reply = find(".cp-reply");
  let data,
    signature = "",
    selected = "",
    busy = false,
    disposed = false;
  function choose(id) {
    selected = id;
    const el = data.page.elements.find((e) => e.id === id);
    root
      .querySelectorAll("[data-element]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.element === id)),
      );
    find(".cp-selection").textContent = el
      ? "提问依据 · " + kindText[el.kind] + "「" + el.text.slice(0, 45) + "」"
      : "提问依据 · 当前授课页";
    if (el && !input.value.trim())
      input.value =
        "请解释这" +
        { code: "段代码", formula: "个公式", text: "段内容", image: "张图" }[
          el.kind
        ] +
        "在本页中的作用。";
  }
  function paint(s) {
    if (disposed) return;
    data = s;
    const key = JSON.stringify([
      s.page,
      s.current,
      s.total,
      s.aiGroupingAvailable,
    ]);
    if (key === signature) return;
    signature = key;
    const prior = form.dataset.page;
    form.dataset.page = s.page?.id || "";
    if (prior && prior !== form.dataset.page) {
      reply.replaceChildren();
      status.textContent = "已随教师切换授课页。请核对当前页后再发送疑问。";
    }
    find(".cp-slide").innerHTML = slideHTML(s.page, s.current, true);
    loadImages(find(".cp-slide"), api, imageCache);
    form.hidden = !s.page;
    find(".cp-consent").hidden = !s.aiGroupingAvailable;
    find("[data-allow-ai]").checked = false;
    if (s.page) choose("");
    onProgress?.(s);
  }
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-element]");
    if (b && !busy) choose(b.dataset.element);
  });
  async function perform(share) {
    const question = input.value.trim();
    if (!question) {
      input.focus();
      return;
    }
    if (!data?.page || busy) return;
    busy = true;
    const pageId = data.page.id,
      questionBody = {
        pageId,
        elementId: selected,
        question,
        ...(share
          ? {
              allowAi:
                !!data.aiGroupingAvailable && find("[data-allow-ai]").checked,
            }
          : {}),
      };
    const buttons = [...form.querySelectorAll("button")];
    buttons.forEach((b) => (b.disabled = true));
    status.textContent = share ? "正在匿名分享…" : "正在查阅当前授课资料…";
    try {
      const result = await api(share ? "share" : "ask", questionBody);
      if (pageId !== data.page?.id) return;
      if (share) {
        find("[data-allow-ai]").checked = false;
        status.textContent = "已匿名分享，教师端将按相近疑问汇总。";
        return;
      }
      status.textContent = "本次答疑仅自己可见。";
      reply.innerHTML = `<p class="cp-kicker">${safe(result.mode)}</p><h4>${safe(question)}</h4><p>${safe(result.answer)}</p>${result.source ? `<strong>课件依据</strong><blockquote>${safe(result.source)}</blockquote>` : '<p class="cp-empty">没有可引用的课件依据。</p>'}`;
    } catch (e) {
      status.textContent = e.message;
    } finally {
      busy = false;
      buttons.forEach((b) => (b.disabled = false));
    }
  }
  form.onsubmit = (e) => {
    e.preventDefault();
    perform(false);
  };
  find("[data-share]").onclick = () => perform(true);
  const stop = keepLive(root, async () => {
    try {
      paint(await api("state"));
    } catch (e) {
      status.textContent = e.message;
    }
  });
  const dispose = () => {
    disposed = true;
    stop();
    imageCache.clear();
  };
  dispose.dispose = dispose;
  return dispose;
}
