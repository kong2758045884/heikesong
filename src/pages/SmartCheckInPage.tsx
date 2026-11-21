import { useEffect, useState, type FormEvent } from 'react';
import { Camera, ClipboardCheck, Hand, Radio } from 'lucide-react';
import { attendancePost, type AttendanceEntry, type AttendanceRound, type AttendanceRules, type AttendanceState } from '../services/attendanceService';
import { apiRequest, errorText, teaching, type TeachingClass, type TeachingWorkspaceData } from '../services/teachingService';
import { GESTURE_LABELS, type DetectedGestureId } from '../services/gestures';
import type { NavPage, UserRole } from '../types';
import { AttendancePhoto } from './AttendancePhoto';
import './lesson.css';

const statusText = { verified:'已签到', late:'迟到已签', pending:'待教师复核', rejected:'未通过' };
const methodText = { code:'现场口令', manual:'现场人工核验', camera:'摄像头拍摄', upload:'上传照片' };
const formatTime = (value: string) => new Date(value).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const targets = ['v','thumb','ok','heart'] as const;
const labelGesture = (id: string) => GESTURE_LABELS[id as DetectedGestureId] || '设备未完成识别';

export function SmartCheckInPage({ role, state, onNavigate }: {
  role: UserRole;
  state: AttendanceState;
  onNavigate: (page: NavPage) => void;
}) {
  const teacher = role === 'teacher';
  const [selection, setSelection] = useState('');
  const [code,setCode] = useState('');
  const [rules,setRules] = useState<AttendanceRules>({classId:'',title:'',minutes:10,gesture:'v',teacherInFrame:false,boardInFrame:false,cameraOnly:true,allowCode:false});
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [classes, setClasses] = useState<TeachingClass[]>();
  const [classError, setClassError] = useState('');
  const [classAttempt, setClassAttempt] = useState(0);
  const active = state.rounds.find(r => !r.closed);
  const round = state.rounds.find(r => r.id === selection) ?? active ?? state.rounds[0];
  const selectedClass = classes?.find(item => item.id === rules.classId);
  const submittedUsers = new Set(round?.entries.map(entry => entry.username));
  const missing = round?.roster?.filter(student => !submittedUsers.has(student.username));

  useEffect(() => {
    if (!teacher) return;
    const abort = new AbortController();
    teaching<TeachingWorkspaceData>('workspace', { signal: abort.signal })
      .then(data => { if (!abort.signal.aborted) setClasses(data.classes); })
      .catch(failure => { if (!abort.signal.aborted) setClassError(errorText(failure)); });
    return () => abort.abort();
  }, [teacher, classAttempt]);
  async function act(path: string, body: object = {}) {
    setBusy(true); setError('');
    try {const next=await attendancePost(path,body); state.accept(next); setSelection(next.id); setCode('');}
    catch(e){setError(errorText(e));}
    finally{setBusy(false);}
  }
  function handleForm(e: FormEvent) {
    e.preventDefault();
    if (teacher && !selectedClass?.roster.length) return;
    void act(teacher ? 'rounds' : 'join',teacher ? rules : {code});
  }
  return <main className="lesson-workspace space-y-5">
    <header><h1 className="flex items-center gap-2"><Camera className="text-sky-600" />智能签到</h1>
      <p className="mt-1 text-slate-600">{teacher ? '选择本节授课班级，再将签到码发给该班学生。' : '查看本班签到场次，输入教师提供的现场签到码。'}</p></header>
    {(error || state.error) && <p role="alert">{error || state.error}</p>}
    <div className="grid gap-4 lg:grid-cols-[minmax(245px,.8fr)_minmax(0,1.7fr)]">
      <aside className="space-y-4">
        {teacher && active ? <section className="lesson-panel space-y-3">
          <h2 className="flex items-center gap-2"><Radio size={18} />正在签到</h2><p>{active.className} · {active.title}</p>
          <strong className="block font-mono text-3xl tracking-widest text-sky-800" aria-label="本场签到码">{active.code}</strong>
          <p>准时截止 {formatTime(active.onTime)}<br/>迟到补签至 {formatTime(active.ends)}</p>
          <button disabled={busy} onClick={()=>{if(window.confirm('现在结束本场签到？学生将不能继续提交。')) void act(active.id+'/close');}}>结束签到</button>
        </section> : <form onSubmit={handleForm} className="lesson-panel space-y-4">
          <h2>{teacher ? '发起签到' : '加入签到'}</h2>
          {teacher ? <>
            <label className="block">签到班级
              <select required value={rules.classId} disabled={busy || !classes?.length}
                onChange={e => setRules({...rules, classId: e.target.value})}>
                <option value="">{classes ? '请选择签到班级' : '正在读取班级…'}</option>
                {classes?.map(item => <option key={item.id} value={item.id}>{item.name}{item.term && ' · ' + item.term}（{item.roster.length} 人）</option>)}
              </select>
            </label>
            {classError && <div className="space-y-2">
              <p role="alert">{classError}</p>
              <button type="button" onClick={() => { setClassError(''); setClassAttempt(value => value + 1); }}>重试读取班级</button>
            </div>}
            {(classes?.length === 0 || selectedClass?.roster.length === 0) && <div className="space-y-2">
              <p>{classes?.length === 0 ? '请先创建班级并添加学生账号。' : '本班还没有学生，请先添加学生账号。'}</p>
              <button type="button" onClick={() => onNavigate('classes')}>去班级管理</button>
            </div>}
            {selectedClass && selectedClass.roster.length > 0 && <p className="text-slate-500">本场应到 {selectedClass.roster.length} 人，以发布时的班级名单为准。</p>}
            <label className="block">场次名称<input required maxLength={80} placeholder="如：数据结构 · 周三第一节" value={rules.title} onChange={e=>setRules({...rules,title:e.target.value})}/></label>
            <label className="block">准时签到时长（分钟）<input type="number" required min={1} max={120} value={rules.minutes || ''} onChange={e=>setRules({...rules,minutes:Number(e.target.value)})}/></label>
            <p className="text-slate-500">截止后保留 5 分钟迟到补签。</p>
            <label className="block">指定手势<select value={rules.gesture} onChange={e=>setRules({...rules,gesture:e.target.value})}>{targets.map(id=><option key={id} value={id}>{labelGesture(id)}</option>)}</select></label>
            {([['teacherInFrame','照片需拍到授课教师'],['boardInFrame','照片需拍到黑板或教学屏'],['cameraOnly','照片仅限现场拍摄'],['allowCode','允许仅凭现场口令直接签到']] as const).map(([key,text])=><label key={key} className="lesson-check"><input type="checkbox" checked={rules[key]} onChange={e=>setRules({...rules,[key]:e.target.checked})}/>{text}</label>)}
          </> : <label className="block">现场签到码<input required minLength={8} maxLength={8} autoCapitalize="characters" spellCheck={false} value={code} onChange={e=>setCode(e.target.value.trim().toUpperCase())}/></label>}
          <button className="lesson-primary" disabled={busy || (teacher && (!state.loaded || !selectedClass?.roster.length))}>{teacher?'发布签到':'加入本场'}</button>
        </form>}
        {state.rounds.length>0 && <section className="lesson-panel"><label>我的签到场次<select value={round?.id} onChange={e=>{setSelection(e.target.value);setError('');}}>{state.rounds.map(r=><option key={r.id} value={r.id}>{r.className && r.className + ' · '}{r.title} · {formatTime(r.created)}</option>)}</select></label></section>}
      </aside>
      {round ? <div key={round.id} className="space-y-4"><section className="lesson-panel space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2>{round.title}</h2><span className="lesson-status">{round.closed?'已结束':'进行中'}</span></div>
        <p>{round.className ?? '旧场次 · 未绑定班级'} · {round.teacher} · 准时截止 {formatTime(round.onTime)} · 补签截止 {formatTime(round.ends)}</p>
        <p className="flex items-center gap-2"><Hand size={15}/>{labelGesture(round.gesture)}{round.teacherInFrame && ' · 教师入镜'}{round.boardInFrame && ' · 黑板入镜'}{round.cameraOnly && ' · 现场拍摄'}</p>
      </section>
      {teacher ? <section className="lesson-panel space-y-3"><h2 className="flex items-center gap-2"><ClipboardCheck size={18}/>签到记录与复核</h2>
        {round.roster && <p className="font-semibold">应到 {round.roster.length} 人 · 已提交 {round.entries.length} 人 · 未提交 {missing?.length ?? 0} 人</p>}
        <p>{Object.entries(statusText).map(([s,t])=>t+' '+round.entries.filter(e=>e.status===s).length).join('　')}</p>
        {!round.entries.length && <p className="text-slate-500">还没有学生提交签到。</p>}
        {!!missing?.length && <details className="rounded-xl border border-slate-200 p-3 text-sm">
          <summary className="cursor-pointer font-medium">查看未提交名单（{missing.length} 人）</summary>
          <ul className="mt-2 space-y-1">
            {missing.map(student => <li key={student.username}>{student.displayName} <span className="text-slate-500">{student.username}</span></li>)}
          </ul>
        </details>}
        {[...round.entries].reverse().sort((a,b)=>Number(b.status==='pending')-Number(a.status==='pending')).map(e=><Record key={e.studentId+e.submitted} entry={e} round={round} busy={busy} review={approve=>void act(round.id+'/review/'+e.studentId,{approve,submitted:e.submitted})}/>)}</section>
      : <>{round.entries.map(e=><Record key={e.submitted} entry={e} round={round} busy={busy}/>)}
        {!round.closed && !round.joined && <p className="lesson-panel">输入本班教师提供的签到码后即可提交签到。</p>}
        {!round.closed && round.joined && (!round.entries.length || round.entries[0].status==='rejected') && <>
          <AttendancePhoto round={round} busy={busy} onSubmit={input=>void act(round.id+'/submit',input)}/>
          <section className="lesson-panel space-y-3"><h3>免拍照签到</h3>
            <div className="flex gap-2 flex-wrap">{round.allowCode && <button className="lesson-primary" disabled={busy} onClick={()=>void act(round.id+'/submit',{method:'code'})}>口令签到</button>}
            <button disabled={busy} onClick={()=>void act(round.id+'/submit',{method:'manual'})}>申请现场人工核验</button></div></section></>}
        {round.closed && !round.entries.length && <p className="lesson-panel">本场已结束，你没有提交签到。</p>}</>}
      </div> : <div className="lesson-panel self-start"><h2>{state.loaded?'暂无签到场次':'正在读取签到场次…'}</h2></div>}
    </div>
  </main>;
}

