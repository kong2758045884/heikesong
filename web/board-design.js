import { icon } from "./icons.js";

const names = ["基础理解", "误区辨别", "迁移应用"];
const stages = {
  preview: "发布前预览",
  open: "正在收集作答",
  variant: "巩固复测中",
  closed: "课堂已结束",
};
const letters = "ABCD";
const percent = (count, total) =>
  total ? Math.round((count * 100) / total) + "%" : "—";

export function createBoardViews({ safe, choose, stage }) {
  function entry(s) {
    const preview = s.phase === "preview";
    const ended = s.phase === "closed";
    if (preview || ended) {
      return `<aside class="bd-entry bd-entry-idle">
        <span class="bd-standby" aria-hidden="true">${icon(ended ? "check" : "grid", 44)}</span>
        <div><h2>${ended ? "活动已结束" : "学生加入"}</h2>
        <p>${ended ? "课堂码 " + safe(s.code) : "发布后开放扫码"}</p>
        ${preview ? '<button type="button" id="goSetup" class="bd-link">去发布三问</button>' : ""}</div>
      </aside>`;
    }
    return `<aside class="bd-entry">
      <button type="button" class="bd-qr" id="largeQR" aria-label="放大课堂二维码"><img id="smallQR" alt="学生扫码加入"></button>
      <div><h2>扫码加入</h2><p class="bd-code">课堂码 <b>${safe(s.code)}</b></p>
      <button type="button" id="copyJoin" class="bd-link">${icon("link", 15)}复制链接</button></div>
    </aside>`;
  }

  function boardHero(s) {
    const counter = (id, count, label) =>
      `<div><strong id="${id}">${count}</strong><span>${label}</span></div>`;
    return `<section class="live-hero bd-mast" aria-label="课堂活动">
      <div class="bd-lesson">
        <div class="bd-kicker"><span class="bd-state"><i></i>${stages[s.phase] || ""}</span><span>${safe(s.grade)} · ${safe(s.subject)}</span></div>
        <h1>${safe(s.topic)}</h1>
        <div class="bd-roll" aria-label="课堂参与">
          ${counter("joined", s.joined, "人加入")}${counter("submitted", s.submitted, "已提交")}${counter("pending", s.pending, "待提交")}
        </div>
      </div>
      <figure class="bd-figure" aria-label="各层答对率的立体图">
        ${stage("bars")}<figcaption><span>三层答对率</span><span>基础 / 辨误 / 迁移</span></figcaption>
      </figure>
      ${entry(s)}
    </section>`;
  }

  function diagnostic(s) {
    const w = choose(s);
    const q = w && s.questions[w.i];
    const live = s.phase === "open";
    const empty = s.submitted === 0;
    const heading = w
      ? q.misconceptions?.[w.j] || "再讲一遍第 " + (w.i + 1) + " 问"
      : empty
        ? s.phase === "preview"
          ? "发布后查看共性误区"
          : s.phase === "closed"
            ? "本场未收到答卷"
            : "等待第一份答卷"
        : "已提交学生均答对三问";
    const detail = w
      ? `第 ${w.i + 1} 问 · ${safe(names[w.i])}<span class="bd-split"></span>选项 ${letters[w.j]}<strong> ${safe(q.options[w.j])}</strong>`
      : empty
        ? s.phase === "closed"
          ? "没有可供比较的作答。"
          : "学生提交后，在这里查看最集中的错误选项。"
        : "可以选择一道变式题，检验换个情境还能否答对。";
    const action =
      live && !empty && s.variantIndex == null
        ? `<button type="button" id="intervene" class="bd-action">${icon("bulb", 17)}讲解并推送变式</button>`
        : s.variantIndex != null
          ? '<span class="bd-pushed">已推送变式</span>'
          : "";
    return `<section class="bd-focus ${w ? "bd-has-error" : ""}" aria-label="讲解焦点">
      <div class="bd-focus-marker">${icon(w ? "focus" : "bulb", 22)}<span>讲解焦点</span></div>
      <div class="bd-focus-copy"><h2>${safe(heading)}</h2><p>${detail}</p></div>
      ${w ? `<div class="bd-error-count"><b>${w.n}</b><span>人选此项</span></div>` : ""}
      ${action}
    </section>`;
  }

  function performance(q, i, s) {
    const picked = choose(s);
    const rows = q.counts
      .map((n, j) => {
        const correct = j === q.correct;
        const canPick = n > 0 && !correct;
        const selected = picked?.i === i && picked?.j === j;
        const label =
          letters[j] +
          " " +
          q.options[j] +
          "，" +
          n +
          " 人选择" +
          (correct ? "，正确答案" : "");
        return `<button type="button" class="bar bd-row${correct ? " bd-correct" : ""}${canPick ? " actionable" : ""}${selected ? " bd-selected" : ""}" data-pick="${i}-${j}" ${canPick ? "" : "disabled"} aria-label="${safe(label)}" title="${safe(label)}">
        <span class="bd-option">${letters[j]}</span>
        <span class="bd-option-text">${safe(q.options[j])}</span>
        <span class="bd-track"><i style="--ratio:${s.submitted ? n / s.submitted : 0}"></i></span>
        <span class="bd-value">${n}</span>
        <span class="bd-check">${correct ? icon("check", 14) : ""}</span>
      </button>`;
      })
      .join("");
    return `<article class="bd-layer" aria-label="第 ${i + 1} 问 ${names[i]}">
      <header><span class="bd-question-no">Q${i + 1}</span><h3>${names[i]}</h3></header>
      <div class="bd-reading"><strong>${percent(q.right, s.submitted)}</strong><div><b>答对率</b><span>${q.right} / ${s.submitted} 人</span></div></div>
      <p class="bd-prompt">${safe(q.prompt)}</p>
      <div class="bd-bars">${rows}</div>
    </article>`;
  }

  function variantResult(s) {
    if (s.variantIndex == null) return "";
    const n = s.variantSubmitted;
    const q = s.variant || s.variants[s.variantIndex];
    const item = (title, value) =>
      `<div><span>${title}</span><strong>${value}<small> / ${n}</small></strong></div>`;
    return `<section class="bd-retest"><div class="bd-retest-intro"><h2>${icon("retest", 19)}变式再检验</h2><p>${safe(q.prompt)}</p></div>
      <div class="bd-compare" aria-label="同一批已复测学生的表现">
        <span>同批 ${n} 人</span>${item("原题答对", s.variantBaselineRight ?? 0)}${item("变式答对", s.variantRight)}
      </div></section>`;
  }

  return { boardHero, diagnostic, performance, variantResult };
}
