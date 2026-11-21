import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Download,
  FlaskConical,
  GitBranch,
  Layers,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  SkipForward,
  Sparkles,
} from 'lucide-react';

interface StackFrame {
  call: string;
  n: number;
  state: 'pushing' | 'waiting' | 'base-case' | 'returning';
  returnVal?: number;
}

interface RecursionStep {
  frames: StackFrame[];
  log: string;
  aiTip: string;
}

function buildFactorialSteps(n: number): RecursionStep[] {
  const steps: RecursionStep[] = [];
  const stack: StackFrame[] = [];

  for (let k = n; k >= 1; k--) {
    const isBase = k === 1;
    stack.forEach((f) => (f.state = 'waiting'));
    stack.push({
      call: `factorial(${k})`,
      n: k,
      state: isBase ? 'base-case' : 'pushing',
      returnVal: isBase ? 1 : undefined,
    });
    steps.push({
      frames: stack.map((f) => ({ ...f })),
      log: isBase
        ? `命中递归出口 Base Case: factorial(1) 直接返回 1！此时栈深度达到峰值 ${stack.length}。`
        : `压栈 (Push): 调用 factorial(${k})，等待子问题 ${k} × factorial(${k - 1}) 的结果。`,
      aiTip: isBase
        ? '注意看！正是因为写了 if n <= 1: return 1，调用栈才在这里安全止步并开始回溯。'
        : `当前系统调用栈中已累积 ${stack.length} 个活跃栈帧，每个栈帧独立保存各自的 n=${k}。`,
    });
  }

  let acc = 1;
  for (let k = 2; k <= n; k++) {
    stack.pop();
    acc = acc * k;
    const top = stack[stack.length - 1];
    if (top) {
      top.state = 'returning';
      top.returnVal = acc;
    }
    steps.push({
      frames: stack.map((f) => ({ ...f })),
      log: `出栈回溯 (Pop): factorial(${k}) 收到返回值 ${acc / k}，计算 ${k} × ${acc / k} = ${acc} 并向上返回。`,
      aiTip: `回溯阶段严格遵循 LIFO（后进先出）顺序，如果代码漏写 return，这里就会变成 None × ${k} 报错！`,
    });
  }

  steps.push({
    frames: [],
    log: `执行完毕！所有栈帧已安全释放，最终结果 factorial(${n}) = ${acc}。`,
    aiTip: `实验总结：factorial(${n}) 最大调用栈深度为 ${n}，时间复杂度 O(n)，空间复杂度 O(n)。`,
  });

  return steps;
}

