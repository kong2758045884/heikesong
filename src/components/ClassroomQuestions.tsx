import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { errorText, teaching, type LiveLesson } from '../services/teachingService';
import '../pages/lesson.css';

interface Question {
  id: string;
  student: string;
  page: number;
  text: string;
  createdAt: string;
  answer?: string;
}

export function ClassroomQuestions({ lesson, teacher, busy, onPage }: {
  lesson: LiveLesson;
  teacher: boolean;
  busy: boolean;
  onPage: (page: number) => void;
}) {
  const [questions, setQuestions] = useState<Question[]>();
  const [draft, setDraft] = useState('');
  const [draftPage, setDraftPage] = useState<number>();
  const [reply, setReply] = useState<{ id: string; text: string }>();
  const [sending, setSending] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [feedback, setFeedback] = useState('');
  const version = useRef(0);
  const endpoint = 'live/' + lesson.courseId + '/questions';
  const lessonId = lesson.id;

  useEffect(() => {
    const abort = new AbortController();
    let timer: number | undefined;
    async function poll() {
      const current = version.current;
      try {
        const next = await teaching<Question[]>(endpoint + '?lesson=' + lessonId, { signal: abort.signal });
        if (!abort.signal.aborted && current === version.current) {
          setQuestions(next);
          setSyncError('');
        }
      } catch {
        if (!abort.signal.aborted && current === version.current) setSyncError('提问列表暂时无法同步，正在重连。');
      } finally {
        if (!abort.signal.aborted) timer = window.setTimeout(poll, 2500);
      }
    }
    void poll();
    return () => { abort.abort(); window.clearTimeout(timer); };
  }, [endpoint, lessonId]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const text = (teacher ? reply?.text : draft)?.trim();
    if (!text) return;
    setSending(true);
    setSubmitError('');
    setFeedback('');
    try {
      const next = await teaching<Question>(reply ? endpoint + '/' + reply.id : endpoint, {
        method: reply ? 'PUT' : 'POST',
        body: { lessonId, text, page: draftPage ?? lesson.page },
      });
      version.current++;
      setQuestions(previous => previous?.some(item => item.id === next.id)
        ? previous.map(item => item.id === next.id ? next : item)
        : [...(previous ?? []), next]);
      setDraft('');
      setDraftPage(undefined);
      setReply(undefined);
      setFeedback(teacher ? '回复已发送。' : '问题已发给教师。');
    } catch (error) {
      setSubmitError(errorText(error));
    } finally {
      setSending(false);
    }
  }

  const unanswered = questions?.filter(question => !question.answer).length;
  return <section className="lesson-workspace lesson-panel space-y-4" aria-label={teacher ? '学生提问' : '课堂提问'}>
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2"><MessageSquare size={18} className="text-sky-600" />{teacher ? '学生提问' : '课堂提问'}</h2>
      {teacher && unanswered !== undefined && <span className="lesson-status">{unanswered} 条待回复</span>}
    </header>
    {!teacher && <form className="space-y-2.5" onSubmit={send}>
      <label className="block">向老师提问 · 第 {draftPage ?? lesson.page} 页
        <textarea rows={3} required maxLength={600} disabled={sending} value={draft} placeholder="写下你想请老师讲解的问题"
          onChange={event => {
            setDraft(event.target.value);
            setDraftPage(event.target.value ? draftPage ?? lesson.page : undefined);
            setFeedback('');
          }} />
      </label>
      <button className="lesson-primary" disabled={sending || !draft.trim()}><Send size={15} />发送给教师</button>
    </form>}
    {(syncError || submitError) && <p role="alert">{submitError || syncError}</p>}
    {feedback && <p role="status">{feedback}</p>}
    <div className="space-y-2">
      {!questions && !syncError && <p className="text-slate-500">正在加载提问…</p>}
      {questions?.length === 0 && <p className="text-slate-500">{teacher ? '还没有学生提问。' : '你还没有提问。'}</p>}
      {questions?.slice().reverse().sort((a,b) => teacher ? Number(!!a.answer) - Number(!!b.answer) : 0).map(question => <article key={question.id} className="space-y-2 rounded-xl border border-sky-100 bg-sky-50/35 p-3">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-slate-600">{teacher && question.student + ' · '}第 {question.page} 页</p>
          <span className="lesson-status">{question.answer ? '已回复' : '待回复'}</span>
        </header>
        <p className="whitespace-pre-wrap">{question.text}</p>
        {question.answer && <div className="rounded-lg bg-white p-2.5">
          <h3 className="text-sm text-sky-800">教师回复</h3><p className="whitespace-pre-wrap">{question.answer}</p>
        </div>}
        {teacher && <div className="flex flex-wrap gap-2">
          {question.page !== lesson.page && <button disabled={busy} onClick={() => onPage(question.page)}>讲到第 {question.page} 页</button>}
          {!question.answer && reply?.id !== question.id && <button disabled={!!reply || sending} onClick={() => { setReply({ id: question.id, text: '' }); setFeedback(''); setSubmitError(''); }}>回复</button>}
        </div>}
        {teacher && !question.answer && reply?.id === question.id && <form className="space-y-2" onSubmit={send}>
          <label className="block">回复给 {question.student}
            <textarea required maxLength={1200} rows={3} disabled={sending} value={reply.text}
              onChange={event => setReply({ id: question.id, text: event.target.value })} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="lesson-primary" disabled={sending || !reply.text.trim()}>发送回复</button>
            <button type="button" disabled={sending} onClick={() => { setReply(undefined); setSubmitError(''); }}>取消</button>
          </div>
        </form>}
      </article>)}
    </div>
  </section>;
}
