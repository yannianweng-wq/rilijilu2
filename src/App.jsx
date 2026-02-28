import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ChevronLeft, ChevronRight, Briefcase, BookOpen, BookMarked, Activity, ShieldCheck, 
  Calendar as CalendarIcon, Loader2, CheckCircle2, Save, Quote, Sparkles, Trophy, 
  Coffee, Flame, Play, RotateCcw, Wind, AlertCircle, Award, Clock, X, HeartPulse,
  Settings, Download, Upload, Leaf, CloudRain, VolumeX, Volume2, Mic, LogOut
} from 'lucide-react';

// === Firebase 导入与初始化 ===
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, addDoc, deleteDoc } from 'firebase/firestore';

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {apiKey: "AIzaSyBL-wDTzSTpjQ8MRbTLqbGgWUZJONcz1Eg",
  authDomain: "rilijilu.firebaseapp.com",
  projectId: "rilijilu",
  storageBucket: "rilijilu.firebasestorage.app",
  messagingSenderId: "1053390196804",
  appId: "1:1053390196804:web:cac7a96dec4bbad00bac11",
  measurementId: "G-FZ7ZNN897D"};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// API Key 会由环境自动注入
const apiKey = typeof __api_key !== 'undefined' ? __api_key : 'AIzaSyCYg52g34ynan6Bsza4b6jL1cncdVrA-NE'; 

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================
// 核心：将大模型的 PCM 音频转为浏览器可播放的 WAV
// ==========================================
const pcmToWav = (base64, sampleRate) => {
  try {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    const pcm16 = new Int16Array(bytes.buffer);
    const wavBuffer = new ArrayBuffer(44 + pcm16.length * 2);
    const view = new DataView(wavBuffer);
    const writeString = (v, offset, str) => { for (let i = 0; i < str.length; i++) v.setUint8(offset + i, str.charCodeAt(i)); };
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcm16.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, pcm16.length * 2, true);
    let offset = 44;
    for (let i = 0; i < pcm16.length; i++, offset += 2) view.setInt16(offset, pcm16[i], true);
    return new Blob([view], { type: 'audio/wav' });
  } catch (e) {
    console.error("音频转换失败:", e);
    return new Blob([]);
  }
};