function Record({entry:e,round,busy,review}: {entry:AttendanceEntry;round:AttendanceRound;busy:boolean;review?:(approve:boolean)=>void}) {
  const [photo,setPhoto]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  async function show() {
    if(photo){setPhoto('');return;}
    setLoading(true);setError('');
    try {const data=await apiRequest<{photo:string}>('attendance/'+round.id+'/photos/'+e.photoId);setPhoto(data.photo);}
    catch(err){setError(errorText(err));}finally{setLoading(false);}
  }
  return <article className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>{e.name} <small className="font-normal text-slate-500">{e.username}</small></strong><span className="lesson-status">{statusText[e.status]}</span></div>
    <p>{formatTime(e.submitted)} · {methodText[e.method]}{e.reviewedAt && ' · 复核于 '+formatTime(e.reviewedAt)}</p>
    {(e.method==='camera' || e.method==='upload') && <p>设备识别：{labelGesture(e.detected || '')} · 要求：{labelGesture(round.gesture)}</p>}
    {e.photoId && <button onClick={()=>void show()} disabled={loading}>{photo?'收起照片':'查看签到照片'}</button>}
    {e.photoId && photo && <img className="max-h-80 max-w-full rounded-xl" src={photo} alt="本次提交的签到照片"/>}
    {error && <p role="alert">{error}</p>}
    {review && e.status==='pending' && <div className="flex flex-wrap gap-2"><button className="lesson-primary" disabled={busy} onClick={()=>review(true)}>确认在场</button><button disabled={busy} onClick={()=>review(false)}>未能确认</button></div>}
    {!review && e.status==='rejected' && !round.closed && <p>教师未能确认在场，可以在本场结束前重新提交。</p>}
  </article>;
}