export const VirtualLabPage: React.FC<{ isMobile?: boolean }> = ({ isMobile = false }) => {
  const [activeLab, setActiveLab] = useState<'recursion' | 'sorting' | 'tree'>('recursion');

  const [nVal, setNVal] = useState(4);
  const [recSteps, setRecSteps] = useState<RecursionStep[]>(() => buildFactorialSteps(4));
  const [recIdx, setRecIdx] = useState(0);
  const [recPlaying, setRecPlaying] = useState(false);
  const [overflowDemo, setOverflowDemo] = useState(false);

  useEffect(() => {
    setRecSteps(buildFactorialSteps(nVal));
    setRecIdx(0);
    setRecPlaying(false);
    setOverflowDemo(false);
  }, [nVal]);

  useEffect(() => {
    if (!recPlaying) return;
    const timer = setInterval(() => {
      setRecIdx((prev) => {
        if (prev >= recSteps.length - 1) {
          setRecPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1100);
    return () => clearInterval(timer);
  }, [recPlaying, recSteps.length]);

  const [sortArr, setSortArr] = useState<number[]>([68, 24, 92, 41, 77, 15, 56, 85, 33, 62]);
  const [comparing, setComparing] = useState<[number, number] | null>(null);
  const [sortedIndices, setSortedIndices] = useState<number[]>([]);
  const [sorting, setSorting] = useState(false);
  const [sortStats, setSortStats] = useState({ comparisons: 0, swaps: 0 });
  const sortCancelRef = useRef(false);

  const shuffleArray = () => {
    sortCancelRef.current = true;
    setSorting(false);
    setComparing(null);
    setSortedIndices([]);
    setSortStats({ comparisons: 0, swaps: 0 });
    setSortArr(Array.from({ length: 10 }, () => Math.floor(Math.random() * 82) + 14));
  };

  const runBubbleSort = async () => {
    if (sorting) return;
    sortCancelRef.current = false;
    setSorting(true);
    setSortedIndices([]);
    const arr = [...sortArr];
    let comps = 0;
    let swaps = 0;

    for (let i = 0; i < arr.length; i++) {
      for (let j = 0; j < arr.length - i - 1; j++) {
        if (sortCancelRef.current) return;
        setComparing([j, j + 1]);
        comps++;
        setSortStats({ comparisons: comps, swaps });
        await new Promise((r) => setTimeout(r, 220));
        if (arr[j] > arr[j + 1]) {
          [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
          swaps++;
          setSortArr([...arr]);
          setSortStats({ comparisons: comps, swaps });
          await new Promise((r) => setTimeout(r, 220));
        }
      }
      setSortedIndices((prev) => [...prev, arr.length - i - 1]);
    }
    setComparing(null);
    setSorting(false);
  };

  const treeNodes = [
    { id: 'A', x: 240, y: 46 },
    { id: 'B', x: 130, y: 128 },
    { id: 'C', x: 350, y: 128 },
    { id: 'D', x: 75, y: 215 },
    { id: 'E', x: 185, y: 215 },
    { id: 'F', x: 295, y: 215 },
    { id: 'G', x: 405, y: 215 },
  ];
  const TRAVERSAL_ORDERS: Record<'preorder' | 'inorder' | 'postorder' | 'bfs', string[]> = {
    preorder: ['A', 'B', 'D', 'E', 'C', 'F', 'G'],
    inorder: ['D', 'B', 'E', 'A', 'F', 'C', 'G'],
    postorder: ['D', 'E', 'B', 'F', 'G', 'C', 'A'],
    bfs: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  };
  const [treeMode, setTreeMode] = useState<'preorder' | 'inorder' | 'postorder' | 'bfs'>('inorder');
  const [visitedTree, setVisitedTree] = useState<string[]>([]);
  const [treeRunning, setTreeRunning] = useState(false);

  const runTreeTraversal = async (mode: 'preorder' | 'inorder' | 'postorder' | 'bfs') => {
    if (treeRunning) return;
    setTreeMode(mode);
    setTreeRunning(true);
    setVisitedTree([]);
    const seq = TRAVERSAL_ORDERS[mode];
    for (let i = 0; i < seq.length; i++) {
      await new Promise((r) => setTimeout(r, 520));
      setVisitedTree(seq.slice(0, i + 1));
    }
    setTreeRunning(false);
  };

  const handleExportReport = () => {
    const labName =
      activeLab === 'recursion'
        ? `递归调用栈 3D 演练 (factorial(${nVal}))`
        : activeLab === 'sorting'
        ? `冒泡排序过程可视化 (比较 ${sortStats.comparisons} 次, 交换 ${sortStats.swaps} 次)`
        : `二叉树 ${treeMode.toUpperCase()} 遍历演练 (序列: ${visitedTree.join(' -> ') || '待运行'})`;

    const md = `# EduMind 3D 虚拟实验室 · 实验报告\n\n- **实验项目**：${labName}\n- **实验日期**：${new Date().toLocaleDateString()}\n- **核心结论**：通过可视化交互操作，直观验证了数据结构与算法的内存状态变化与时间/空间复杂度。\n- **AI 实验评价**：已完成关键步骤验证，建议返回 3D 知识图谱查看对应节点掌握度。\n`;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EduMind_虚拟实验报告_${activeLab}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentRec = recSteps[recIdx] || recSteps[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <FlaskConical className="w-6 h-6 text-sky-600" />
            3D 交互式虚拟实验室（计算机算法与数据结构）
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            浏览器内零门槛操作教学对象、单步观察内存栈帧与算法过程，支持 AI 实验指导与实验报告一键生成
          </p>
        </div>

        <button
          onClick={handleExportReport}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
        >
          <Download className="w-4 h-4" />
          一键生成并导出《实验报告》
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { id: 'recursion', label: '实验一：递归调用栈 3D 可视化', icon: Layers, badge: '薄弱点专项' },
          { id: 'sorting', label: '实验二：排序算法柱状图可视化', icon: BarChart3, badge: '算法演示' },
          { id: 'tree', label: '实验三：二叉树四种遍历交互台', icon: GitBranch, badge: '高频考点' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveLab(t.id as typeof activeLab)}
            className={`px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeLab === t.id
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 border-sky-500 text-white shadow-md shadow-sky-500/20'
                : 'bg-white border-sky-200 text-slate-600 hover:border-sky-400 hover:text-sky-700'
            }`}
          >
            <t.icon className="w-4 h-4" />
            <span>{t.label}</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                activeLab === t.id ? 'bg-white/20 text-white' : 'bg-sky-50 text-sky-700'
              }`}
            >
              {t.badge}
            </span>
          </button>
        ))}
      </div>

      <div className={`grid grid-cols-1 ${isMobile ? '' : 'xl:grid-cols-12'} gap-4`}>
        <div className={`${isMobile ? '' : 'xl:col-span-8'} glass-panel rounded-2xl p-4 sm:p-6 min-h-[420px] flex flex-col justify-between`}>
          {activeLab === 'recursion' && (
            <div className="space-y-5 flex-1 flex flex-col justify-between">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-semibold text-slate-600">设置参数 n =</span>
                  {[2, 3, 4, 5, 6].map((v) => (
                    <button
                      key={v}
                      onClick={() => setNVal(v)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold cursor-pointer ${
                        nVal === v
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'bg-white border border-sky-200 text-slate-600 hover:border-sky-400'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setRecPlaying(false);
                    setOverflowDemo(!overflowDemo);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer flex items-center gap-1.5 ${
                    overflowDemo
                      ? 'bg-rose-600 text-white border-rose-500'
                      : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {overflowDemo ? '退出溢出模拟' : '反面演示：删掉出口触发栈溢出'}
                </button>
              </div>

              <div
                className="relative flex-1 rounded-2xl bg-gradient-to-b from-[#0b1f3a] via-[#102b4f] to-[#0b1f3a] border border-sky-300/60 p-6 flex flex-col items-center justify-end overflow-hidden min-h-[300px] shadow-inner"
                style={{ perspective: '900px' }}
              >
                <div className="absolute top-3 left-4 text-[11px] font-mono text-sky-200">
                  Python Call Stack 3D 内存视图 · 步骤 {recIdx + 1} / {recSteps.length}
                </div>

                {overflowDemo ? (
                  <div className="flex flex-col-reverse items-center gap-1.5 w-full max-w-md animate-pulse">
                    {['factorial(4)', 'factorial(3)', 'factorial(2)', 'factorial(1)', 'factorial(0)', 'factorial(-1)', 'factorial(-2) ... 💥 RecursionError!'].map(
                      (txt, i) => (
                        <div
                          key={i}
                          style={{ transform: 'rotateX(14deg)' }}
                          className={`w-full py-2 px-4 rounded-xl border text-center font-mono text-xs font-bold shadow-lg ${
                            i === 6
                              ? 'bg-rose-600 border-rose-300 text-white'
                              : 'bg-rose-950/85 border-rose-400/60 text-rose-100'
                          }`}
                        >
                          {txt}
                        </div>
                      )
                    )}
                  </div>
                ) : currentRec.frames.length === 0 ? (
                  <div className="my-auto text-center space-y-2">
                    <div className="text-4xl">✨</div>
                    <div className="text-lg font-bold text-emerald-300">调用栈已全部安全释放</div>
                    <div className="text-xs text-sky-200">{currentRec.log}</div>
                  </div>
                ) : (
                  <div className="flex flex-col-reverse items-center gap-2.5 w-full max-w-md">
                    {currentRec.frames.map((frame, i) => {
                      const isTop = i === currentRec.frames.length - 1;
                      const styleMap = {
                        pushing: 'from-sky-500 to-blue-600 border-sky-300 text-white',
                        waiting: 'from-slate-700/90 to-slate-800/90 border-sky-400/30 text-sky-100',
                        'base-case': 'from-amber-400 to-orange-500 border-amber-200 text-slate-950',
                        returning: 'from-emerald-400 to-teal-500 border-emerald-200 text-slate-950',
                      };
                      return (
                        <div
                          key={frame.call}
                          style={{
                            transform: `rotateX(16deg) scale(${isTop ? 1.04 : 0.98})`,
                          }}
                          className={`w-full py-3 px-5 rounded-xl bg-gradient-to-r border-2 shadow-xl transition-all duration-300 flex items-center justify-between font-mono text-xs font-bold ${styleMap[frame.state]}`}
                        >
                          <span>
                            Frame #{i + 1}: {frame.call}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-black/20 text-[11px]">
                            {frame.state === 'base-case'
                              ? '🎯 命中出口 return 1'
                              : frame.state === 'returning'
                              ? `⬆ 回溯 return ${frame.returnVal}`
                              : frame.state === 'waiting'
                              ? `⏳ 等待 ${frame.n} × 子结果`
                              : '⬇ 压入栈顶'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setOverflowDemo(false);
                      if (recIdx >= recSteps.length - 1) setRecIdx(0);
                      setRecPlaying(!recPlaying);
                    }}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    {recPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    {recPlaying ? '暂停演练' : '自动播放演练'}
                  </button>
                  <button
                    onClick={() => {
                      setOverflowDemo(false);
                      setRecPlaying(false);
                      setRecIdx((i) => Math.min(recSteps.length - 1, i + 1));
                    }}
                    className="px-3 py-2 rounded-xl bg-white hover:bg-sky-50 text-slate-700 border border-sky-200 text-xs font-semibold cursor-pointer flex items-center gap-1"
                  >
                    <SkipForward className="w-3.5 h-3.5" /> 单步执行
                  </button>
                  <button
                    onClick={() => {
                      setOverflowDemo(false);
                      setRecPlaying(false);
                      setRecIdx(0);
                    }}
                    className="p-2 rounded-xl bg-white hover:bg-sky-50 text-slate-600 border border-sky-200 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
                <span className="text-xs font-medium text-sky-700">{currentRec.log}</span>
              </div>
            </div>
          )}

          {activeLab === 'sorting' && (
            <div className="space-y-5 flex-1 flex flex-col justify-between">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-600">
                  冒泡排序（Bubble Sort）实时柱状图演练 · 时间复杂度 <code className="text-sky-700 font-bold">O(n²)</code>
                </div>
                <div className="flex gap-3 text-xs font-mono font-semibold">
                  <span className="text-amber-600">比较次数：{sortStats.comparisons}</span>
                  <span className="text-emerald-600">交换次数：{sortStats.swaps}</span>
                </div>
              </div>

              <div className="flex-1 rounded-2xl bg-sky-50/70 border border-sky-200 p-6 flex items-end justify-center gap-3 min-h-[300px]">
                {sortArr.map((val, idx) => {
                  const isComp = comparing && (comparing[0] === idx || comparing[1] === idx);
                  const isDone = sortedIndices.includes(idx);
                  return (
                    <div key={idx} className="flex flex-col items-center gap-2 flex-1 max-w-[48px]">
                      <span className="text-[11px] font-mono font-bold text-slate-700">{val}</span>
                      <div
                        style={{ height: `${val * 2.4}px` }}
                        className={`w-full rounded-t-xl transition-all duration-200 shadow-md ${
                          isComp
                            ? 'bg-gradient-to-t from-amber-500 to-rose-400 scale-105'
                            : isDone
                            ? 'bg-gradient-to-t from-emerald-500 to-teal-400'
                            : 'bg-gradient-to-t from-blue-600 to-sky-400'
                        }`}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <button
                  disabled={sorting}
                  onClick={runBubbleSort}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" /> {sorting ? '排序运行中...' : '开始可视化排序'}
                </button>
                <button
                  onClick={shuffleArray}
                  className="px-3.5 py-2 rounded-xl bg-white hover:bg-sky-50 text-slate-700 border border-sky-200 text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                >
                  <Shuffle className="w-3.5 h-3.5" /> 随机打乱数组
                </button>
              </div>
            </div>
          )}

          {activeLab === 'tree' && (
            <div className="space-y-5 flex-1 flex flex-col justify-between">
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'preorder', label: '前序 (根-左-右)' },
                  { id: 'inorder', label: '中序 (左-根-右)' },
                  { id: 'postorder', label: '后序 (左-右-根)' },
                  { id: 'bfs', label: '层序 (BFS队列)' },
                ].map((m) => (
                  <button
                    key={m.id}
                    disabled={treeRunning}
                    onClick={() => runTreeTraversal(m.id as typeof treeMode)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                      treeMode === m.id
                        ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
                        : 'bg-white border-sky-200 text-slate-600 hover:border-sky-400'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 rounded-2xl bg-sky-50/70 border border-sky-200 p-4 flex items-center justify-center min-h-[280px]">
                <svg viewBox="0 0 480 260" className="w-full max-w-lg h-64">
                  {[
                    ['A', 'B'],
                    ['A', 'C'],
                    ['B', 'D'],
                    ['B', 'E'],
                    ['C', 'F'],
                    ['C', 'G'],
                  ].map(([u, v]) => {
                    const nu = treeNodes.find((n) => n.id === u)!;
                    const nv = treeNodes.find((n) => n.id === v)!;
                    return (
                      <line
                        key={`${u}-${v}`}
                        x1={nu.x}
                        y1={nu.y}
                        x2={nv.x}
                        y2={nv.y}
                        stroke="#94a3b8"
                        strokeWidth="2.5"
                      />
                    );
                  })}

                  {treeNodes.map((n) => {
                    const visitIdx = visitedTree.indexOf(n.id);
                    const isCurrent = visitIdx === visitedTree.length - 1 && visitIdx >= 0;
                    const isVisited = visitIdx >= 0;
                    return (
                      <g key={n.id}>
                        <circle
                          cx={n.x}
                          cy={n.y}
                          r={isCurrent ? 25 : 21}
                          fill={isCurrent ? '#0284c7' : isVisited ? '#10b981' : '#ffffff'}
                          stroke={isCurrent ? '#38bdf8' : isVisited ? '#059669' : '#0ea5e9'}
                          strokeWidth="2.5"
                        />
                        <text
                          x={n.x}
                          y={n.y + 5}
                          textAnchor="middle"
                          fill={isVisited || isCurrent ? '#ffffff' : '#0f172a'}
                          fontSize="14"
                          fontWeight="bold"
                        >
                          {n.id}
                        </text>
                        {isVisited && (
                          <text
                            x={n.x + 22}
                            y={n.y - 16}
                            fill="#0284c7"
                            fontSize="11"
                            fontWeight="bold"
                          >
                            #{visitIdx + 1}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">当前遍历输出序列：</span>
                <span className="font-mono text-sky-700 font-bold tracking-wider">
                  {visitedTree.length > 0 ? visitedTree.join('  →  ') : '点击上方任意遍历方式开始动画'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className={`${isMobile ? '' : 'xl:col-span-4'} glass-panel rounded-2xl p-4 sm:p-5 flex flex-col justify-between space-y-4`}>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sky-100 border border-sky-200 flex items-center justify-center">
                <Bot className="w-4 h-4 text-sky-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">AI 实验指导导师</h3>
                <p className="text-[11px] text-slate-500">实时同步实验步骤与核心原理</p>
              </div>
            </div>

            <div className="rounded-xl bg-sky-50 border border-sky-200 p-3.5 text-xs text-sky-900 leading-relaxed">
              <Sparkles className="w-3.5 h-3.5 inline mr-1.5 text-sky-600" />
              {activeLab === 'recursion'
                ? overflowDemo
                  ? '⚠️ 你正在观察反面案例：缺少 Base Case 时，调用栈无限增长直至耗尽内存触发 RecursionError。写递归前务必先锁定终止出口！'
                  : currentRec.aiTip
                : activeLab === 'sorting'
                ? '观察每次内层循环：相邻元素两两比较，较大元素像气泡一样“浮”到数组右侧并锁定为绿色已排序区。'
                : '区分三种深度优先遍历只需记住“根节点什么时候被访问”：前序最先访问根，中序夹在左右中间，后序最后访问根。'}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700">实验任务引导：</div>
              {[
                '1. 调整输入规模或点击自动播放，观察内存/节点动态变化',
                '2. 使用「单步执行」停留在关键边界（如 Base Case 命中瞬间）',
                '3. 尝试反面案例（如删去出口触发栈溢出），理解防错原因',
                '4. 点击右上角一键导出《实验报告》提交课堂记录',
              ].map((s, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-xl bg-white border border-sky-100 text-xs text-slate-600"
                >
                  {s}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-sky-50/70 border border-sky-100 p-3 text-[11px] text-slate-500">
            扩展能力 (PRD 7.2)：底层架构已预留 Three.js 物理/化学/电路三维仿真插件接口，可无缝横向扩展至理工科全学科实验。
          </div>
        </div>
      </div>
    </div>
  );
};