// ==========================================
// 核心：静默调用 AI 大模型生成真实人声
// ==========================================
const fetchAIVoice = async (text, retryCount = 0) => {
  if (!apiKey) return null;
  try {
    const payload = {
      contents: [{ parts: [{ text: `请用极其温柔、缓慢、让人放松的冥想女声说：${text}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } } 
      },
      model: "gemini-2.5-flash-preview-tts"
    };
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("API Request Failed");
    const result = await res.json();
    const inlineData = result.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (inlineData?.data) {
      const sampleRate = parseInt(inlineData.mimeType.split('rate=')[1] || '24000', 10);
      return URL.createObjectURL(pcmToWav(inlineData.data, sampleRate));
    }
  } catch (err) { 
    if (retryCount < 3) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retryCount)));
      return fetchAIVoice(text, retryCount + 1);
    }
    console.error("AI 声音加载彻底失败:", err); 
  }
  return null;
};

// ==========================================
// 全局通用辅助函数与常量
// ==========================================
const formatDateToYMD = (date) => {
  const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const CATEGORIES = [
  { id: 'work', label: '工作', icon: Briefcase, colorHex: '#3b82f6', bg: 'bg-blue-500', activeBg: 'bg-blue-50', border: 'border-blue-200', textActive: 'text-blue-700', placeholder: '完成了什么工作？(选填)' },
  { id: 'study', label: '学习', icon: BookOpen, colorHex: '#a855f7', bg: 'bg-purple-500', activeBg: 'bg-purple-50', border: 'border-purple-200', textActive: 'text-purple-700', placeholder: '学到了什么新知识？(选填)' },
  { id: 'reading', label: '阅读', icon: BookMarked, colorHex: '#6366f1', bg: 'bg-indigo-500', activeBg: 'bg-indigo-50', border: 'border-indigo-200', textActive: 'text-indigo-700', placeholder: '读了什么书？(选填)' },
  { id: 'exercise', label: '运动', icon: Activity, colorHex: '#22c55e', bg: 'bg-green-500', activeBg: 'bg-green-50', border: 'border-green-200', textActive: 'text-green-700', placeholder: '做了什么运动？(选填)' },
  { id: 'discipline', label: '习惯', icon: CheckCircle2, colorHex: '#f59e0b', bg: 'bg-amber-500', activeBg: 'bg-amber-50', border: 'border-amber-200', textActive: 'text-amber-700', placeholder: '抵挡了什么诱惑？' },
];

const DEFAULT_DAY_DATA = { items: { work: { checked: false, text: '' }, study: { checked: false, text: '' }, reading: { checked: false, text: '' }, exercise: { checked: false, text: '' }, discipline: { checked: false, text: '' } }, generalNote: '' };

const getRingGradient = (items) => {
  if (!items) return 'transparent';
  const c1 = items.work?.checked ? CATEGORIES[0].colorHex : 'transparent'; const c2 = items.study?.checked ? CATEGORIES[1].colorHex : 'transparent';
  const c3 = items.reading?.checked ? CATEGORIES[2].colorHex : 'transparent'; const c4 = items.exercise?.checked ? CATEGORIES[3].colorHex : 'transparent';
  const c5 = items.discipline?.checked ? CATEGORIES[4].colorHex : 'transparent';
  return `conic-gradient(${c1} 0% 20%, ${c2} 20% 40%, ${c3} 40% 60%, ${c4} 60% 80%, ${c5} 80% 100%)`;
};

// ==========================================
// 模块：Google 专属登录界面
// ==========================================
function LoginScreen({ onGoogleLogin, isLoginLoading, loginError }) {
  return (
    <div className="min-h-[100dvh] bg-[#0F172A] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-teal-500/10 blur-[100px] rounded-full pointer-events-none" />
      
      <div className="w-full max-w-sm bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center z-10 animate-in zoom-in-95 duration-500">
        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(255,255,255,0.1)]">
          <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">自我管理中枢</h1>
        <p className="text-slate-400 text-sm mb-8 leading-relaxed">
          登录以开启云端同步。无论切换任何设备，您的打卡与静心记录都不会丢失。
        </p>
        
        <button 
          onClick={onGoogleLogin}
          disabled={isLoginLoading}
          className="w-full bg-white hover:bg-slate-50 text-slate-800 font-bold text-[15px] rounded-xl px-5 py-4 transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50 active:scale-95"
        >
          {isLoginLoading ? <Loader2 className="animate-spin" size={20} /> : null}
          使用 Google 账号一键登录
        </button>

        {loginError && (
          <div className="mt-6 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 text-left">
            <p className="flex items-center gap-1.5 font-bold mb-1"><AlertCircle size={14}/> 登录请求被拦截</p>
            {loginError}
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 模块 A: 日常打卡日历 (Daily Tracker View) 
// ==========================================
function DailyTrackerView({ user, onOpenSettings }) {
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [records, setRecords] = useState({});
  const [localData, setLocalData] = useState(DEFAULT_DAY_DATA);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!user) return;
    setIsDataLoading(true);
    const unsubscribe = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'daily_records'), (snapshot) => {
      const fetchedRecords = {};
      snapshot.forEach((doc) => { fetchedRecords[doc.id] = doc.data(); });
      setRecords(fetchedRecords);
      setIsDataLoading(false);
    }, (error) => { console.error("获取数据失败:", error); setIsDataLoading(false); });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const ymd = formatDateToYMD(selectedDate);
    if (records[ymd]) setLocalData({ items: { ...DEFAULT_DAY_DATA.items, ...(records[ymd].items || {}) }, generalNote: records[ymd].generalNote || '' });
    else setLocalData(DEFAULT_DAY_DATA);
    setSaveSuccess(false);
  }, [selectedDate, records]);

  const handleToggleItem = (key) => setLocalData(prev => ({ ...prev, items: { ...prev.items, [key]: { ...prev.items[key], checked: !prev.items[key].checked } } }));
  const handleTextChange = (key, text) => setLocalData(prev => ({ ...prev, items: { ...prev.items, [key]: { ...prev.items[key], text } } }));
  const handleGeneralNoteChange = (text) => setLocalData(prev => ({ ...prev, generalNote: text }));

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'daily_records', formatDateToYMD(selectedDate)), { ...localData, updatedAt: Date.now() });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) { console.error("保存失败:", error); } finally { setIsSaving(false); }
  };

  const generateCalendarGrid = () => {
    const year = viewMonth.getFullYear(); const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate(); const daysInPrevMonth = new Date(year, month, 0).getDate();
    const grid = [];
    for (let i = firstDay - 1; i >= 0; i--) grid.push({ date: new Date(year, month - 1, daysInPrevMonth - i), isCurrentMonth: false, ymd: formatDateToYMD(new Date(year, month - 1, daysInPrevMonth - i)) });
    for (let i = 1; i <= daysInMonth; i++) grid.push({ date: new Date(year, month, i), isCurrentMonth: true, ymd: formatDateToYMD(new Date(year, month, i)) });
    for (let i = 1; i <= 42 - grid.length; i++) grid.push({ date: new Date(year, month + 1, i), isCurrentMonth: false, ymd: formatDateToYMD(new Date(year, month + 1, i)) });
    return grid;
  };

  const calendarGrid = generateCalendarGrid();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const todayYMD = formatDateToYMD(new Date());
  const activeItemsCount = CATEGORIES.filter(cat => localData.items[cat.id]?.checked).length;

  const motivationalQuote = useMemo(() => {
    let currentStreak = 0; let tempDate = new Date(selectedDate); tempDate.setDate(tempDate.getDate() - 1); 
    while (true) {
      const ymd = formatDateToYMD(tempDate); const rec = records[ymd];
      if (rec && rec.items && Object.values(rec.items).some(i => i.checked)) { currentStreak++; tempDate.setDate(tempDate.getDate() - 1); } else break;
    }
    const totalStreak = activeItemsCount > 0 ? currentStreak + 1 : currentStreak;
    if (activeItemsCount === 5) return { text: "大满贯！完美的执行力，这就是你掌控生活的样子。", icon: Trophy, color: "text-amber-600 bg-amber-50 border-amber-200" };
    if (totalStreak >= 7 && activeItemsCount > 0) return { text: `太棒了！已连续打卡 ${totalStreak} 天，复利效应正在悄悄发生。`, icon: Flame, color: "text-orange-600 bg-orange-50 border-orange-200" };
    if (activeItemsCount === 0) return { text: "允许自己偶尔停下脚步，随时可以从完成一件小事开始。", icon: Coffee, color: "text-slate-500 bg-slate-50 border-slate-200" };
    return { text: "行动本身就是打败焦虑的武器。你的每一份付出都有意义！", icon: Quote, color: "text-emerald-600 bg-emerald-50 border-emerald-200" };
  }, [activeItemsCount, records, selectedDate]);

  if (isDataLoading) return ( <div className="h-full flex items-center justify-center text-slate-400 flex-col gap-4"><Loader2 className="animate-spin text-slate-300" size={32} /><p className="font-medium text-sm tracking-widest">能量同步中...</p></div> );

  return (
    <div className="h-full bg-[#F8FAFC] flex flex-col lg:flex-row p-2 md:p-4 text-slate-800 font-sans gap-2 md:gap-4 overflow-hidden selection:bg-indigo-100">
      
      {/* 压缩版日历区 */}
      <div className="flex-none h-auto lg:flex-[1.2] xl:flex-[1] max-w-full lg:max-w-[400px] bg-white rounded-[1.5rem] shadow-[0_2px_15px_rgb(0,0,0,0.03)] border border-slate-100 flex flex-col overflow-hidden relative">
        <div className="px-3 md:px-5 py-2.5 md:py-4 border-b border-slate-50 flex items-center justify-between shrink-0">
          <h1 className="text-lg md:text-xl font-extrabold text-slate-800 tracking-tight">
            {viewMonth.getMonth() + 1}月<span className="text-xs font-medium text-slate-400 ml-1">{viewMonth.getFullYear()}</span>
          </h1>
          <div className="flex items-center gap-1.5 md:gap-3">
            <button onClick={onOpenSettings} className="p-1 md:p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-full transition-all">
              <Settings size={16} />
            </button>
            <div className="flex bg-slate-50 rounded-full p-0.5 border border-slate-100">
              <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))} className="p-1 hover:bg-white rounded-full transition-all text-slate-500"><ChevronLeft size={16} /></button>
              <button onClick={() => { setViewMonth(new Date()); setSelectedDate(new Date()); }} className="px-2.5 text-xs font-bold hover:bg-white rounded-full transition-all text-slate-700">今</button>
              <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))} className="p-1 hover:bg-white rounded-full transition-all text-slate-500"><ChevronRight size={16} /></button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-slate-50 shrink-0 px-1 md:px-3">
          {weekDays.map(day => <div key={day} className="py-1 md:py-2 text-center text-[10px] md:text-xs font-bold text-slate-400">{day}</div>)}
        </div>
        <div className="flex-1 grid grid-cols-7 grid-rows-6 min-h-0 px-1 md:px-3 pb-1 md:pb-3 pt-1">
          {calendarGrid.map((cell, index) => {
            const cellRecord = records[cell.ymd];
            const isToday = cell.ymd === todayYMD;
            const isSelected = cell.ymd === formatDateToYMD(selectedDate);
            const hasAnyRecord = cellRecord?.items && Object.values(cellRecord.items).some(i => i.checked);
            return (
              <div key={index} onClick={() => setSelectedDate(cell.date)} className="flex items-center justify-center cursor-pointer transition-all min-h-0 group">
                <div className={`relative flex items-center justify-center rounded-full transition-all ${!cell.isCurrentMonth ? 'opacity-30' : ''} ${isSelected ? 'scale-110 shadow-sm ring-2 ring-indigo-50' : 'group-hover:scale-110 group-hover:bg-slate-50'} w-7 h-7 md:w-9 md:h-9`}>
                  <div className="absolute inset-0 rounded-full transition-all" style={{ background: hasAnyRecord ? getRingGradient(cellRecord.items) : '#f1f5f9', opacity: hasAnyRecord ? 1 : (isSelected || isToday ? 1 : 0.5) }} />
                  <div className={`absolute rounded-full bg-white transition-all inset-[2px] md:inset-[2.5px] ${isSelected ? 'bg-indigo-50/90' : ''}`} />
                  <span className={`relative z-10 text-[10px] md:text-[12px] font-bold ${isSelected ? 'text-indigo-600' : isToday ? 'text-slate-800' : 'text-slate-500'}`}>{cell.date.getDate()}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 紧凑打卡区 */}
      <div className="flex-1 lg:flex-[1.8] bg-white rounded-[1.5rem] shadow-[0_2px_15px_rgb(0,0,0,0.03)] border border-slate-100 flex flex-col overflow-hidden min-h-0 relative mb-16 md:mb-0">
        <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-50 shrink-0 bg-white z-10">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <CalendarIcon size={14} className="text-indigo-400" />
              <h2 className="text-base md:text-lg font-extrabold text-slate-800">{selectedDate.toLocaleDateString('zh-CN', { month:'long', day:'numeric', weekday: 'short' })}</h2>
            </div>
            <button onClick={handleSave} disabled={isSaving} className={`flex items-center gap-1 px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow-sm active:scale-95 ${saveSuccess ? 'bg-green-500 text-white' : 'bg-slate-800 text-white hover:bg-slate-700'}`}>
              {isSaving ? <Loader2 size={12} className="animate-spin" /> : saveSuccess ? <CheckCircle2 size={12} /> : <Save size={12} />}
              <span>{saveSuccess ? '已保存' : '保存'}</span>
            </button>
          </div>
          <div className="flex items-center gap-2 text-[10px] md:text-xs font-bold text-slate-400">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
              <div className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-blue-400 via-indigo-400 to-amber-400" style={{ width: `${(activeItemsCount / 5) * 100}%` }} />
            </div>
            <span className="shrink-0">{activeItemsCount} / 5</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-[#FAFAFA] pb-24 custom-scrollbar">
          <div className={`flex items-start gap-2 p-2.5 md:p-3 rounded-xl border transition-colors mb-3 md:mb-4 ${motivationalQuote.color}`}>
            <motivationalQuote.icon size={16} className="mt-0.5 shrink-0" />
            <p className="text-xs font-medium leading-relaxed">{motivationalQuote.text}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
            {CATEGORIES.map(category => {
              const isChecked = localData.items[category.id]?.checked;
              const textValue = localData.items[category.id]?.text || '';
              const Icon = category.icon;
              return (
                <div key={category.id} className={`flex flex-col transition-all duration-300 rounded-2xl border overflow-hidden cursor-pointer ${isChecked ? `${category.activeBg} ${category.border} shadow-sm` : 'bg-white border-slate-100 hover:border-slate-200'}`} onClick={() => handleToggleItem(category.id)}>
                  <div className="p-2.5 md:p-3 flex items-center justify-between select-none">
                    <div className="flex items-center gap-2 md:gap-2.5">
                      <div className={`w-7 h-7 md:w-8 md:h-8 rounded-xl flex items-center justify-center transition-colors shrink-0 ${isChecked ? `${category.bg} text-white shadow-sm` : 'bg-slate-50 text-slate-400'}`}>
                        <Icon size={14} className={isChecked ? '' : 'opacity-80'} />
                      </div>
                      <span className={`text-xs md:text-sm font-bold ${isChecked ? category.textActive : 'text-slate-600'}`}>{category.label}</span>
                    </div>
                    {isChecked && <CheckCircle2 size={14} className={category.textActive} />}
                  </div>
                  {isChecked && (
                    <div className="px-2.5 pb-2.5 pt-0 animate-in fade-in zoom-in-95 duration-200">
                      <input type="text" value={textValue} onChange={(e) => handleTextChange(category.id, e.target.value)} placeholder={category.placeholder} onClick={(e) => e.stopPropagation()} 
                        className={`w-full bg-white/80 text-[11px] md:text-xs px-2 py-1.5 rounded-lg outline-none transition-all placeholder:text-slate-400 text-slate-700 border border-white/40 focus:ring-1 ${category.inputFocus}`} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <h3 className="text-[10px] font-bold text-slate-400 mb-1.5 uppercase flex items-center gap-1">
              <Quote size={10} /> 随笔 (选填)
            </h3>
            <textarea value={localData.generalNote} onChange={(e) => handleGeneralNoteChange(e.target.value)} placeholder="记录此刻的心情..." 
              className="w-full h-16 md:h-20 p-2.5 bg-white border border-slate-100 rounded-xl resize-none outline-none focus:ring-2 focus:ring-slate-50 focus:border-slate-300 transition-all text-xs text-slate-700 placeholder:text-slate-300 shadow-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 模块 B: 静心戒断 (沉浸正念 + AI真实人声版)
// ==========================================
function MindfulSanctuaryView({ user, onOpenSettings }) {
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [habitName, setHabitName] = useState(''); 
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [inputName, setInputName] = useState('');
  const [isSavingHabit, setIsSavingHabit] = useState(false); 
  
  const [viewMonth, setViewMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [records, setRecords] = useState({}); 
  
  // 核心急救状态
  const [showBreatheModal, setShowBreatheModal] = useState(false);
  const [breathePhase, setBreathePhase] = useState('idle'); 
  const [breatheTimeLeft, setBreatheTimeLeft] = useState(60);
  
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isAiVoiceReady, setIsAiVoiceReady] = useState(false);
  const [showSlipModal, setShowSlipModal] = useState(false);
  const [slipTrigger, setSlipTrigger] = useState('');
  const [slipNote, setSlipNote] = useState('');

  // 引用缓存：音频资源
  const audioRefs = useRef({});
  const bgmRef = useRef(null);

  // 1. 静默预加载 AI 人声与自然白噪音
  useEffect(() => {
    let isMounted = true;
    const loadVoices = async () => {
      const phrases = {
        'start': '准备，深吸气',
        'inhale': '深吸气',
        'hold': '屏住呼吸',
        'exhale': '缓缓呼气',
        'success': '非常好，你成功度过了这次冲动'
      };
      
      let successCount = 0;
      for (const [key, text] of Object.entries(phrases)) {
        if (!audioRefs.current[key] && isMounted) {
          const url = await fetchAIVoice(text);
          if (url) {
             const audio = new Audio(url);
             audio.preload = 'auto';
             audioRefs.current[key] = audio;
             successCount++;
          }
        }
      }
      if (isMounted && successCount > 0) setIsAiVoiceReady(true);
    };
    
    loadVoices();
    // 强制超时放行：确保即使 AI 加载失败，用户依然可以使用视觉光环
    const fallbackTimer = setTimeout(() => { if (isMounted) setIsAiVoiceReady(true); }, 5000);
    
    return () => { isMounted = false; clearTimeout(fallbackTimer); };
  }, []);

  // 2. 双重验证读取防白屏
  useEffect(() => {
    if (!user) return;
    setIsDataLoading(true);
    let isConfigLoaded = false; let isRecordsLoaded = false;
    const checkFinishLoading = () => { if (isConfigLoaded && isRecordsLoaded) setIsDataLoading(false); };

    const unsubConfig = onSnapshot(doc(db, 'artifacts', appId, 'users', user.uid, 'quit_settings', 'main'), (docSnap) => {
      if (docSnap.exists() && docSnap.data().habitName) { setHabitName(docSnap.data().habitName); setIsSettingUp(false); } 
      else { setHabitName(''); setIsSettingUp(true); }
      isConfigLoaded = true; checkFinishLoading();
    }, (err) => { console.error(err); isConfigLoaded = true; checkFinishLoading(); });

    const unsubRecords = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'quit_records'), (snapshot) => {
      const fetched = {}; snapshot.forEach(doc => { fetched[doc.id] = doc.data(); });
      setRecords(fetched); isRecordsLoaded = true; checkFinishLoading();
    }, (err) => { console.error(err); isRecordsLoaded = true; checkFinishLoading(); });

    return () => { unsubConfig(); unsubRecords(); };
  }, [user]);

  // 3. 核心：重构后的定时器，绝对无死循环
  useEffect(() => {
    let timer;
    if (showBreatheModal && breatheTimeLeft > 0 && breathePhase !== 'idle') {
      timer = setInterval(() => {
        setBreatheTimeLeft(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [showBreatheModal, breathePhase, breatheTimeLeft]);

  // 4. 核心：由时间流逝驱动的 AI 声音播放与光环状态
  const playAIVoice = (phraseKey) => {
    if (!isAudioEnabled) return;
    const audio = audioRefs.current[phraseKey];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(e => console.log('Audio Blocked by Browser:', e));
    }
  };

  useEffect(() => {
    if (!showBreatheModal || breathePhase === 'idle') return;

    if (breatheTimeLeft === 0) {
       setBreathePhase('success');
       playAIVoice('success');
       if (bgmRef.current) bgmRef.current.pause();
       return;
    }

    const elapsed = 60 - breatheTimeLeft;
    const cycleTime = elapsed % 19; // 19s 循环 (4s吸, 7s屏, 8s呼)
    
    let expectedPhase = 'inhale';
    if (cycleTime < 4) expectedPhase = 'inhale';
    else if (cycleTime < 11) expectedPhase = 'hold';
    else expectedPhase = 'exhale';

    if (expectedPhase !== breathePhase) {
       setBreathePhase(expectedPhase);
       playAIVoice(expectedPhase);
    }
  }, [breatheTimeLeft, showBreatheModal]); // 只依赖时间流逝

  // 操作处理
  const toggleAudio = () => {
    setIsAudioEnabled(!isAudioEnabled);
    if (isAudioEnabled) {
      if (bgmRef.current) bgmRef.current.pause();
      Object.values(audioRefs.current).forEach(a => a.pause());
    } else {
      if (showBreatheModal && breathePhase !== 'idle' && breathePhase !== 'success') {
        if (bgmRef.current) bgmRef.current.play().catch(()=>{});
      }
    }
  };

  const handleStartHabit = async () => {
    if (!inputName.trim() || !user) return;
    setIsSavingHabit(true); 
    try { await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'quit_settings', 'main'), { habitName: inputName, createdAt: Date.now() }); } 
    catch (error) { console.error(error); } finally { setIsSavingHabit(false); }
  };

  const handleMarkSuccess = async () => {
    if (!user) return;
    const ymd = formatDateToYMD(selectedDate);
    const ref = doc(db, 'artifacts', appId, 'users', user.uid, 'quit_records', ymd);
    if (records[ymd]?.status === 'success') await deleteDoc(ref);
    else await setDoc(ref, { status: 'success', timestamp: Date.now() });
  };

  const openSlipModal = () => {
    const ymd = formatDateToYMD(selectedDate);
    if (records[ymd]?.status === 'slip') deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'quit_records', ymd));
    else { setSlipTrigger(''); setSlipNote(''); setShowSlipModal(true); }
  };

  const handleSaveSlip = async () => {
    if (!user) return;
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'quit_records', formatDateToYMD(selectedDate)), { status: 'slip', trigger: slipTrigger, note: slipNote, timestamp: Date.now() });
    setShowSlipModal(false);
  };

  const startBreathing = () => {
    setBreathePhase('inhale');
    setBreatheTimeLeft(60);
    
    // 强制在用户点击事件中初始化 Audio，彻底解决手机浏览器拦截自动播放的问题
    if (isAudioEnabled) {
       if (!bgmRef.current) {
          bgmRef.current = new Audio('https://actions.google.com/sounds/v1/water/rain_on_roof.ogg');
          bgmRef.current.loop = true; 
          bgmRef.current.volume = 0.4; 
       }
       bgmRef.current.play().catch(()=>{});

       // 预先静音唤醒所有 AI 声音资源，解锁权限
       Object.values(audioRefs.current).forEach(a => {
          a.volume = 0; a.play().catch(()=>{}); a.pause(); a.volume = 1; a.currentTime = 0;
       });

       playAIVoice('start');
    }
  };

  const generateCalendarGrid = () => {
    const year = viewMonth.getFullYear(); const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate(); const daysInPrevMonth = new Date(year, month, 0).getDate();
    const grid = [];
    for (let i = firstDay - 1; i >= 0; i--) grid.push({ date: new Date(year, month - 1, daysInPrevMonth - i), isCurrentMonth: false, ymd: formatDateToYMD(new Date(year, month - 1, daysInPrevMonth - i)) });
    for (let i = 1; i <= daysInMonth; i++) grid.push({ date: new Date(year, month, i), isCurrentMonth: true, ymd: formatDateToYMD(new Date(year, month, i)) });
    for (let i = 1; i <= 42 - grid.length; i++) grid.push({ date: new Date(year, month + 1, i), isCurrentMonth: false, ymd: formatDateToYMD(new Date(year, month + 1, i)) });
    return grid;
  };

  const calendarGrid = generateCalendarGrid();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const todayYMD = formatDateToYMD(new Date());

  const monthStats = useMemo(() => {
    const year = viewMonth.getFullYear(); const month = viewMonth.getMonth(); const daysInMonth = new Date(year, month + 1, 0).getDate();
    let totalMarked = 0; let successes = 0;
    for (let i = 1; i <= daysInMonth; i++) {
      const ymd = formatDateToYMD(new Date(year, month, i));
      if (records[ymd]) { totalMarked++; if (records[ymd].status === 'success') successes++; }
    }
    return { rate: totalMarked === 0 ? 0 : Math.round((successes / totalMarked) * 100), successes, totalMarked };
  }, [viewMonth, records]);

  const selectedDayRecord = records[formatDateToYMD(selectedDate)];
  const journalEntries = useMemo(() => Object.entries(records).sort((a, b) => b[0].localeCompare(a[0])).map(([date, data]) => ({ date, ...data })), [records]);

  if (isDataLoading) return ( <div className="h-full bg-[#0F172A] flex items-center justify-center text-teal-500/50 flex-col gap-4"><Loader2 className="animate-spin text-teal-500" size={32} /><p className="font-medium text-sm tracking-widest uppercase">布置空间中...</p></div> );

  if (isSettingUp || !habitName) {
    return (
      <div className="h-full bg-[#0F172A] flex items-center justify-center p-4 selection:bg-teal-500/30 relative">
        <button onClick={onOpenSettings} className="absolute top-6 right-6 z-20 p-2 text-slate-500 bg-slate-800 rounded-full"><Settings size={18} /></button>
        <div className="w-full max-w-sm bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center z-10">
          <div className="w-12 h-12 bg-teal-500/10 rounded-xl flex items-center justify-center mb-4 border border-teal-500/20"><Leaf size={24} className="text-teal-400" /></div>
          <h1 className="text-xl font-bold text-white mb-2">定义你的挑战</h1>
          <p className="text-slate-400 text-xs mb-6">不追求完美清零，我们追求长期的胜率。</p>
          <div className="w-full space-y-3">
            <input type="text" value={inputName} onChange={(e) => setInputName(e.target.value)} placeholder="如: 熬夜, 暴食..." className="w-full bg-slate-900/50 border border-slate-700 focus:border-teal-500 rounded-xl px-4 py-3 text-white text-sm outline-none text-center" />
            <button onClick={handleStartHabit} disabled={!inputName.trim() || isSavingHabit} className="w-full bg-teal-500 hover:bg-teal-400 text-slate-900 font-bold text-sm rounded-xl px-4 py-3 flex items-center justify-center gap-2">
               {isSavingHabit ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} 开启静心之旅
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#0F172A] text-slate-200 font-sans flex flex-col relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-teal-500/10 blur-[120px] rounded-full pointer-events-none" />

      {/* 紧凑头部 */}
      <header className="px-4 py-3 md:px-8 md:py-6 flex justify-between items-center z-10 shrink-0 border-b border-slate-800/50 bg-[#0F172A]/80 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-center"><Leaf size={16} className="text-teal-400" /></div>
          <div><p className="text-[9px] md:text-xs text-slate-500 font-bold uppercase">当前戒除</p><h1 className="text-sm md:text-lg font-bold text-white leading-tight">{habitName}</h1></div>
        </div>
        <button onClick={onOpenSettings} className="p-1.5 text-slate-400 hover:text-white bg-slate-800/80 rounded-full"><Settings size={16} /></button>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row w-full max-w-7xl mx-auto p-3 md:p-6 gap-3 md:gap-6 z-10 min-h-0 pb-20 md:pb-32">
        
        {/* 左侧日历 (高度压缩) */}
        <div className="flex-none bg-slate-800/40 backdrop-blur-md rounded-2xl border border-slate-700/50 flex flex-col relative overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-700/50 flex items-center justify-between shrink-0">
            <h1 className="text-sm font-bold text-white">{viewMonth.getMonth() + 1}月<span className="text-xs text-slate-400 ml-1">{viewMonth.getFullYear()}</span></h1>
            <div className="flex bg-slate-900/80 rounded-full p-0.5">
              <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))} className="p-1 hover:bg-slate-800 rounded-full text-slate-400"><ChevronLeft size={14} /></button>
              <button onClick={() => { setViewMonth(new Date()); setSelectedDate(new Date()); }} className="px-2 text-[10px] font-bold hover:bg-slate-800 rounded-full text-slate-300">今</button>
              <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))} className="p-1 hover:bg-slate-800 rounded-full text-slate-400"><ChevronRight size={14} /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 border-b border-slate-700/50 px-1">
            {weekDays.map(day => <div key={day} className="py-1 text-center text-[9px] font-bold text-slate-500">{day}</div>)}
          </div>
          <div className="grid grid-cols-7 grid-rows-6 px-1 pb-1 pt-1">
            {calendarGrid.map((cell, index) => {
              const rec = records[cell.ymd]; const isSelected = cell.ymd === formatDateToYMD(selectedDate);
              let bgClass = "bg-transparent"; let textClass = "text-slate-400";
              if (rec) {
                if (rec.status === 'success') { bgClass = "bg-teal-500/20 border border-teal-500/30"; textClass = "text-teal-400 font-bold"; } 
                else if (rec.status === 'slip') { bgClass = "bg-slate-700/50 border border-slate-600"; textClass = "text-slate-500"; }
              } else if (cell.ymd === todayYMD) textClass = "text-white font-bold";
              return (
                <div key={index} onClick={() => setSelectedDate(cell.date)} className="flex justify-center p-0.5 cursor-pointer">
                  <div className={`relative flex items-center justify-center rounded-full ${!cell.isCurrentMonth ? 'opacity-20' : ''} ${isSelected ? 'ring-1 ring-teal-500 bg-slate-700/50' : ''} ${bgClass} w-6 h-6 md:w-8 md:h-8`}>
                    <span className={`text-[10px] md:text-xs ${textClass}`}>{cell.date.getDate()}</span>
                    {rec?.status === 'success' && <Leaf size={8} className="absolute -bottom-0.5 text-teal-400 opacity-80" />}
                    {rec?.status === 'slip' && <div className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-slate-500 opacity-50" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右侧：紧凑操作与数据区 */}
        <div className="flex-1 flex flex-col gap-3 md:gap-4 min-h-0 overflow-y-auto custom-scrollbar">
          
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4 shrink-0">
             <div className="col-span-2 bg-slate-800/40 rounded-2xl p-3 border border-slate-700/50 flex flex-col justify-between">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-white font-bold">{selectedDate.toLocaleDateString('zh-CN', { month:'short', day:'numeric'})} 战况</span>
                  {selectedDayRecord?.status === 'success' && <span className="text-[9px] px-2 py-0.5 bg-teal-500/20 text-teal-400 rounded-full border border-teal-500/30">已克制</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={handleMarkSuccess} className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold transition-all ${selectedDayRecord?.status === 'success' ? 'bg-slate-700/50 text-slate-300' : 'bg-teal-500 text-slate-900 active:scale-95'}`}>
                    {selectedDayRecord?.status === 'success' ? <RotateCcw size={12}/> : <CheckCircle2 size={12}/>} {selectedDayRecord?.status === 'success' ? '撤销' : '成功克制'}
                  </button>
                  <button onClick={openSlipModal} className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold transition-all border ${selectedDayRecord?.status === 'slip' ? 'bg-slate-700/50 text-slate-300 border-transparent' : 'border-slate-600 text-slate-400 active:scale-95'}`}>
                    {selectedDayRecord?.status === 'slip' ? <RotateCcw size={12}/> : <AlertCircle size={12}/>} 滑铁卢
                  </button>
                </div>
             </div>

             <div className="col-span-2 lg:col-span-1 bg-slate-800/40 rounded-2xl p-3 border border-slate-700/50 flex items-center justify-between lg:flex-col lg:justify-center">
                 <div>
                   <p className="text-[10px] text-slate-500 uppercase font-bold mb-0.5">本月胜率</p>
                   <p className="text-2xl md:text-3xl font-black text-white">{monthStats.rate}<span className="text-xs text-slate-400 ml-0.5">%</span></p>
                 </div>
                 <div className="text-right lg:text-center text-[10px] text-slate-400">
                    赢了 {monthStats.successes} / {monthStats.totalMarked} 天
                 </div>
             </div>
          </div>

          {/* 冲动急救入口 */}
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-3 shrink-0 flex items-center justify-between shadow-[0_0_15px_rgba(99,102,241,0.1)]">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center"><Wind size={20}/></div>
                <div><h3 className="text-sm font-bold text-white">欲望来袭？</h3><p className="text-[10px] text-slate-400">AI 真实人声冥想陪伴</p></div>
             </div>
             <button onClick={() => setShowBreatheModal(true)} className="bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg active:scale-95">
                <Mic size={14}/> 开启急救
             </button>
          </div>

          <div className="bg-slate-800/40 rounded-2xl border border-slate-700/50 p-4 flex-1 flex flex-col min-h-[200px]">
            <h3 className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-1.5"><BookOpen size={12}/> 旅程记录</h3>
            <div className="flex-1 space-y-3">
              {journalEntries.length === 0 ? (
                <div className="text-center text-slate-500 text-xs mt-10">这是改变的第一天，记录下你的每一次坚持吧。</div>
              ) : (
                journalEntries.map(entry => (
                  <div key={entry.date} className="bg-slate-900/50 border border-slate-700/30 rounded-xl p-3">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-bold text-slate-300">{entry.date}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${entry.status === 'success' ? 'bg-teal-500/20 text-teal-400' : 'bg-slate-700 text-slate-400'}`}>
                        {entry.status === 'success' ? '成功克制' : '滑铁卢'}
                      </span>
                    </div>
                    {entry.trigger && <div className="text-[10px] text-amber-300/80 mb-1 flex items-center gap-1"><AlertCircle size={10}/> 触发: {entry.trigger}</div>}
                    {entry.note && <div className="text-[11px] text-slate-400 leading-relaxed bg-slate-800/50 p-2 rounded-lg">{entry.note}</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      {/* === 模态框：滑铁卢日记 === */}
      {showSlipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="px-4 py-3 border-b border-slate-700 flex justify-between items-center">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5"><BookOpen size={14} className="text-amber-400" /> 记录反思</h3>
              <button onClick={() => setShowSlipModal(false)} className="text-slate-400 p-1"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-slate-400 text-xs">滑倒了没关系，把原因写下来变成经验。</p>
              <div className="space-y-3">
                <input type="text" value={slipTrigger} onChange={(e) => setSlipTrigger(e.target.value)} className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500/50 rounded-lg px-3 py-2 text-white outline-none text-xs" placeholder="触发原因 (如: 压力大、无聊)" />
                <textarea value={slipNote} onChange={(e) => setSlipNote(e.target.value)} className="w-full h-20 bg-slate-900 border border-slate-700 focus:border-amber-500/50 rounded-lg px-3 py-2 text-white outline-none text-xs resize-none" placeholder="写下感悟..." />
              </div>
              <button onClick={handleSaveSlip} className="w-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold rounded-lg py-2.5 text-xs transition-all">保存日记并标记</button>
            </div>
          </div>
        </div>
      )}

      {/* === 模态框：极其稳定的 AI 人声正念急救 === */}
      {showBreatheModal && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-6 bg-slate-900/95 backdrop-blur-xl animate-in fade-in">
          <div className="absolute top-6 right-6 flex items-center gap-3">
             <button onClick={toggleAudio} className="text-slate-400 p-2 bg-slate-800 rounded-full border border-slate-700">
               {isAudioEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
             </button>
             <button onClick={() => { 
                setShowBreatheModal(false); setBreathePhase('idle'); 
                if(bgmRef.current) bgmRef.current.pause(); 
                Object.values(audioRefs.current).forEach(a=>a.pause());
             }} className="text-slate-500 p-2 bg-slate-800 rounded-full border border-slate-700"><X size={20} /></button>
          </div>
          
          <div className="text-center mb-10 max-w-xs">
            {breathePhase === 'idle' ? (
              <><h2 className="text-xl font-bold text-white mb-2">准备进入静心空间</h2>
              <p className="text-amber-500/80 text-[10px] mb-2 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 inline-block">⚠️ 请调大媒体音量，并关闭物理静音键</p>
              <p className="text-slate-400 text-xs leading-relaxed">跟随温柔的女声引导与自然雨声，给自己一分钟的专注。</p></>
            ) : breathePhase === 'success' ? (
              <><h2 className="text-2xl font-bold text-teal-400 mb-2 flex items-center justify-center gap-1.5"><ShieldCheck size={24} /> 风暴已过</h2><p className="text-slate-300 text-xs">大脑中旧习惯的回路正在削弱，你变得更自由了。</p></>
            ) : (
              <h2 className="text-xl font-bold text-teal-400 tracking-widest transition-all duration-1000">
                {breathePhase === 'inhale' ? '深吸气...' : breathePhase === 'hold' ? '屏住呼吸...' : '缓缓呼气...'}
              </h2>
            )}
          </div>

          <div className="relative w-56 h-56 flex items-center justify-center mb-12">
            {breathePhase !== 'idle' && breathePhase !== 'success' && (
              <div className="absolute inset-0 flex items-center justify-center">
                 <div className={`rounded-full border border-teal-500/30 bg-teal-500/10 transition-all ease-in-out shadow-[0_0_40px_rgba(20,184,166,0.15)]
                    ${breathePhase === 'inhale' ? 'w-full h-full duration-[4000ms]' : ''}
                    ${breathePhase === 'hold' ? 'w-full h-full duration-[7000ms]' : ''}
                    ${breathePhase === 'exhale' ? 'w-[40%] h-[40%] duration-[8000ms]' : ''}`} />
              </div>
            )}
            <div className="z-10 w-24 h-24 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shadow-xl relative overflow-hidden">
               {breathePhase === 'idle' ? <Mic size={32} className={`text-teal-500/50 ${isAiVoiceReady ? 'animate-pulse' : 'opacity-20'}`} /> : breathePhase === 'success' ? <Leaf size={32} className="text-teal-400" /> : <span className="text-3xl font-black text-white">{breatheTimeLeft}</span>}
            </div>
          </div>

          {breathePhase === 'idle' ? (
            <button onClick={startBreathing} disabled={!isAiVoiceReady} className="bg-teal-500 text-slate-900 font-bold text-sm rounded-xl px-8 py-3 flex items-center gap-1.5 active:scale-95 shadow-[0_0_20px_rgba(20,184,166,0.4)] disabled:opacity-50 disabled:grayscale transition-all">
              {isAiVoiceReady ? <><Play size={16} fill="currentColor" /> 开始 60 秒人声引导</> : <><Loader2 size={16} className="animate-spin" /> AI 语音生成中...</>}
            </button>
          ) : breathePhase === 'success' ? (
            <button onClick={handleResistSuccess} className="bg-teal-500 text-slate-900 font-bold text-sm rounded-xl px-8 py-3 flex items-center gap-1.5 active:scale-95 animate-in slide-in-from-bottom-4">
              记录今日克制
            </button>
          ) : (
            <div className="text-slate-500 text-xs font-bold tracking-widest uppercase flex items-center gap-1.5"><HeartPulse size={14} className="animate-pulse" /> 聆听内心的声音</div>
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// 设置与账号管理模态框 (包含登出)
// ==========================================
function SettingsModal({ user, onClose }) {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const fileInputRef = useRef(null);

  const handleExport = async () => {
    if (!user) return; setIsExporting(true);
    try {
      const data = { daily_records: {}, quit_settings: {}, quit_records: {} };
      const dailySnap = await new Promise((resolve) => onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'daily_records'), resolve)); dailySnap.forEach(doc => { data.daily_records[doc.id] = doc.data(); });
      const setSnap = await new Promise((resolve) => onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'quit_settings'), resolve)); setSnap.forEach(doc => { data.quit_settings[doc.id] = doc.data(); });
      const recSnap = await new Promise((resolve) => onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'quit_records'), resolve)); recSnap.forEach(doc => { data.quit_records[doc.id] = doc.data(); });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `自我管理中枢备份_${formatDateToYMD(new Date())}.json`; a.click(); URL.revokeObjectURL(url);
    } catch (error) { alert("导出失败"); } finally { setIsExporting(false); }
  };

  const handleImport = (e) => {
    const file = e.target.files[0]; if (!file || !user) return;
    setIsImporting(true); setImportStatus('读取文件中...');
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result); setImportStatus('正在恢复云端...');
        if (data.daily_records) for (const [id, val] of Object.entries(data.daily_records)) await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'daily_records', id), val);
        if (data.quit_settings) for (const [id, val] of Object.entries(data.quit_settings)) await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'quit_settings', id), val);
        if (data.quit_records) for (const [id, val] of Object.entries(data.quit_records)) await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'quit_records', id), val);
        setImportStatus('恢复成功！'); setTimeout(() => { onClose(); }, 2000);
      } catch (error) { setImportStatus('导入失败：格式错误'); } finally { setIsImporting(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
    }; reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl animate-in zoom-in-95">
        <div className="px-5 py-4 border-b border-slate-700 flex justify-between items-center">
          <h3 className="text-base font-bold text-white flex items-center gap-1.5"><Settings size={16} className="text-indigo-400" /> 设置与账号</h3>
          <button onClick={onClose} className="text-slate-400 p-1"><X size={18} /></button>
        </div>
        
        <div className="p-5 space-y-6">
          {/* 用户信息区 */}
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden border border-slate-600">
               {user?.photoURL ? <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover"/> : <span className="text-slate-400 font-bold">{user?.displayName?.[0] || 'U'}</span>}
             </div>
             <div>
               <p className="text-sm font-bold text-white">{user?.displayName || '匿名设备用户'}</p>
               <p className="text-[10px] text-slate-400">{user?.email || '未绑定邮箱'}</p>
             </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex gap-2">
            <AlertCircle className="text-amber-500 shrink-0" size={14} />
            <p className="text-[11px] text-amber-200/80">提示：如果您准备使用 Google 登录，请先导出备份，登录后再将其导入新账号中。</p>
          </div>
          
          <div className="space-y-2">
            <button onClick={handleExport} disabled={isExporting || isImporting} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg py-3 text-xs flex justify-center items-center gap-1.5 disabled:opacity-50 transition-colors">
              {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {isExporting ? '打包中...' : '导出当前数据 (.json)'}
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={isExporting || isImporting} className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-lg py-3 text-xs flex justify-center items-center gap-1.5 disabled:opacity-50 transition-colors">
              {isImporting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} 导入外部数据
            </button>
            <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleImport} />
          </div>
          {importStatus && <p className="text-[11px] text-center font-bold text-indigo-400">{importStatus}</p>}

          <div className="pt-4 border-t border-slate-700">
            <button onClick={() => auth.signOut()} className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold rounded-lg py-3 text-xs flex justify-center items-center gap-1.5 transition-all">
              <LogOut size={14} /> 退出当前账号
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 主应用入口
// ==========================================
export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  
  const [activeTab, setActiveTab] = useState('daily'); 
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    // 为保证预览环境的旧数据安全，依然保留了 Token 自动登录。
    // 但如果用户已登出，onAuthStateChanged 会将 user 设为 null，展示专属登录页。
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token && !auth.currentUser) {
           await signInWithCustomToken(auth, __initial_auth_token);
        }
      } catch (error) { console.error("初始化 Token 失败:", error); }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => { 
      setUser(currentUser); 
      setIsAuthLoading(false); 
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setLoginError('');
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Google 登录被拦截或失败:", error);
      setLoginError("登录弹窗被浏览器拦截。这通常是因为您处于沙盒预览环境中。部署到 Vercel 公网后即可正常一键登录！");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  if (isAuthLoading) return <div className="min-h-[100dvh] bg-slate-900 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={32} /></div>;

  // 拦截：未登录状态展示登录页面
  if (!user) {
    return <LoginScreen onGoogleLogin={handleGoogleLogin} isLoading={isGoogleLoading} loginError={loginError} />;
  }

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-slate-900">
      <div className={`absolute inset-0 transition-opacity duration-300 ${activeTab === 'daily' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
        <DailyTrackerView user={user} onOpenSettings={() => setShowSettings(true)} />
      </div>
      <div className={`absolute inset-0 transition-opacity duration-300 ${activeTab === 'quit' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
        <MindfulSanctuaryView user={user} onOpenSettings={() => setShowSettings(true)} />
      </div>

      <div className="absolute bottom-4 md:bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center p-1 bg-slate-900/80 backdrop-blur-xl border border-slate-700 rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        <button onClick={() => setActiveTab('daily')} className={`px-4 py-2 md:px-6 md:py-2.5 rounded-full flex items-center gap-1.5 text-xs md:text-sm font-bold transition-all duration-300 ${activeTab === 'daily' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
          <CalendarIcon size={14} /> 日常打卡
        </button>
        <div className="w-[1px] h-4 bg-slate-700 mx-1"></div>
        <button onClick={() => setActiveTab('quit')} className={`px-4 py-2 md:px-6 md:py-2.5 rounded-full flex items-center gap-1.5 text-xs md:text-sm font-bold transition-all duration-300 ${activeTab === 'quit' ? 'bg-teal-500 text-slate-900 shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
          <Leaf size={14} /> 静心空间
        </button>
      </div>

      {showSettings && <SettingsModal user={user} onClose={() => setShowSettings(false)} />}

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(71, 85, 105, 0.5); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(100, 116, 139, 0.8); }
      `}} />
    </div>
  );
}
