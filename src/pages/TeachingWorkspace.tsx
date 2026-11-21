import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  BookOpen,
  ClipboardList,
  FileText,
  Play,
  Plus,
  QrCode,
  Sparkles,
  UploadCloud,
  Users,
  X,
} from 'lucide-react';
import { SlideContent } from '../components/SlideContent';
import { InvitationDialog, type Invitation } from '../components/InvitationDialog';
import {
  deckAsset,
  errorText,
  teaching,
  type DeckBrief,
  type TeachingClass,
  type TeachingCourse,
  type TeachingDeck,
  type TeachingWorkspaceData,
  type Topic,
} from '../services/teachingService';
import type { NavPage } from '../types';

type ManagementPage = 'classes' | 'courses' | 'courseware';
type Editor = { type: 'class'; value?: TeachingClass } | { type: 'course'; value?: TeachingCourse };
const primary =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-55';
const secondary =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-55';
const field =
  'min-h-11 w-full min-w-0 rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:ring-2 focus:ring-sky-200';
const panel = 'glass-panel min-w-0 rounded-2xl p-4 sm:p-5';
const copy = {
  classes: {
    title: '班级管理',
    desc: '维护授课班级与学生名单，学生账号加入名单后可进入本班课堂。',
    icon: Users,
  },
  courses: {
    title: '课程管理',
    desc: '把课程关联到授课班级，在同一门课下整理课件和授课进度。',
    icon: BookOpen,
  },
  courseware: {
    title: '课件管理',
    desc: '上传课件、审核每页的知识点，然后用这份课件开课。',
    icon: ClipboardList,
  },
};

