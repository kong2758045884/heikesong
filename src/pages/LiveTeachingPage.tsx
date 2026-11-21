import { useEffect, useState, type FormEvent } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Presentation,
  QrCode,
  Radio,
  Square,
} from 'lucide-react';
import { SlideContent } from '../components/SlideContent';
import { InvitationDialog, type Invitation } from '../components/InvitationDialog';
import { ClassroomQuestions } from '../components/ClassroomQuestions';
import {
  deckAsset,
  errorText,
  teaching,
  TeachingError,
  type Enrollment,
  type LessonBrief,
  type LiveLesson,
} from '../services/teachingService';
import type { NavPage, UserRole } from '../types';

const button =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-50';

export function LiveTeachingPage({
  role,
  preferredCourse,
  pendingInvite,
  onInviteUsed,
  onNavigate,
}: {
  role: UserRole;
  preferredCourse?: string;
  pendingInvite?: string;
  onInviteUsed: () => void;
  onNavigate: (page: NavPage) => void;
}) {
  const isTeacher = role === 'teacher';
  const [invitation, setInvitation] = useState<Invitation>();
  const [postedCode, setPostedCode] = useState<{ value: string; invite?: string }>();
  const [joining, setJoining] = useState(false);
  const [joinStatus, setJoinStatus] = useState('');
  const [joinError, setJoinError] = useState('');
  const [enrolled, setEnrolled] = useState<Enrollment[]>([]);
  const code = postedCode && postedCode.invite === pendingInvite ? postedCode.value : (pendingInvite ?? '');
  const [selectedCourse, setSelectedCourse] = useState(preferredCourse);
  const [items, setItems] = useState<LessonBrief[]>();
  const [lesson, setLesson] = useState<LiveLesson>();
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (busy || joining) return;
    const ctl = new AbortController();
    let timer: number | undefined;
    async function poll() {
      try {
        const [courses, owned] = await Promise.all([
          teaching<LessonBrief[]>('live', { signal: ctl.signal }),
          isTeacher ? [] : teaching<Enrollment[]>('enrolled', { signal: ctl.signal }),
        ]);
        const match = courses.some((entry) => entry.courseId === selectedCourse)
          ? selectedCourse
          : courses[0]?.courseId;
        const current = match ? await teaching<LiveLesson>('live/' + match, { signal: ctl.signal }) : undefined;
        if (ctl.signal.aborted) return;
        setItems(courses);
        setEnrolled(owned);
        setLesson(current);
        setError('');
      } catch (failure) {
        if (!ctl.signal.aborted) {
          const expired = failure instanceof TeachingError && failure.status === 404;
          if (expired) setLesson(undefined);
          setError(expired ? '这节课刚结束，正在刷新课堂列表。' : '暂时无法同步课堂，正在重连。');
        }
      } finally {
        if (!ctl.signal.aborted) timer = window.setTimeout(() => void poll(), 2500);
      }
    }
    void poll();
    return () => {
      ctl.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [busy, isTeacher, joining, selectedCourse]);

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^[0-9]{6}$/.test(code) || joining) return;
    setJoining(true);
    setJoinError('');
    setJoinStatus('');
    try {
      const entry = await teaching<Enrollment>('join', { method: 'POST', body: { code } });
      setSelectedCourse(entry.courseId);
      setPostedCode(undefined);
      setJoinStatus(
        entry.live
          ? '已加入「' + entry.courseName + '」的课堂。'
          : '已加入课程「' + entry.courseName + '」。老师开课后会自动显示。',
      );
      onInviteUsed();
    } catch (failure) {
      setJoinError(errorText(failure));
    } finally {
      setJoining(false);
    }
  }

  async function move(page: number) {
    if (!lesson) return;
    setBusy(true);
    setActionError('');
    try {
      setLesson(
        await teaching<LiveLesson>('live/' + lesson.courseId, { method: 'PUT', body: { id: lesson.id, page } }),
      );
    } catch (failure) {
      setActionError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!lesson || !window.confirm('结束本次授课？')) return;
    setBusy(true);
    setActionError('');
    try {
      await teaching('live/' + lesson.courseId + '?id=' + lesson.id, { method: 'DELETE' });
      setLesson(undefined);
      setItems((prior) => prior?.filter((entry) => entry.courseId !== lesson.courseId));
    } catch (failure) {
      setActionError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 sm:text-2xl">
            <Presentation className="size-5 text-sky-600" />
            实时课堂
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {isTeacher
              ? '用已上传的课件授课，翻页会同步到该班学生端。'
              : '跟随老师翻页，也可以针对正在讲授的内容提问。'}
          </p>
        </div>
        {isTeacher && (
          <div className="flex flex-wrap gap-2">
            {lesson?.joinCode && (
              <button
                className={button}
                onClick={() =>
                  setInvitation({
                    name: lesson.courseName,
                    code: lesson.joinCode!,
                    base: lesson.joinBaseUrl,
                    kind: '课堂',
                  })
                }
              >
                <QrCode className="size-4" />
                课堂加入码
              </button>
            )}
            <button className={button} onClick={() => onNavigate('courseware')}>
              <BookOpen className="size-4" />
              选择课件
            </button>
          </div>
        )}
      </header>
      {!isTeacher && (
        <form onSubmit={(event) => void join(event)} className="glass-panel rounded-2xl p-4">
          <label htmlFor="lesson-join-code" className="text-sm font-bold text-slate-900">
            使用六位加入码
          </label>
          {pendingInvite && <p className="mt-1 text-xs text-slate-600">扫码已填入加入码，确认后进入。</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id="lesson-join-code"
              value={code}
              onChange={(event) =>
                setPostedCode({
                  value: event.target.value.replace(/[^0-9]/g, '').slice(0, 6),
                  invite: pendingInvite,
                })
              }
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              placeholder="六位数字"
              className="min-h-10 min-w-0 flex-1 rounded-xl border border-sky-200 bg-white px-3 font-mono text-sm tracking-widest outline-none focus:ring-2 focus:ring-sky-200 sm:max-w-48"
            />
            <button
              disabled={code.length !== 6 || joining}
              className="min-h-10 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white disabled:opacity-55"
            >
              {joining ? '加入中…' : '加入'}
            </button>
          </div>
          {joinError && (
            <p className="mt-2 text-sm text-rose-700" role="alert">
              {joinError}
            </p>
          )}
          {joinStatus && (
            <p className="mt-2 text-sm text-emerald-800" role="status">
              {joinStatus}
            </p>
          )}
        </form>
      )}
      {isTeacher && pendingInvite && (
        <p className="rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm text-slate-700">
          此邀请供学生使用。可退出后使用学生账号加入。
        </p>
      )}
      {invitation && <InvitationDialog invitation={invitation} onClose={() => setInvitation(undefined)} />}
      {(error || actionError) && (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {actionError || error}
        </p>
      )}
      {items && items.length > 1 && (
        <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
          正在进行的课堂
          <select
            value={lesson?.courseId ?? ''}
            onChange={(event) => {
              setSelectedCourse(event.target.value);
              setLesson(undefined);
            }}
            className="min-h-10 max-w-full rounded-lg border border-sky-200 bg-white px-3"
          >
            {!lesson && <option value="">正在加载…</option>}
            {items.map((item) => (
              <option key={item.id} value={item.courseId}>
                {item.courseName} · {item.className}
              </option>
            ))}
          </select>
        </label>
      )}
      {lesson ? (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
          <div className="min-w-0 space-y-3">
            <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
              <div>
                <p className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                  <Radio className="size-3.5" />
                  授课中
                </p>
                <h2 className="text-lg font-bold">{lesson.deckTitle}</h2>
                <p className="mt-0.5 text-sm text-slate-600">
                  {lesson.courseName} · {lesson.className}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isTeacher ? (
                  <>
                    <button
                      aria-label="上一页"
                      className={button}
                      disabled={busy || lesson.page <= 1}
                      onClick={() => void move(lesson.page - 1)}
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <label className="sr-only" htmlFor="lecture-page">
                      当前授课页
                    </label>
                    <select
                      id="lecture-page"
                      className="min-h-10 rounded-xl border border-sky-200 bg-white px-2 text-sm font-medium"
                      value={lesson.page}
                      disabled={busy}
                      onChange={(event) => void move(Number(event.target.value))}
                    >
                      {Array.from({ length: lesson.total }, (_, i) => (
                        <option key={i} value={i + 1}>
                          第 {i + 1} 页
                        </option>
                      ))}
                    </select>
                    <button
                      aria-label="下一页"
                      className={button}
                      disabled={busy || lesson.page >= lesson.total}
                      onClick={() => void move(lesson.page + 1)}
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </>
                ) : (
                  <p className="rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-800">
                    第 {lesson.page} / {lesson.total} 页
                  </p>
                )}
              </div>
            </div>
            <SlideContent deckId={lesson.deckId} slide={lesson.slide} />
          </div>
          <aside className={'min-w-0 space-y-4 self-start ' + (isTeacher ? '' : 'order-first lg:order-none')}>
            <ClassroomQuestions
              key={lesson.id}
              lesson={lesson}
              teacher={isTeacher}
              busy={busy}
              onPage={(page) => void move(page)}
            />
            <div className="glass-panel rounded-2xl p-4">
              <h2 className="text-base font-bold">本页知识点</h2>
              <p className="mt-1 text-xs text-slate-600">{lesson.topicMode}</p>
              <div className="my-3 grid gap-2">
                {lesson.topics.map((topic, index) => (
                  <section className="rounded-xl border border-sky-100 bg-sky-50/60 p-3" key={index}>
                    <h3 className="text-sm font-semibold">{topic.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-700">{topic.summary}</p>
                  </section>
                ))}
                {lesson.topics.length === 0 && <p className="text-sm text-slate-600">这一页暂未关联知识点。</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a href={deckAsset(lesson.deckId, 'file')} className={button}>
                  <FileDown className="size-4" />
                  下载原课件
                </a>
                {isTeacher && (
                  <button className={button + ' text-rose-700'} disabled={busy} onClick={() => void finish()}>
                    <Square className="size-4" />
                    结束授课
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl p-6">
          <h2 className="text-base font-bold">{items ? '暂无进行中的课堂' : '正在查找课堂…'}</h2>
          {items && (
            <p className="mt-2 text-sm text-slate-600">
              {isTeacher
                ? '进入课件管理，挑选一份上传的课件开始授课。'
                : '老师开课后，关联班级的课堂会自动显示在这里。'}
            </p>
          )}
        </div>
      )}
      {!isTeacher && enrolled.length > 0 && (
        <section className="glass-panel rounded-2xl p-4">
          <h2 className="text-base font-bold">我的课程</h2>
          <ul className="mt-2 space-y-2">
            {enrolled.map((course) => (
              <li
                key={course.courseId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-100 px-3 py-2 text-sm"
              >
                <div>
                  <strong>{course.courseName}</strong>
                  <p className="text-xs text-slate-600">{course.className}</p>
                </div>
                {course.live ? (
                  <button type="button" className={button} onClick={() => setSelectedCourse(course.courseId)}>
                    进入课堂
                  </button>
                ) : (
                  <span className="text-xs text-slate-600">等待开课</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
