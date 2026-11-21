// Each snapshot represents the active stack before the next call or return.
function traceTotal(n) {
  const active = [],
    steps = [];
  let result = 0;
  for (let k = n; k >= 0; k--) {
    active.push(k);
    steps.push({
      frames: [...active],
      value: null,
      caption:
        k === 0
          ? "到达递归出口，total(0) 直接返回 0。"
          : `total(${k}) 暂停，等待 total(${k - 1}) 返回。`,
    });
  }
  while (active.length) {
    const k = active.pop(),
      previous = result;
    result += k;
    steps.push({
      frames: [...active],
      value: result,
      caption:
        k === 0
          ? "total(0) 出栈，把 0 交回上一层。"
          : `total(${k}) 恢复执行，返回 ${k} + ${previous} = ${result}。`,
    });
  }
  return steps;
}

class EduStack extends HTMLElement {
  connectedCallback() {
    if (this.dataset.initialized) return;
    this.dataset.initialized = "1";
    this.innerHTML = `<div class="stack-code"><span>Python · 调用栈</span><code>def total(n):<br>&nbsp; if n == 0: return 0<br>&nbsp; return n + total(n - 1)</code></div>
      <div class="stack-view"><div class="stack-stack"></div><span class="stack-value"></span></div>
      <p class="stack-caption" aria-live="polite"></p><div class="stack-tools">
      <label>输入 n <select aria-label="递归输入 n"><option>2</option><option selected>3</option><option>4</option><option>5</option></select></label>
      <button type="button" data-action="prev">上一步</button><button type="button" data-action="next">下一步</button></div>`;
    const input = this.querySelector("select"),
      prev = this.querySelector('[data-action="prev"]'),
      next = this.querySelector('[data-action="next"]');
    let steps = traceTotal(Number(input.value)),
      index = Number(input.value);
    const render = () => {
      const s = steps[index];
      this.querySelector(".stack-stack").innerHTML =
        s.frames
          .map(
            (n, i) =>
              `<span class="stack-frame ${i === s.frames.length - 1 ? "active" : ""}" style="--depth:${i}"><b>total(${n})</b><small>${i === s.frames.length - 1 ? "栈顶" : "等待"}</small></span>`,
          )
          .join("") || '<span class="stack-done">调用栈已清空</span>';
      this.querySelector(".stack-value").textContent =
        s.value === null ? "入栈" : `返回 ${s.value}`;
      this.querySelector(".stack-caption").textContent = s.caption;
      prev.disabled = index === 0;
      next.textContent = index === steps.length - 1 ? "从头推演" : "下一步";
    };
    input.onchange = () => {
      steps = traceTotal(Number(input.value));
      index = 0;
      render();
    };
    prev.onclick = () => {
      index = Math.max(0, index - 1);
      render();
    };
    next.onclick = () => {
      index = (index + 1) % steps.length;
      render();
    };
    render();
  }
}
customElements.define("edu-stack", EduStack);
