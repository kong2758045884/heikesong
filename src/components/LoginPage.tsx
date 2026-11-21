import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, GraduationCap, LockKeyhole } from 'lucide-react';
import { startSession, type Session } from '../services/authService';

const inputStyle = 'min-h-12 w-full rounded-xl border border-sky-200 bg-sky-50/60 px-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

export function LoginPage({ onSession }: { onSession: (session: Session) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const registering = mode === 'register';

  function switchMode(next: typeof mode) {
    setMode(next);
    setError('');
    setReveal(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      onSession(await startSession(mode, {
        username: String(fields.get('username') ?? '').trim(),
        password: String(fields.get('password') ?? ''),
        ...(registering && {
          displayName: String(fields.get('displayName') ?? '').trim(),
          role,
          ...(role === 'teacher' && { inviteCode: String(fields.get('inviteCode') ?? '').trim() }),
        }),
      }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '连接失败，请重试。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen workspace-shell overflow-y-auto bg-[#f2f7fd]">
      <div className="login-wrap mx-auto flex min-h-full max-w-[1080px] items-center justify-center px-4 py-6 sm:px-8">
        <div className="login-card grid w-full max-w-[470px] overflow-hidden rounded-[26px] border border-sky-200 bg-white shadow-[0_24px_75px_-44px_#1979ac77] md:max-w-none md:grid-cols-[1fr_1fr]">
          <section className="login-brand min-w-0 bg-sky-50 px-6 py-6 md:px-11 md:py-12">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-sky-600 text-white shadow-sm"><GraduationCap className="size-6" /></span>
              <div>
                <p className="text-xl font-bold tracking-tight text-slate-900">EduMind</p>
                <p className="text-xs text-slate-600">高校智慧教学平台</p>
              </div>
            </div>
            <div className="mt-12 hidden md:block">
              <p className="text-sm font-semibold text-sky-800">课堂与学习工作台</p>
              <h1 className="mt-3 max-w-[10em] text-4xl font-bold leading-[1.22] tracking-tight text-slate-900">从课堂签到到课后复习</h1>
              <p className="mt-5 max-w-[26em] text-sm leading-7 text-slate-600">使用课程账号进入教师、学生或管理工作台。登录后按账号权限开放课堂、签到和学习记录。</p>
            </div>
          </section>
          <section className="min-w-0 px-6 py-7 sm:px-9 md:px-11 md:py-12" aria-labelledby="login-title">
            <h2 id="login-title" className="text-2xl font-bold tracking-tight text-slate-900">{registering ? '创建 EduMind 账号' : '登录 EduMind'}</h2>
            <p className="mt-2 text-sm text-slate-600">{registering ? '选择账号身份并填写登录信息。' : '请使用你的账号和密码登录。'}</p>
            <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl border border-sky-100 bg-sky-50 p-1" role="group" aria-label="账号操作">
              {(['login', 'register'] as const).map((tab) => (
                <button key={tab} type="button" aria-pressed={mode === tab} disabled={busy} onClick={() => switchMode(tab)}
                  className={`min-h-10 rounded-lg text-sm font-semibold ${mode === tab ? 'bg-white text-sky-800 shadow-sm' : 'text-slate-600 hover:text-sky-800'}`}>
                  {tab === 'login' ? '登录' : '注册'}
                </button>
              ))}
            </div>
            <form onSubmit={handleSubmit} className="mt-5 grid gap-3.5">
              {registering && (
                <>
                  <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                    身份
                    <select className={inputStyle} value={role} onChange={(event) => setRole(event.target.value === 'teacher' ? 'teacher' : 'student')}>
                      <option value="student">学生</option>
                      <option value="teacher">教师</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                    显示名称（选填）
                    <input name="displayName" maxLength={48} autoComplete="nickname" className={inputStyle} placeholder="输入工作台显示的名称" />
                  </label>
                </>
              )}
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                账号
                <input name="username" required minLength={3} maxLength={40} autoComplete="username" autoCapitalize="none" className={inputStyle} placeholder="请输入账号" />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700" htmlFor="login-password">
                密码
                <span className="relative block">
                  <input id="login-password" name="password" type={reveal ? 'text' : 'password'} required maxLength={128} minLength={registering ? 8 : undefined}
                    autoComplete={registering ? 'new-password' : 'current-password'} className={inputStyle + ' pr-12'} placeholder={registering ? '至少 8 个字符' : '请输入密码'} />
                  <button type="button" aria-label={reveal ? '隐藏密码' : '显示密码'} aria-pressed={reveal} onClick={() => setReveal(!reveal)}
                    className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-slate-500 hover:text-sky-700">
                    {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </span>
              </label>
              {registering && role === 'teacher' && (
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  教师邀请码
                  <input name="inviteCode" type="password" required maxLength={128} className={inputStyle} placeholder="输入管理员发放的邀请码" />
                </label>
              )}
              {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
              <button type="submit" disabled={busy} className="mt-1 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-65">
                {busy ? '正在验证…' : registering ? '注册并进入工作台' : '登录工作台'} <ArrowRight className="size-4" />
              </button>
            </form>
            <p className="mt-5 flex items-center gap-1.5 text-xs text-slate-500"><LockKeyhole className="size-3.5" /> 登录后自动进入账号所属的工作台</p>
          </section>
        </div>
      </div>
    </main>
  );
}