export function TeachingWorkspace({
  page,
  initialCourseId,
  onNavigate,
  onManageCourse,
  onTeach,
}: {
  page: ManagementPage;
  initialCourseId?: string;
  onNavigate: (page: NavPage) => void;
  onManageCourse: (courseId: string) => void;
  onTeach: (courseId: string) => void;
}) {
  const [data, setData] = useState<TeachingWorkspaceData>();
  const [editor, setEditor] = useState<Editor>();
  const [invitation, setInvitation] = useState<Invitation>();
  const [selected, setSelected] = useState<TeachingDeck>();
  const [courseFilter, setCourseFilter] = useState(initialCourseId ?? '');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const upload = useRef<HTMLInputElement>(null);

  async function refresh(signal?: AbortSignal) {
    const next = await teaching<TeachingWorkspaceData>('workspace', { signal });
    if (!signal?.aborted) setData(next);
  }

  useEffect(() => {
    const abort = new AbortController();
    function reload() {
      void refresh(abort.signal).catch((failure) => {
        if (!abort.signal.aborted) setError(errorText(failure));
      });
    }
    reload();
    window.addEventListener('edumind-model-change', reload);
    return () => {
      abort.abort();
      window.removeEventListener('edumind-model-change', reload);
    };
  }, []);

  useEffect(() => {
    if (editor) dialog.current?.showModal();
  }, [editor]);

  async function perform(action: string, run: () => Promise<void>, message = '') {
    setBusy(action);
    setError('');
    setHint('');
    try {
      await run();
      setHint(message);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy('');
    }
  }

  function saveEntity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const form = new FormData(event.currentTarget);
    const isClass = editor.type === 'class';
    const id = editor.value?.id;
    const body = isClass
      ? {
          name: form.get('name'),
          term: form.get('term'),
          students: String(form.get('students') ?? '')
            .split(/[\s,，、;；]+/)
            .filter(Boolean),
        }
      : { name: form.get('name'), classId: form.get('classId'), description: form.get('description') };
    void perform(
      'save',
      async () => {
        await teaching((isClass ? 'classes' : 'courses') + (id ? '/' + id : ''), {
          method: id ? 'PUT' : 'POST',
          body,
        });
        dialog.current?.close();
        setEditor(undefined);
        await refresh();
      },
      '已保存。',
    );
  }

  function deleteEntity(path: string, name: string) {
    if (!window.confirm('删除「' + name + '」？')) return;
    void perform(
      'delete',
      async () => {
        await teaching(path, { method: 'DELETE' });
        if (path === 'decks/' + selected?.id) setSelected(undefined);
        await refresh();
      },
      '已删除。',
    );
  }

  function uploadDeck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const file = upload.current?.files?.[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setError('请选择 12 MiB 以内的课件。');
      return;
    }
    const body = new FormData();
    body.append('file', file);
    const courseId = String(fields.get('courseId'));
    void perform(
      'upload',
      async () => {
        const deck = await teaching<TeachingDeck>('courses/' + courseId + '/decks', { method: 'POST', body });
        setCourseFilter(courseId);
        setSelected(deck);
        if (upload.current) upload.current.value = '';
        await refresh();
      },
      '课件已上传，知识点已按页提取。',
    );
  }

  const InfoIcon = copy[page].icon;
  const classes = data?.classes ?? [];
  const courses = data?.courses ?? [];
  const uploadCourse = courses.some((course) => course.id === courseFilter)
    ? courseFilter
    : courses.length === 1
      ? courses[0].id
      : '';
  const decks = data?.decks.filter((deck) => !uploadCourse || deck.courseId === uploadCourse) ?? [];
  const selectedClass = editor?.type === 'class' ? editor.value : undefined;
  const selectedCourse = editor?.type === 'course' ? editor.value : undefined;
  const deckKey = selected
    ? JSON.stringify([selected.id, selected.title, selected.topicMode, selected.topics])
    : '';

  function showDeck(deck: DeckBrief) {
    void perform('open', async () => setSelected(await teaching<TeachingDeck>('decks/' + deck.id)));
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 sm:text-2xl">
            <InfoIcon className="size-5 text-sky-600" /> {copy[page].title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{copy[page].desc}</p>
        </div>
        {page === 'classes' && (
          <button className={primary} onClick={() => setEditor({ type: 'class' })}>
            <Plus className="size-4" />
            新建班级
          </button>
        )}
        {page === 'courses' && (
          <button
            className={primary}
            onClick={() => (classes.length ? setEditor({ type: 'course' }) : onNavigate('classes'))}
          >
            <Plus className="size-4" />
            {classes.length ? '新建课程' : '去创建班级'}
          </button>
        )}
      </header>
      {!data && (
        <div className={panel}>
          <p className="text-sm text-slate-600">{error || '正在加载教学资料…'}</p>
          {error && (
            <button className={secondary + ' mt-3'} onClick={() => void perform('load', () => refresh())}>
              重新加载
            </button>
          )}
        </div>
      )}
      {data && error && !editor && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </p>
      )}
      {hint && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {hint}
        </p>
      )}

      {data && page === 'classes' && (
        <div className="grid gap-3 xl:grid-cols-2">
          {classes.map((item) => (
            <section className={panel} key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{item.name}</h2>
                  <p className="mt-1 text-xs text-slate-600">
                    {item.term || '学期未填写'} · {item.roster.length} 位学生 ·{' '}
                    {courses.filter((course) => course.classId === item.id).length} 门课程
                  </p>
                </div>
                <button className={secondary} onClick={() => setEditor({ type: 'class', value: item })}>
                  编辑名单
                </button>
              </div>
              <div className="my-4 flex max-h-44 flex-wrap content-start gap-2 overflow-y-auto">
                {item.roster.map((student) => (
                  <span
                    key={student.username}
                    className="max-w-full rounded-lg bg-sky-50 px-2.5 py-1 text-xs text-slate-700"
                  >
                    {student.displayName} · {student.username}
                  </span>
                ))}
                {item.roster.length === 0 && <p className="text-sm text-slate-500">班级暂无学生。</p>}
              </div>
              <button
                disabled={!!busy}
                className="text-xs font-medium text-rose-700"
                onClick={() => deleteEntity('classes/' + item.id, item.name)}
              >
                删除班级
              </button>
            </section>
          ))}
          {!classes.length && (
            <div className={panel + ' xl:col-span-2'}>
              <p className="text-sm text-slate-600">还没有班级。创建班级后，可用已注册的学生账号维护名单。</p>
            </div>
          )}
        </div>
      )}

      {data && page === 'courses' && (
        <div className="grid gap-3 xl:grid-cols-2">
          {courses.map((item) => (
            <section className={panel} key={item.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{item.name}</h2>
                  <p className="mt-1 text-xs text-slate-600">
                    {classes.find((entry) => entry.id === item.classId)?.name} ·{' '}
                    {data.decks.filter((deck) => deck.courseId === item.id).length} 份课件
                  </p>
                </div>
                <button className={secondary} onClick={() => setEditor({ type: 'course', value: item })}>
                  编辑课程
                </button>
              </div>
              <p className="my-4 whitespace-pre-wrap text-sm text-slate-700">
                {item.description || '暂无课程简介。'}
              </p>
              {!!Object.keys(item.enrolled ?? {}).length && (
                <details className="mb-4 rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2 text-xs text-slate-700">
                  <summary className="cursor-pointer font-medium">
                    通过课程邀请加入 · {Object.keys(item.enrolled ?? {}).length} 人
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {Object.values(item.enrolled ?? {}).map((entry) => (
                      <li key={entry.username}>
                        {entry.displayName} · {entry.username}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="flex flex-wrap items-center gap-4">
                <button className={primary} onClick={() => onManageCourse(item.id)}>
                  管理课件
                </button>
                <button
                  className={secondary}
                  onClick={() =>
                    setInvitation({
                      name: item.name,
                      code: item.joinCode,
                      base: data.joinBaseUrl,
                      kind: '课程',
                    })
                  }
                  disabled={!item.joinCode}
                >
                  <QrCode className="size-4" />
                  邀请学生
                </button>
                <button
                  disabled={!!busy}
                  className="text-xs font-medium text-rose-700"
                  onClick={() => deleteEntity('courses/' + item.id, item.name)}
                >
                  删除课程
                </button>
              </div>
            </section>
          ))}
          {!courses.length && (
            <div className={panel + ' xl:col-span-2'}>
              <p className="text-sm text-slate-600">创建课程时需选择一个授课班级。</p>
            </div>
          )}
        </div>
      )}

      {data && page === 'courseware' && (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(240px,0.85fr)_minmax(0,1.7fr)]">
          <aside className={panel + ' self-start'}>
            <h2 className="text-base font-bold">上传课件</h2>
            {courses.length ? (
              <form onSubmit={uploadDeck} className="mt-3 space-y-3">
                <label htmlFor="upload-course" className="block space-y-1.5 text-sm font-semibold">
                  <span>课程</span>
                  <select
                    id="upload-course"
                    name="courseId"
                    required
                    className={field}
                    value={uploadCourse}
                    onChange={(event) => {
                      setCourseFilter(event.target.value);
                      setSelected(undefined);
                    }}
                  >
                    <option value="">选择授课课程</option>
                    {courses.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1.5 text-sm font-semibold">
                  <span>课件文件</span>
                  <input
                    ref={upload}
                    name="file"
                    type="file"
                    required
                    accept=".pptx,.pdf,.txt,.md"
                    className="block w-full min-w-0 rounded-xl border border-dashed border-sky-300 bg-sky-50 p-2 text-xs text-slate-700 file:mr-2 file:rounded-md file:border-0 file:bg-white file:px-2 file:py-1 file:font-semibold file:text-sky-700"
                  />
                </label>
                <p className="text-xs leading-5 text-slate-600">
                  PPTX、PDF、TXT 或 Markdown，最大 12 MiB。PDF 需有可选中文字。
                </p>
                <button className={primary} disabled={!!busy || !uploadCourse}>
                  <UploadCloud className="size-4" />
                  {busy === 'upload' ? '正在提取…' : '上传并提取'}
                </button>
              </form>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-slate-600">请先创建课程。</p>
                <button className={secondary} onClick={() => onNavigate('courses')}>
                  去课程管理
                </button>
              </div>
            )}
            <div className="mt-5 border-t border-sky-100 pt-4">
              <h3 className="text-sm font-bold">课件库 · {decks.length}</h3>
              <div className="mt-2 grid max-h-[420px] gap-2 overflow-y-auto">
                {decks.map((deck) => (
                  <button
                    type="button"
                    key={deck.id}
                    disabled={!!busy}
                    onClick={() => showDeck(deck)}
                    aria-pressed={selected?.id === deck.id}
                    className={
                      'flex min-w-0 items-center gap-2 rounded-xl border p-2.5 text-left ' +
                      (selected?.id === deck.id ? 'border-sky-400 bg-sky-50' : 'border-sky-100 hover:bg-sky-50')
                    }
                  >
                    <FileText className="size-4 shrink-0 text-sky-600" />
                    <span className="min-w-0">
                      <strong className="block break-words text-sm">{deck.title}</strong>
                      <small className="text-slate-600">
                        {deck.pageCount} 页 · {deck.topicCount} 个知识点
                      </small>
                    </span>
                  </button>
                ))}
                {!decks.length && <p className="text-sm text-slate-500">暂无课件。</p>}
              </div>
            </div>
          </aside>

          {selected ? (
            <DeckReview
              key={deckKey}
              deck={selected}
              busy={busy}
              aiAvailable={data.aiAvailable}
              onIdentify={() =>
                void perform(
                  'ai',
                  async () => {
                    setSelected(
                      await teaching<TeachingDeck>('decks/' + selected.id + '/identify', { method: 'POST' }),
                    );
                    await refresh();
                  },
                  '已生成带页码的知识点，请核对后使用。',
                )
              }
              onSave={(title, topics) =>
                void perform(
                  'topics',
                  async () => {
                    setSelected(
                      await teaching<TeachingDeck>('decks/' + selected.id, {
                        method: 'PUT',
                        body: { title, topics },
                      }),
                    );
                    await refresh();
                  },
                  '课件与知识点已保存。',
                )
              }
              onStart={(startPage) =>
                void perform('start', async () => {
                  await teaching('live', { method: 'POST', body: { deckId: selected.id, page: startPage } });
                  onTeach(selected.courseId);
                })
              }
              onDelete={() => deleteEntity('decks/' + selected.id, selected.title)}
            />
          ) : (
            <div className={panel + ' grid min-h-52 place-content-center text-center'}>
              <FileText className="mx-auto mb-3 size-8 text-sky-500" />
              <p className="text-sm text-slate-600">上传或选择一份课件以查看知识点和授课预览。</p>
            </div>
          )}
        </div>
      )}

      {invitation && <InvitationDialog invitation={invitation} onClose={() => setInvitation(undefined)} />}
      {editor && (
        <dialog
          ref={dialog}
          onClose={() => {
            setEditor(undefined);
            setError('');
          }}
          aria-labelledby="teaching-editor-title"
          className="workspace-settings m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-2xl border border-sky-200 bg-white p-5 shadow-2xl backdrop:bg-slate-900/35"
        >
          <form onSubmit={saveEntity} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 id="teaching-editor-title" className="text-lg font-bold">
                {editor.value ? '编辑' : '新建'}
                {editor.type === 'class' ? '班级' : '课程'}
              </h2>
              <button type="button" aria-label="关闭编辑器" onClick={() => dialog.current?.close()}>
                <X className="size-5" />
              </button>
            </div>
            <label className="block space-y-1.5 text-sm font-semibold">
              <span>名称</span>
              <input
                name="name"
                required
                className={field}
                maxLength={editor.type === 'class' ? 80 : 100}
                defaultValue={editor.value?.name}
              />
            </label>
            {editor.type === 'class' ? (
              <>
                <label className="block space-y-1.5 text-sm font-semibold">
                  <span>学期</span>
                  <input
                    name="term"
                    className={field}
                    maxLength={60}
                    defaultValue={selectedClass?.term}
                    placeholder="例如 2026 秋季"
                  />
                </label>
                <label className="block space-y-1.5 text-sm font-semibold">
                  <span>学生账号</span>
                  <textarea
                    name="students"
                    rows={4}
                    className={field}
                    placeholder="输入已注册的学生账号，每行一个"
                    defaultValue={selectedClass?.roster.map((entry) => entry.username).join('\n')}
                  />
                </label>
              </>
            ) : (
              <>
                <label className="block space-y-1.5 text-sm font-semibold">
                  <span>授课班级</span>
                  <select
                    name="classId"
                    className={field}
                    required
                    defaultValue={selectedCourse?.classId ?? ''}
                  >
                    <option value="">选择班级</option>
                    {classes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1.5 text-sm font-semibold">
                  <span>课程简介</span>
                  <textarea
                    name="description"
                    className={field}
                    rows={4}
                    maxLength={1000}
                    defaultValue={selectedCourse?.description}
                  />
                </label>
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-rose-700">
                {error}
              </p>
            )}
            <button disabled={!!busy} className={primary}>
              {busy === 'save' ? '保存中…' : '保存'}
            </button>
          </form>
        </dialog>
      )}
    </div>
  );
}

function DeckReview({
  deck,
  busy,
  aiAvailable,
  onSave,
  onStart,
  onIdentify,
  onDelete,
}: {
  deck: TeachingDeck;
  busy: string;
  aiAvailable: boolean;
  onSave: (title: string, topics: Topic[]) => void;
  onStart: (page: number) => void;
  onIdentify: () => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(deck.title);
  const [topics, setTopics] = useState(deck.topics);
  const [page, setPage] = useState(1);
  const preview = useRef<HTMLElement>(null);
  const dirty = title !== deck.title || JSON.stringify(topics) !== JSON.stringify(deck.topics);
  const update = (index: number, patch: Partial<Topic>) =>
    setTopics((old) => old.map((topic, i) => (i === index ? { ...topic, ...patch } : topic)));
  return (
    <div className="min-w-0 space-y-4">
      <section className={panel + ' flex flex-wrap items-center justify-between gap-3'}>
        <div className="min-w-0">
          <h2 className="break-words text-lg font-bold">{deck.title}</h2>
          <p className="mt-1 text-xs text-slate-600">
            {deck.pages.length} 页 · 从第 {page} 页开始讲解
          </p>
          {dirty && <p className="mt-1 text-xs text-amber-800">请先保存知识点改动。</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={secondary}
            onClick={() => preview.current?.scrollIntoView({ block: 'start' })}
          >
            预览课件
          </button>
          <button type="button" className={primary} disabled={!!busy || dirty} onClick={() => onStart(page)}>
            <Play className="size-4" />
            开始授课
          </button>
        </div>
      </section>
      <section className={panel}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave(title, topics);
          }}
          className="space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">审核知识点</h2>
              <p className="mt-1 text-xs text-slate-600">
                {deck.topicMode} · {deck.pages.length} 页
              </p>
            </div>
            <button
              type="button"
              disabled={!!busy || !aiAvailable || dirty}
              className={secondary}
              onClick={onIdentify}
            >
              <Sparkles className="size-4" />
              {busy === 'ai' ? '模型识别中…' : 'AI 识别知识点'}
            </button>
          </div>
          {!aiAvailable && (
            <p className="text-xs text-slate-500">在右上角启用模型后，可对本课件运行 AI 识别。</p>
          )}
          <label className="block space-y-1.5 text-sm font-semibold">
            <span>课件标题</span>
            <input
              className={field}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={140}
            />
          </label>
          {topics.length === 0 && (
            <p className="text-sm text-slate-600">这份课件暂未生成知识点，可以手动添加。</p>
          )}
          <div className="grid max-h-[440px] gap-2 overflow-y-auto">
            {topics.map((topic, index) => (
              <div className="space-y-2 rounded-xl border border-sky-100 bg-sky-50/60 p-2.5" key={index}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
                  <input
                    aria-label={'知识点 ' + (index + 1)}
                    className={field}
                    required
                    maxLength={120}
                    value={topic.title}
                    onChange={(event) => update(index, { title: event.target.value })}
                  />
                  <select
                    aria-label={'知识点 ' + (index + 1) + ' 对应页'}
                    className={field + ' w-auto'}
                    value={topic.page}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      update(index, { page: value });
                      setPage(value);
                    }}
                  >
                    {deck.pages.map((slide, i) => (
                      <option key={slide.id} value={i + 1}>
                        第 {i + 1} 页
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={'移除知识点 ' + (index + 1)}
                    className="p-1.5 text-rose-600"
                    onClick={() => setTopics((old) => old.filter((_, i) => i !== index))}
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <textarea
                  aria-label={'知识点 ' + (index + 1) + ' 摘要'}
                  className={field}
                  rows={2}
                  maxLength={450}
                  value={topic.summary}
                  onChange={(event) => update(index, { summary: event.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={secondary}
              disabled={topics.length >= 60 || !!busy}
              onClick={() => setTopics([...topics, { title: '', summary: '', page }])}
            >
              添加知识点
            </button>
            <button className={primary} disabled={!!busy || !dirty}>
              保存审核结果
            </button>
          </div>
        </form>
      </section>
      <section ref={preview} className={panel + ' scroll-mt-3 space-y-3'}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold">课件预览</h2>
          <label className="flex items-center gap-2 text-sm">
            <span>预览页</span>
            <select
              className={field + ' w-auto'}
              value={page}
              onChange={(event) => setPage(Number(event.target.value))}
            >
              {deck.pages.map((entry, index) => (
                <option key={entry.id} value={index + 1}>
                  第 {index + 1} 页
                </option>
              ))}
            </select>
          </label>
        </div>
        <SlideContent deckId={deck.id} slide={deck.pages[page - 1]} />
        <div className="flex flex-wrap gap-2">
          <a className={secondary} href={deckAsset(deck.id, 'file')}>
            下载原课件
          </a>
          <button className="px-2 text-sm font-medium text-rose-700" disabled={!!busy} onClick={onDelete}>
            删除课件
          </button>
        </div>
      </section>
    </div>
  );
}
