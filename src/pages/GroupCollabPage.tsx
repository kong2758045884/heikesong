import React, { useState } from 'react';
import { Bot, CheckCircle2, Plus, Sparkles, Users } from 'lucide-react';
import { INITIAL_GROUP_TASKS } from '../data/mockData';
import type { GroupTask } from '../types';

export const GroupCollabPage: React.FC = () => {
  const [tasks, setTasks] = useState<GroupTask[]>(INITIAL_GROUP_TASKS);
  const [mindNodes, setMindNodes] = useState<string[]>([
    '核心主题：递归与栈的等价性',
    '分支 1：Base Case 边界防御清单',
    '分支 2：汉诺塔移动步数 2^n - 1 推导',
    '分支 3：@lru_cache 消除重复子问题',
  ]);
  const [newIdea, setNewIdea] = useState('');
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  const cycleStatus = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const next: GroupTask['status'] =
          t.status === 'todo' ? 'doing' : t.status === 'doing' ? 'done' : 'todo';
        return { ...t, status: next };
      })
    );
  };

  const addMindNode = () => {
    if (!newIdea.trim()) return;
    setMindNodes((prev) => [...prev, `新增灵感：${newIdea.trim()}`]);
    setNewIdea('');
  };

  const generateGroupSummary = () => {
    const doneCount = tasks.filter((t) => t.status === 'done').length;
    setAiSummary(
      `【AI 协作总结与建议】\n1. 当前小组已完成 ${doneCount}/${tasks.length} 项任务，白板共沉淀 ${mindNodes.length} 个思维导图节点。\n2. 优势亮点：林致远与苏念安在「递归转显式栈」和「汉诺塔代码实现」上推进迅速，理论与代码结合紧密。\n3. 协作改进建议：建议「周雨桐」尽早对接「陈明轩」整理的 3 道易错题素材，将反面案例融入课堂 BOSS 答辩环节；同时贡献度数据已全员透明公示，支持成员互相确认与反馈。`
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Users className="w-6 h-6 text-sky-600" />
            AI 小组协作空间（第 2 小组 · 递归攻坚队）
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            共享思维导图白板 · 任务分工进度 · 透明贡献度记录 · AI 讨论总结与成果建议 (PRD 第六章)
          </p>
        </div>

        <button
          onClick={generateGroupSummary}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5 shadow-md shadow-sky-500/20"
        >
          <Sparkles className="w-4 h-4" /> AI 一键总结讨论与建议
        </button>
      </div>

      {aiSummary && (
        <div className="rounded-2xl bg-sky-50 border border-sky-300 p-4 text-xs text-sky-950 whitespace-pre-line leading-relaxed flex items-start gap-3">
          <Bot className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
          <div>{aiSummary}</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6 glass-panel rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-800">小组共享思维导图白板（多人实时协作）</h3>
          <div className="rounded-xl bg-sky-50/60 border border-sky-200 p-4 space-y-2.5 min-h-[240px]">
            {mindNodes.map((node, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-xl border text-xs font-medium ${
                  idx === 0
                    ? 'bg-gradient-to-r from-sky-500 to-blue-600 border-sky-500 text-white font-bold shadow-sm'
                    : 'bg-white border-sky-100 text-slate-700 ml-5 shadow-xs'
                }`}
              >
                {idx === 0 ? '🧠 ' : '↳ '}
                {node}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newIdea}
              onChange={(e) => setNewIdea(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addMindNode()}
              placeholder="输入新的思维导图分支或讨论要点..."
              className="flex-1 px-3 py-2 rounded-xl bg-white border border-sky-200 text-xs text-slate-800 focus:outline-none focus:border-sky-500"
            />
            <button
              onClick={addMindNode}
              className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> 添加节点
            </button>
          </div>
        </div>

        <div className="lg:col-span-6 glass-panel rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">任务分工与透明贡献度</h3>
            <span className="text-[11px] text-slate-500">点击状态标签切换进度</span>
          </div>

          <div className="space-y-3">
            {tasks.map((t) => (
              <div
                key={t.id}
                className="p-3.5 rounded-xl bg-white border border-sky-100 space-y-2 shadow-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-800">{t.title}</div>
                  <button
                    onClick={() => cycleStatus(t.id)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border cursor-pointer shrink-0 ${
                      t.status === 'done'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : t.status === 'doing'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    {t.status === 'done' ? '✓ 已完成' : t.status === 'doing' ? '⏳ 进行中' : '○ 待开始'}
                  </button>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>负责人：{t.assignee}</span>
                  <span className="text-sky-700 font-mono font-semibold">过程贡献度 {t.contribution}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-sky-100 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-500 to-blue-600"
                    style={{ width: `${t.contribution * 2.5}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-sky-50/70 border border-sky-100 p-3 text-[11px] text-slate-600 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            透明评价机制 (PRD 第六章)：贡献度仅作过程参考，小组互评支持成员异议反馈与教师人工校准。
          </div>
        </div>
      </div>
    </div>
  );
};
