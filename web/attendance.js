const text = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const stamp = (value) =>
  value
    ? new Date(value).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
const labels = {
  pending: "待教师审核",
  approved: "已签到",
  rejected: "未通过",
};
const mounted = new WeakMap();

export function mountAttendance(
  el,
  code,
  { role, teacherToken = "", sessionId = "" } = {},
) {
  if (!el || !code) return () => {};
  mounted.get(el)?.();
  if (!document.querySelector("link[data-attendance-style]")) {
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = "/attendance.css";
    style.dataset.attendanceStyle = "";
    document.head.append(style);
  }
  const teacher = role === "teacher",
    token = teacher ? teacherToken : sessionId;
  const api = "/api/rooms/" + encodeURIComponent(code) + "/attendance";
  let state = null,
    modal = null,
    cleanDialog = () => {},
    timer,
    last = "",
    stopped = false,
    busy = false,
    controller = new AbortController();
  el.classList.add("att-host");
  el.innerHTML =
    '<section class="att-panel"><div class="att-head"><div><span class="att-eyebrow">课堂参与</span><h3>课堂签到</h3></div><span class="att-tag">读取中</span></div><div class="att-body"></div><p class="att-notice" role="status"></p></section>';
  const body = el.querySelector(".att-body"),
    notice = el.querySelector(".att-notice"),
    tag = el.querySelector(".att-tag");
  const tip = (msg = "") => {
    notice.textContent = msg;
  };
  const btn = (id, label, accent = false) =>
    '<button type="button" class="att-btn ' +
    (accent ? "att-primary" : "") +
    '" data-act="' +
    id +
    '">' +
    text(label) +
    "</button>";
  async function request(action, data, img = false) {
    const headers = {};
    if (token) headers.Authorization = "Bearer " + token;
    if (data) headers["Content-Type"] = "application/json";
    const res = await fetch(api + action, {
      credentials: "same-origin",
      cache: "no-store",
      headers,
      method: data ? "POST" : "GET",
      body: data ? JSON.stringify(data) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "签到服务暂不可用。");
    }
    return img ? res.blob() : res.json();
  }
  function close() {
    cleanDialog();
    cleanDialog = () => {};
    if (modal) {
      modal.close();
      modal.remove();
      modal = null;
    }
  }
  function dialog(title, content, onClose = () => {}) {
    close();
    cleanDialog = onClose;
    modal = document.createElement("dialog");
    modal.className = "att-dialog";
    modal.innerHTML =
      '<div class="att-dhead"><h3>' +
      text(title) +
      '</h3><button type="button" data-dismiss aria-label="关闭">关闭</button></div>' +
      content +
      '<p class="att-dialog-note" role="status"></p>';
    document.body.append(modal);
    modal.querySelector("[data-dismiss]").onclick = close;
    modal.addEventListener("cancel", (ev) => {
      ev.preventDefault();
      close();
    });
    modal.showModal();
    return modal;
  }
  function render(data) {
    state = data;
    const signature = JSON.stringify(data);
    if (last === signature) return;
    last = signature;
    tag.textContent = data.active
      ? "签到进行中"
      : data.round
        ? "已截止"
        : "尚未开启";
    tag.classList.toggle("att-live", data.active);
    const records = data.records || [],
      my = records.find((r) => r.round === data.round);
    if (teacher) {
      const pending = records.filter((r) => r.status === "pending").length;
      body.innerHTML =
        (data.active
          ? '<div class="att-challenge"><div><small>本轮现场码</small><strong>' +
            text(data.challenge) +
            "</strong></div><p>请将现场码写在板面，或在画面中清晰展示。<br>学生动作 · " +
            text(data.gesture) +
            "<br>截止 " +
            text(stamp(data.deadline)) +
            "</p></div>"
          : "<p>开启一轮限时签到，系统将生成现场码和随机手势。</p>") +
        '<div class="att-actions">' +
        (data.active
          ? btn("stop", "提前截止")
          : data.roomClosed
            ? ""
            : btn("open", "发起签到", true)) +
        (records.length
          ? btn("manage", "私下审核 · " + pending + " 条待审")
          : "") +
        "</div>" +
        (records.length
          ? "<small>" +
            records.length +
            " 条累计记录 · " +
            records.filter((r) => r.status === "approved").length +
            " 条通过</small>"
          : "");
    } else {
      const current = data.active
        ? "<p>请按要求<strong>" +
          text(data.gesture) +
          "</strong>，在 " +
          text(stamp(data.deadline)) +
          " 前提交。可直接申请人工签到。</p>"
        : "<p>" +
          (data.round ? "本轮签到已截止。" : "教师开启签到后，可在这里提交。") +
          "</p>";
      body.innerHTML =
        current +
        (data.active && !my
          ? '<div class="att-actions">' +
            btn("camera", "实时拍照签到", true) +
            btn("manual", "申请人工签到") +
            "</div>"
          : "") +
        (records.length
          ? '<section class="att-records"><h4>我的签到记录</h4>' +
            records
              .map(
                (r) =>
                  "<div><span>第 " +
                  r.roundNumber +
                  " 轮 · " +
                  text(stamp(r.submitted)) +
                  "</span><b>" +
                  text(labels[r.status]) +
                  "</b>" +
                  (r.note ? "<p>" + text(r.note) + "</p>" : "") +
                  "</div>",
              )
              .join("") +
            "</section>"
          : "");
    }
  }
  async function refresh() {
    if (stopped || !el.isConnected) {
      dispose();
      return;
    }
    if (busy) return;
    try {
      const data = await request("");
      if (!stopped) render(data);
    } catch (e) {
      if (!stopped) tip(e.message);
    }
  }
  async function mutate(action, payload) {
    if (busy) return false;
    busy = true;
    try {
      const data = await request("/" + action, payload);
      if (stopped) return false;
      if (data.records) render(data);
      tip("已保存");
      return true;
    } catch (e) {
      (modal?.querySelector(".att-dialog-note") || notice).textContent =
        e.message;
      return false;
    } finally {
      busy = false;
    }
  }
  function start() {
    const cfg = state.configuredProvider;
    const d = dialog(
      "发起课堂签到",
      '<p>教师在场展示本轮现场码与手势。学生可用摄像头提交材料，也可以请求现场人工核验。</p><label>签到时长<select id="att-min"><option value="2">2 分钟</option><option selected value="5">5 分钟</option><option value="10">10 分钟</option></select></label>' +
        (cfg
          ? '<label class="att-check"><input type="checkbox" id="att-model">允许本轮学生单独授权将照片发送至 ' +
            text(cfg) +
            "，用于场景核对。学生可以拒绝。</label>"
          : '<p class="att-muted">当前使用教师现场人工审核。</p>') +
        '<div class="att-actions">' +
        btn("begin", "开始签到", true) +
        "</div>",
    );
    d.querySelector('[data-act="begin"]').onclick = async () => {
      if (
        await mutate("open", {
          minutes: Number(d.querySelector("select").value),
          visionConsent: !!d.querySelector("#att-model")?.checked,
        })
      )
        close();
    };
  }
  function requestManual() {
    const round = state.round;
    const d = dialog(
      "申请人工签到",
      '<p>此方式无需开启摄像头。任课教师将核对你在本次课堂的到场情况，并在此页反馈结果。</p><div class="att-actions">' +
        btn("send", "提交人工核验", true) +
        "</div>",
    );
    d.querySelector('[data-act="send"]').onclick = async () => {
      if (await mutate("submit", { round, method: "manual" })) close();
    };
  }
  function camera() {
    const { round, gesture, provider } = state;
    let stream = null,
      image = "",
      alive = true;
    const stop = () => {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };
    const d = dialog(
      "实时拍照签到",
      "<p>请让自己、现场任课教师、黑板或课堂板面及六位现场码同框。前景学生动作：<strong>" +
        text(gesture) +
        '</strong>。</p><p class="att-muted">避开未同意入镜的人。照片仅供本轮任课教师审核，提交后最长可查看 10 分钟，完成审核后删除。可随时改用人工签到。</p>' +
        '<label class="att-check"><input type="checkbox" data-consent>我同意本次拍摄及向任课教师提交，已取得同框教师同意。</label>' +
        (provider
          ? '<label class="att-check"><input type="checkbox" data-vision>另外允许教师将此照片送至 ' +
            text(provider) +
            " 做视觉核对。第三方将按其服务条款处理图像。</label>"
          : "") +
        '<div class="att-camera"><video playsinline muted autoplay hidden></video><img hidden alt="待提交的本次拍摄"></div><div class="att-actions">' +
        btn("enable", "开启摄像头") +
        btn("snap", "拍摄") +
        "</div>" +
        '<label>教师展示的现场码<input type="text" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" autocomplete="off" data-code placeholder="输入六位数字"></label><div class="att-actions">' +
        btn("upload", "提交本次拍摄", true) +
        btn("alternate", "改为人工签到") +
        "</div>",
      () => {
        alive = false;
        stop();
        image = "";
      },
    );
    const video = d.querySelector("video"),
      preview = d.querySelector("img"),
      err = d.querySelector(".att-dialog-note");
    const enable = d.querySelector('[data-act="enable"]'),
      snap = d.querySelector('[data-act="snap"]'),
      send = d.querySelector('[data-act="upload"]'),
      consent = d.querySelector("[data-consent]");
    enable.disabled = true;
    snap.disabled = true;
    send.disabled = true;
    const enabled = () => {
      enable.disabled = !consent.checked;
      send.disabled =
        !consent.checked ||
        !image ||
        !/^\d{6}$/.test(d.querySelector("[data-code]").value);
    };
    d.querySelector("[data-code]").oninput = enabled;
    consent.onchange = () => {
      if (!consent.checked) {
        stop();
        image = "";
        video.hidden = true;
        preview.hidden = true;
        preview.removeAttribute("src");
        snap.disabled = true;
      }
      enabled();
    };
    enable.onclick = async () => {
      if (!consent.checked) return;
      try {
        stop();
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "该地址或设备无法打开摄像头，可使用 HTTPS 或改为人工签到。",
          );
        let next = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 960 } },
          audio: false,
        });
        if (!alive || !consent.checked) {
          next.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = next;
        video.srcObject = stream;
        video.hidden = false;
        preview.hidden = true;
        image = "";
        await video.play();
        snap.disabled = false;
        err.textContent = "";
      } catch (e) {
        stop();
        err.textContent =
          e.name === "NotAllowedError"
            ? "摄像头授权未开启，可直接申请人工签到。"
            : e.message;
      }
      enabled();
    };
    snap.onclick = () => {
      if (!stream || !video.videoWidth || !consent.checked) return;
      const ratio = Math.min(
          1,
          1000 / Math.max(video.videoWidth, video.videoHeight),
        ),
        c = document.createElement("canvas");
      c.width = Math.round(video.videoWidth * ratio);
      c.height = Math.round(video.videoHeight * ratio);
      c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
      image = c.toDataURL("image/jpeg", 0.76);
      preview.src = image;
      preview.hidden = false;
      video.hidden = true;
      stop();
      snap.disabled = true;
      enable.textContent = "重新拍摄";
      enabled();
    };
    send.onclick = async () => {
      if (send.disabled) return;
      if (
        await mutate("submit", {
          round,
          method: "photo",
          challenge: d.querySelector("[data-code]").value,
          consent: consent.checked,
          visionConsent: !!d.querySelector("[data-vision]")?.checked,
          image: image.split(",")[1],
        })
      )
        close();
    };
    d.querySelector('[data-act="alternate"]').onclick = requestManual;
  }
  function manage() {
    const d = dialog(
      "私下审核签到",
      '<p>此界面包含学生提交的记录。请先退出投屏或关闭屏幕共享，再进入审核。</p><div class="att-actions">' +
        btn("private", "已退出投屏，查看记录", true) +
        "</div>",
    );
    d.querySelector('[data-act="private"]').onclick = listRecords;
  }
  function listRecords() {
    const records = state.records || [];
    const d = dialog(
      "签到记录",
      '<label>审核状态<select><option value="pending">待审核</option><option value="approved">已通过</option><option value="rejected">未通过</option><option value="">全部记录</option></select></label><div class="att-list"></div>',
    );
    const list = d.querySelector(".att-list"),
      select = d.querySelector("select");
    function draw() {
      const rows = records.filter(
        (r) => !select.value || r.status === select.value,
      );
      list.innerHTML = rows.length
        ? rows
            .map(
              (r) =>
                '<button type="button" data-id="' +
                text(r.id) +
                '"><span><b>' +
                text(r.name) +
                "</b><small>第 " +
                r.roundNumber +
                " 轮 · " +
                text(stamp(r.submitted)) +
                " · " +
                (r.method === "photo" ? "照片核验" : "人工核验") +
                "</small></span><strong>" +
                text(labels[r.status]) +
                "</strong></button>",
            )
            .join("")
        : "<p>当前没有此状态的记录。</p>";
      list
        .querySelectorAll("button")
        .forEach(
          (b) =>
            (b.onclick = () =>
              review(records.find((v) => v.id === b.dataset.id))),
        );
    }
    select.onchange = draw;
    draw();
  }
  function review(rec) {
    let objectURL = "",
      deadlineTimer;
    const photo = rec.photoAvailable && Date.parse(rec.expires) > Date.now();
    const d = dialog(
      "审核 · " + rec.name,
      "<p>第 " +
        rec.roundNumber +
        " 轮 · " +
        text(stamp(rec.submitted)) +
        " · " +
        text(labels[rec.status]) +
        "</p>" +
        (rec.method === "photo"
          ? "<p>本轮手势为“" +
            text(rec.gesture) +
            "”，现场码 " +
            text(rec.challenge) +
            "。" +
            (photo
              ? "照片将在 " + text(stamp(rec.expires)) + " 前可查看。"
              : "照片已删除或过期，可现场核对。") +
            "</p>"
          : "<p>学生已选择人工核验，请由本轮任课教师当面核实到场情况。</p>") +
        (photo
          ? '<div class="att-actions">' +
            btn("showphoto", "查看限时照片") +
            (rec.visionConsent && !rec.assessment
              ? btn("vision", "发送至已授权视觉服务")
              : "") +
            '</div><img class="att-private-photo" alt="学生单独授权查看的签到照片" hidden>'
          : "") +
        '<p data-assessment class="att-muted">' +
        text(rec.assessment || "") +
        "</p>" +
        (rec.status === "pending"
          ? '<label>审核备注<input maxlength="180" data-reason placeholder="未通过时请说明原因"></label><label class="att-check"><input type="checkbox" data-confirm>我已核实本轮任课教师与该生的现场身份，并按现场事实作出判断。</label><div class="att-actions">' +
            btn("approve", "确认到场", true) +
            btn("reject", "记录未通过") +
            "</div>"
          : "<p>" + text(rec.note) + "</p>"),
      () => {
        clearTimeout(deadlineTimer);
        if (objectURL) URL.revokeObjectURL(objectURL);
      },
    );
    const show = d.querySelector('[data-act="showphoto"]'),
      photoEl = d.querySelector("img");
    const expire = () => {
      if (objectURL) {
        URL.revokeObjectURL(objectURL);
        objectURL = "";
      }
      if (photoEl) {
        photoEl.removeAttribute("src");
        photoEl.hidden = true;
      }
      if (show) show.disabled = true;
    };
    if (photo)
      deadlineTimer = setTimeout(
        expire,
        Math.max(0, Date.parse(rec.expires) - Date.now()),
      );
    if (show)
      show.onclick = async () => {
        try {
          const blob = await request(
            "/photo?id=" + encodeURIComponent(rec.id),
            undefined,
            true,
          );
          if (!d.isConnected || Date.now() >= Date.parse(rec.expires)) return;
          if (objectURL) URL.revokeObjectURL(objectURL);
          objectURL = URL.createObjectURL(blob);
          photoEl.src = objectURL;
          photoEl.hidden = false;
        } catch (e) {
          d.querySelector(".att-dialog-note").textContent = e.message;
        }
      };
    const vision = d.querySelector('[data-act="vision"]');
    if (vision)
      vision.onclick = async () => {
        vision.disabled = true;
        d.querySelector("[data-assessment]").textContent =
          "正在向已授权的视觉服务核对画面…";
        try {
          const res = await request("/vision", { id: rec.id });
          d.querySelector("[data-assessment]").textContent = res.assessment;
          await refresh();
        } catch (e) {
          d.querySelector("[data-assessment]").textContent = e.message;
        }
      };
    for (const [verb, decision] of [
      ["approve", "approved"],
      ["reject", "rejected"],
    ]) {
      const b = d.querySelector('[data-act="' + verb + '"]');
      if (!b) continue;
      b.onclick = async () => {
        const checked = d.querySelector("[data-confirm]").checked;
        const note = d.querySelector("[data-reason]").value;
        if (
          await mutate("review", {
            id: rec.id,
            decision,
            confirmed: checked,
            note,
          })
        ) {
          close();
          listRecords();
        }
      };
    }
  }
  const actions = {
    open: start,
    manage,
    manual: requestManual,
    camera,
    stop: () => {
      const round = state.round;
      const d = dialog(
        "提前截止签到",
        "<p>截止后停止接收本轮签到。教师可继续审核已提交记录。</p>" +
          btn("finish", "确定截止", true),
      );
      d.querySelector('[data-act="finish"]').onclick = async () => {
        if (await mutate("close", { round })) close();
      };
    },
  };
  function onClick(e) {
    const act = e.target.closest("button[data-act]")?.dataset.act;
    if (act && actions[act]) actions[act]();
  }
  const onVisibility = () => {
    if (document.hidden && modal) {
      close();
    } else if (!document.hidden) refresh();
  };
  function dispose() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    controller.abort();
    close();
    el.removeEventListener("click", onClick);
    document.removeEventListener("visibilitychange", onVisibility);
    mounted.delete(el);
  }
  el.addEventListener("click", onClick);
  document.addEventListener("visibilitychange", onVisibility);
  mounted.set(el, dispose);
  refresh();
  timer = setInterval(() => {
    if (!document.hidden) refresh();
  }, 4500);
  return dispose;
}
