import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import appLogo from '@assets/app_logo_1790537563711.jpeg';
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Layers3,
  Lightbulb,
  LockKeyhole,
  RotateCcw,
  Sparkles,
  Target,
  TimerReset,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

type Level = 'Certificate' | 'Upgrading' | 'Diploma' | 'Higher Diploma';
type QuestionType = 'mcq' | 'short' | 'long';
type View = 'setup' | 'quiz' | 'recap';

type SessionInput = {
  department: string;
  course: string;
  level: Level;
  module: string;
  topic: string;
  questionType: QuestionType;
  count: number;
};

type StudyQuestion = {
  id: string;
  prompt: string;
  options: string[];
  answer: string;
  answerPoints: string[];
  explanation: string;
  answerLabel: string;
};

const departmentCourseOptions: { department: string; courses: string[] }[] = [
  { department: 'Department of Orthopaedic & Trauma Medicine', courses: ['Orthopaedics & Trauma Medicine'] },
  { department: 'Department of Clinical Medicine and Surgery', courses: ['Clinical Medicine & Surgery'] },
  { department: 'Department of Radiography and Imaging', courses: ['Radiography & Imaging'] },
  { department: 'Department of Medical Laboratory Sciences', courses: ['Medical Laboratory Sciences'] },
  { department: 'Department of Health Records and Information Technology', courses: ['Health Records & Information Technology'] },
  { department: 'Department of Health Service Management', courses: ['Health Service Management'] },
  { department: 'Department of Nursing', courses: ['Nursing', 'Community Health Nursing'] },
  { department: 'Department of Pharmacy', courses: ['Pharmacy'] },
  { department: 'Department of Dental Technology', courses: ['Dental Technology'] },
  { department: 'Department of Optometry', courses: ['Optometry'] },
  { department: 'Department of Medical Engineering', courses: ['Medical Engineering'] },
  { department: 'Department of Occupational Therapy', courses: ['Occupational Therapy'] },
  { department: 'Department of Physiotherapy', courses: ['Physiotherapy'] },
  { department: 'Department of Orthopaedic Technology', courses: ['Orthopaedic Technology'] },
  { department: 'Department of Community Oral Health', courses: ['Community Oral Health'] },
  { department: 'Department of Nutrition and Dietetics', courses: ['Nutrition & Dietetics'] },
  { department: 'Department of Health Promotion and Community Health', courses: ['Health Promotion', 'Community Health'] },
  { department: 'Department of Public Health Sciences', courses: ['Public Health'] },
  { department: 'Department of Mortuary Science', courses: ['Mortuary Science'] },
  { department: 'Department of Medical Social Work', courses: ['Medical Social Work'] },
  { department: 'Department of Emergency Medical Technology', courses: ['Emergency Medical Technology (EMT)'] },
  { department: 'Department of Environmental Health Sciences', courses: ['Environmental Health Sciences'] },
  { department: 'Department of Medical Education', courses: ['Medical Education'] },
  { department: 'Department of Health Systems Management', courses: ['Health Systems Management'] },
  { department: 'Department of Speech Therapy', courses: ['Speech & Language Therapy'] },
];

const departmentOptions = departmentCourseOptions.map(({ department }) => department);

function coursesForDepartment(department: string) {
  return departmentCourseOptions.find((option) => option.department === department)?.courses ?? [];
}

const initialInput: SessionInput = {
  department: '',
  course: '',
  level: 'Diploma',
  module: '',
  topic: '',
  questionType: 'mcq',
  count: 10,
};

const levelOptions: Level[] = ['Certificate', 'Upgrading', 'Diploma', 'Higher Diploma'];
const styleOptions: { value: QuestionType; label: string; note: string }[] = [
  { value: 'mcq', label: 'Multiple choice', note: 'Choose the strongest answer' },
  { value: 'short', label: 'Short answer', note: 'Recall it in your own words' },
  { value: 'long', label: 'Long answer', note: 'Give a considered response' },
];

const sessionInputStorageKey = 'med-a:last-session-input';

function savedSessionInput(): SessionInput {
  if (typeof window === 'undefined') return initialInput;
  try {
    const stored = JSON.parse(localStorage.getItem(sessionInputStorageKey) || '{}') as Partial<SessionInput>;
    const level = levelOptions.includes(stored.level as Level) ? stored.level as Level : initialInput.level;
    const questionType = styleOptions.some((option) => option.value === stored.questionType)
      ? stored.questionType as QuestionType
      : initialInput.questionType;
    const count = typeof stored.count === 'number' && Number.isFinite(stored.count)
      ? Math.min(20, Math.max(1, Math.round(stored.count)))
      : initialInput.count;
    const department = typeof stored.department === 'string' && departmentOptions.includes(stored.department)
      ? stored.department
      : initialInput.department;
    const courseOptions = coursesForDepartment(department);
    const course = typeof stored.course === 'string' && courseOptions.includes(stored.course)
      ? stored.course
      : initialInput.course;
    return {
      ...initialInput,
      department,
      course,
      level,
      module: typeof stored.module === 'string' ? stored.module : initialInput.module,
      topic: typeof stored.topic === 'string' ? stored.topic : initialInput.topic,
      questionType,
      count,
    };
  } catch {
    return initialInput;
  }
}

type RichTextProps = {
  text: string;
  className?: string;
  as?: 'span' | 'div' | 'p' | 'h2';
};

function RichText({ text, className, as = 'span' }: RichTextProps) {
  const Tag = as;
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g);

  return (
    <Tag className={className}>
      {parts.map((part, index) => {
        const isDisplay = part.startsWith('$$') || part.startsWith('\\[');
        const isInline = part.startsWith('$') || part.startsWith('\\(');
        if (!isDisplay && !isInline) {
          return part.split('\n').map((line, lineIndex) => (
            <span key={`${index}-${lineIndex}`}>
              {lineIndex > 0 && <br />}
              {line}
            </span>
          ));
        }

        const source = isDisplay
          ? part.slice(2, -2)
          : part.startsWith('\\(')
            ? part.slice(2, -2)
            : part.slice(1, -1);
        let markup = '';
        try {
          markup = katex.renderToString(source, {
            displayMode: isDisplay,
            throwOnError: false,
            strict: false,
          });
        } catch {
          return <span key={index}>{part}</span>;
        }
        return (
          <span
            key={index}
            className={isDisplay ? 'math-display' : 'math-inline'}
            dangerouslySetInnerHTML={{ __html: markup }}
          />
        );
      })}
    </Tag>
  );
}

function BrandMark({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-3" data-testid="brand-mark">
      <img
        src={appLogo}
        alt="ZetuBridge"
        className={`size-11 rounded-xl bg-white p-0.5 object-contain shadow-[0_3px_10px_rgba(18,65,92,.16)] ${dark ? 'ring-1 ring-[#f5d12c]/70' : 'ring-1 ring-[#d8d0c2]'}`}
        data-testid="img-brand-logo"
      />
      <span className={`font-serif text-[1.15rem] font-extrabold tracking-[-0.04em] ${dark ? 'text-[#f6f1e8]' : 'text-[#17263d]'}`}>MED-A</span>
    </div>
  );
}

function savedSubscriptionEmail() {
  return typeof window === 'undefined' ? '' : localStorage.getItem('user_email')?.trim().toLowerCase() ?? '';
}

function deviceId() {
  if (typeof window === 'undefined') return '';
  const key = 'device_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function accessErrorMessage(error: unknown) {
  const apiError = error as { status?: number; data?: { error?: string } } | null;
  if (apiError?.status === 402 || apiError?.data?.error === 'SUBSCRIPTION_REQUIRED') {
    return 'No active subscription was found. Complete a subscription in the app, then try again.';
  }
  if (apiError?.status === 403 || apiError?.data?.error === 'ACCOUNT_DISABLED') {
    return 'This subscription is not available right now. Please contact support.';
  }
  return 'We could not confirm your subscription. Please try again.';
}

type StudyStreamHandlers = {
  onQuestion: (question: StudyQuestion, generatedAt: string) => void;
  onDone: (generatedAt: string) => void;
  onError: (message: string, retryable: boolean) => void;
};

async function streamStudyQuestions(input: SessionInput & { email: string; deviceId: string }, handlers: StudyStreamHandlers) {
  const response = await fetch('/api/study/questions/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw Object.assign(new Error(body.error || 'We could not load the revision questions.'), {
      status: response.status,
      data: body,
    });
  }

  if (!response.body) {
    throw new Error('The question desk did not open a stream.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  const readEvents = (chunk: string) => {
    buffer += chunk;
    let separator = buffer.indexOf('\n\n');
    while (separator >= 0) {
      const block = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
      const data = block.match(/^data:\s*(.+)$/m)?.[1]?.trim();
      if (event && data) {
        const payload = JSON.parse(data) as {
          question?: StudyQuestion;
          generatedAt?: string;
          error?: string;
          retryable?: boolean;
        };
        if (event === 'question' && payload.question) {
          handlers.onQuestion(payload.question, payload.generatedAt || new Date().toISOString());
        } else if (event === 'done') {
          finished = true;
          handlers.onDone(payload.generatedAt || new Date().toISOString());
        } else if (event === 'error') {
          finished = true;
          handlers.onError(
            payload.error || 'Some revision questions could not be loaded.',
            payload.retryable !== false,
          );
        }
      }
      separator = buffer.indexOf('\n\n');
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    readEvents(decoder.decode(value, { stream: true }));
  }
  readEvents(decoder.decode());
  if (!finished) handlers.onDone(new Date().toISOString());
}

type StudyAnswerStreamInput = Omit<SessionInput, 'count'> & {
  question: string;
  options?: string[];
  correctAnswer?: string;
  email: string;
  deviceId: string;
};

async function streamStudyAnswer(
  input: StudyAnswerStreamInput,
  signal: AbortSignal,
  handlers: { onDelta: (text: string) => void; onDone: () => void },
) {
  const response = await fetch('/api/study/answer/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(input),
    signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw Object.assign(new Error(body.error || 'MED-A could not prepare this answer.'), {
      status: response.status,
      data: body,
    });
  }
  if (!response.body) throw new Error('The answer stream did not open.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  const readEvents = (chunk: string) => {
    buffer += chunk.replace(/\r\n/g, '\n');
    let separator = buffer.indexOf('\n\n');
    while (separator >= 0) {
      const block = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
      const data = block.match(/^data:\s*(.+)$/m)?.[1]?.trim();
      if (event && data) {
        const payload = JSON.parse(data) as { text?: string; error?: string };
        if (event === 'delta' && typeof payload.text === 'string') {
          handlers.onDelta(payload.text);
        } else if (event === 'done') {
          finished = true;
          handlers.onDone();
        } else if (event === 'error') {
          throw new Error(payload.error || 'MED-A could not prepare this answer.');
        }
      }
      separator = buffer.indexOf('\n\n');
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      readEvents(decoder.decode(value, { stream: true }));
    }
    readEvents(decoder.decode());
  } finally {
    reader.releaseLock();
  }
  if (!finished) throw new Error('The answer stream ended early. Please try again.');
}

async function fetchStudyQuestions(input: SessionInput & { email: string; deviceId: string }) {
  const response = await fetch('/api/study/questions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => ({})) as {
    questions?: StudyQuestion[];
    generatedAt?: string;
    error?: string;
  };
  if (!response.ok) {
    throw Object.assign(new Error(body.error || 'We could not finish the requested question set.'), {
      status: response.status,
      data: body,
    });
  }
  if (!Array.isArray(body.questions) || body.questions.length !== input.count) {
    throw new Error('The question desk did not return the complete requested set.');
  }
  return {
    questions: body.questions,
    generatedAt: body.generatedAt || new Date().toISOString(),
  };
}

function SubscriptionGuide({
  open,
  checking,
  error,
  onCheck,
  onClose,
}: {
  open: boolean;
  checking: boolean;
  error: string;
  onCheck: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-[#253630]/45 px-3 py-4 backdrop-blur-sm sm:px-5 sm:py-8" role="dialog" aria-modal="true" aria-labelledby="subscription-title">
      <div className="grain relative my-auto max-h-[calc(100dvh-2rem)] w-full max-w-[520px] overflow-auto rounded-[1.35rem] border border-[#c7bca9] bg-[#fbf7ee] p-5 text-[#253630] shadow-[0_24px_80px_rgba(37,54,48,.24)] sm:max-h-full sm:p-8">
        <button type="button" onClick={onClose} className="focus-ring absolute right-4 top-4 rounded-full p-2 text-[#8d806d] transition hover:bg-[#eee3d2] hover:text-[#253630]" aria-label="Close subscription guide" data-testid="button-close-subscription"><X className="size-4" /></button>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-[#dce8dc] text-[#2f554c]"><LockKeyhole className="size-5" /></div>
          <div>
            <p className="page-number">access / subscription</p>
            <h2 id="subscription-title" className="mt-1 font-serif text-2xl font-semibold tracking-[-.04em]">Unlock your study desk</h2>
          </div>
        </div>
        <p className="text-[15px] leading-7 text-[#66766d]">One subscription gives you access to MED-A revision questions across departments. To subscribe, use the menu in the top-left corner of this app, then return here to continue.</p>
        <div className="mt-6 rounded-xl border border-[#d7cbb9] bg-[#f7f0e4] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#9a866b]">Three quick steps</p>
          <ol className="mt-4 space-y-3">
            <li className="flex gap-3 text-sm leading-6"><b className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#2f554c] font-mono text-xs text-[#fbf7ee]">1</b><span>Tap the menu in the top-left corner of this app.</span></li>
            <li className="flex gap-3 text-sm leading-6"><b className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#2f554c] font-mono text-xs text-[#fbf7ee]">2</b><span>Tap <em>Subscription</em>, select a plan, and complete the steps.</span></li>
            <li className="flex gap-3 text-sm leading-6"><b className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#2f554c] font-mono text-xs text-[#fbf7ee]">3</b><span>Come back to this page and tap <em>Continue</em>.</span></li>
          </ol>
        </div>
        {error && <p className="mt-5 rounded-lg border border-[#e7ae9f] bg-[#fff1ed] p-3 text-sm leading-6 text-[#8d463b]" role="alert" data-testid="status-access-error">{error}</p>}
        <button type="button" onClick={onCheck} disabled={checking} className="focus-ring mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#f5d12c] px-5 py-3.5 text-sm font-extrabold text-[#253630] shadow-[0_3px_0_#c1a51d] transition hover:bg-[#ffe26b] disabled:cursor-wait disabled:opacity-60" data-testid="button-check-subscription">
          {checking ? <><span className="size-3.5 animate-pulse rounded-full bg-[#4f766a]" /> loading your questions</> : <>Continue <ChevronRight className="size-4" /></>}
        </button>
        <p className="mt-4 text-center text-[11px] text-[#9a866b]">Your subscription gives you access to the MED-A revision library.</p>
      </div>
    </div>
  );
}

function TopBar({ stage, onRestart }: { stage: View; onRestart?: () => void }) {
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-[1280px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
      <BrandMark />
      <div className="flex items-center gap-3">
        {stage === 'setup' ? (
          <>
            <span className="text-[12px] font-extrabold tracking-[-0.02em] text-[#35504d]">ZetuBridge</span>
          </>
        ) : (
          <button
            type="button"
            onClick={onRestart}
            className="focus-ring flex items-center gap-2 rounded-full border border-[#d8d0c2] bg-[#f6f1e8] px-3.5 py-2 text-xs font-bold text-[#35504d] transition hover:border-[#183b3b] hover:bg-[#ebe4d8]"
            data-testid="button-exit-session"
          >
            <X className="size-3.5" /> End session
          </button>
        )}
      </div>
    </header>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  testId,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  testId: string;
}) {
  return (
    <label className="group block" htmlFor={testId}>
      <span className="mb-2 flex items-baseline justify-between text-[11px] font-bold uppercase tracking-[0.15em] text-[#68736e]">
        {label}
        {hint && <span className="font-medium normal-case tracking-normal text-[#9a9d92]">{hint}</span>}
      </span>
      <input
        id={testId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="focus-ring h-12 w-full rounded-xl border border-[#d8d0c2] bg-[#fbf8f2] px-4 text-[15px] font-medium text-[#17263d] outline-none transition placeholder:text-[#a8aaa1] hover:border-[#9bafa5] focus:border-[#183b3b] focus:bg-[#fdfbf7]"
        data-testid={`input-${testId}`}
      />
    </label>
  );
}

function SelectField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  options,
  testId,
  disabled = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: string[];
  testId: string;
  disabled?: boolean;
}) {
  return (
    <label className="group block min-w-0" htmlFor={testId}>
      <span className="mb-2 flex items-baseline justify-between text-[11px] font-bold uppercase tracking-[0.15em] text-[#68736e]">
        {label}
        {hint && <span className="font-medium normal-case tracking-normal text-[#9a9d92]">{hint}</span>}
      </span>
      <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          id={testId}
          className="focus-ring min-h-12 w-full rounded-xl border-[#d8d0c2] bg-[#fbf8f2] px-4 text-left text-[15px] font-medium text-[#17263d] shadow-none transition hover:border-[#9bafa5] focus:border-[#183b3b] focus:bg-[#fdfbf7] disabled:cursor-not-allowed disabled:opacity-60 [&>span]:line-clamp-2 [&>span]:whitespace-normal data-[placeholder]:text-[#a8aaa1]"
          data-testid={`select-${testId}`}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent
          position="item-aligned"
          className="study-select-content max-h-[min(24rem,calc(100dvh-8rem))] rounded-xl border-[#d8d0c2] bg-[#fbf8f2] p-1 text-[#17263d] shadow-[0_16px_40px_rgba(23,38,61,.16)]"
        >
          {options.map((option) => (
            <SelectItem
              key={option}
              value={option}
              className="rounded-lg py-2.5 pr-9 text-[14px] leading-5 focus:bg-[#e7f1e8] focus:text-[#183b3b]"
              data-testid={`option-${testId}-${option}`}
            >
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function Setup({
  streaming,
  streamError,
  onAccessGranted,
}: {
  streaming: boolean;
  streamError: string;
  onAccessGranted: (input: SessionInput, email: string, deviceId: string) => void;
}) {
  const [input, setInput] = useState<SessionInput>(savedSessionInput);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [accessError, setAccessError] = useState('');
  const courseOptions = coursesForDepartment(input.department);
  const requiredComplete = [input.department, input.course, input.module, input.topic].every((value) => value.trim().length > 0);

  useEffect(() => {
    try {
      localStorage.setItem(sessionInputStorageKey, JSON.stringify(input));
    } catch {
      // Some browsers block local storage; the form remains usable in memory.
    }
  }, [input]);

  const verifyAndGenerate = () => {
    if (streaming) return;
    const email = savedSubscriptionEmail();
    const subscriberDeviceId = deviceId();
    if (!email || !subscriberDeviceId) {
      setAccessError('Your subscription is not active yet. Use the app menu to choose a subscription, then return here to continue.');
      setSubscriptionOpen(true);
      return;
    }
    if (!requiredComplete) {
      setAccessError('Complete every study detail, then start your revision questions.');
      setSubscriptionOpen(true);
      return;
    }
    setAccessError('');
    setSubscriptionOpen(false);
    onAccessGranted(input, email, subscriberDeviceId);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requiredComplete || streaming) return;
    void verifyAndGenerate();
  };

  const update = <K extends keyof SessionInput>(key: K, value: SessionInput[K]) => {
    setInput((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="grain min-h-[100dvh] overflow-hidden bg-[#f6f1e8] text-[#17263d]">
      <TopBar stage="setup" />
      <SubscriptionGuide open={subscriptionOpen} checking={streaming} error={accessError} onCheck={() => verifyAndGenerate()} onClose={() => setSubscriptionOpen(false)} />
      <main className="relative mx-auto grid w-full max-w-[1280px] gap-12 px-4 pb-16 pt-8 sm:px-8 lg:grid-cols-[minmax(330px,.85fr)_minmax(520px,1.15fr)] lg:gap-20 lg:px-12 lg:pb-24 lg:pt-16">
        <div className="pointer-events-none absolute -left-24 top-6 size-80 rounded-full bg-[#f5d12c]/20 blur-3xl" />
        <section className="relative min-w-0 flex flex-col justify-center lg:pb-10">
           <div className="animate-rise mb-7 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[#176b9b]">
             <span className="h-px w-8 bg-[#176b9b]" /> study desk / start here
          </div>
           <h1 className="animate-rise animate-rise-delay-1 max-w-[580px] break-words font-serif text-[clamp(2.7rem,6vw,4.8rem)] font-extrabold leading-[.96] tracking-[-0.065em] text-[#17263d]">
             Filter Questions <em className="font-serif not-italic text-[#176b9b]">Per Module Topics</em>
          </h1>
          <p className="animate-rise animate-rise-delay-2 mt-7 max-w-[430px] text-[17px] leading-7 text-[#66716d]">
             Choose your department, course, level, module, topic, question style, and count. Then work through one focused Filter at a time.
          </p>
          <div className="animate-rise animate-rise-delay-3 mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs font-bold text-[#7d8379]">
             <span className="flex items-center gap-2"><TimerReset className="size-4 text-[#176b9b]" /> 10–30 minutes</span>
             <span className="flex items-center gap-2"><Target className="size-4 text-[#1b9d4d]" /> ZetuBridge Library</span>
          </div>
          <div className="mt-14 hidden items-center gap-4 text-[#9a9d92] lg:flex">
            <div className="flex -space-x-2">
              <span className="flex size-8 items-center justify-center rounded-full border-2 border-[#f6f1e8] bg-[#e6b27a] text-[10px] font-bold text-[#17263d]">A</span>
              <span className="flex size-8 items-center justify-center rounded-full border-2 border-[#f6f1e8] bg-[#8fb9aa] text-[10px] font-bold text-[#17263d]">M</span>
              <span className="flex size-8 items-center justify-center rounded-full border-2 border-[#f6f1e8] bg-[#d58974] text-[10px] font-bold text-[#17263d]">T</span>
            </div>
            <span className="text-[12px]">A good desk is already a head start.</span>
          </div>
        </section>

        <section className="animate-rise animate-rise-delay-2 relative min-w-0">
          <div className="overflow-hidden rounded-[1.65rem] border border-[#d8d0c2] bg-[#fbf8f2] shadow-[0_20px_60px_rgba(23,38,61,.08)]">
             <div className="flex items-start justify-between gap-3 border-b border-[#e3ddd2] px-5 py-5 sm:items-center sm:px-8">
               <div className="min-w-0">
                  <p className="font-serif text-[20px] font-extrabold tracking-[-0.04em]">Filter Available Questions Per Topic</p>
                  <p className="mt-1 text-xs text-[#8b9189]">ZetuBridge - Building Bridges in Learning Through Technology</p>
              </div>
               <span className="flex items-center gap-1.5 rounded-full bg-[#e7f1e8] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[.13em] text-[#1b7d49]"><BookOpen className="size-3" /> ready</span>
            </div>
             <form onSubmit={submit} className="space-y-7 px-5 py-6 sm:px-8 sm:py-8">
              <div className="grid gap-6 sm:grid-cols-2">
                 <SelectField
                   label="Department"
                   value={input.department}
                   onChange={(department) => setInput((current) => ({ ...current, department, course: '' }))}
                   placeholder="Select a department"
                   options={departmentOptions}
                   testId="department"
                 />
                 <SelectField
                   label="Course of study"
                   value={input.course}
                   onChange={(course) => update('course', course)}
                   placeholder={input.department ? 'Select a course' : 'Select a department first'}
                   options={courseOptions}
                   testId="course"
                   disabled={!input.department}
                 />
              </div>
              <div>
                <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.15em] text-[#68736e]">Current level</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {levelOptions.map((level) => (
                    <button
                      type="button"
                      key={level}
                      onClick={() => update('level', level)}
                       className={`focus-ring rounded-xl border px-2 py-3 text-xs font-bold transition ${input.level === level ? 'border-[#183b3b] bg-[#183b3b] text-[#f6f1e8] shadow-[0_4px_0_#102d2d]' : 'border-[#d8d0c2] bg-[#fbf8f2] text-[#68736e] hover:border-[#8eaaa0] hover:text-[#183b3b]'}`}
                      data-testid={`button-level-${level.toLowerCase().replace(' ', '-')}`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <Field label="Module" value={input.module} onChange={(value) => update('module', value)} placeholder="e.g. Human Anatomy" testId="module" />
                <Field label="Topic" hint="be specific" value={input.topic} onChange={(value) => update('topic', value)} placeholder="e.g. The skeletal system" testId="topic" />
              </div>
              <div className="border-t border-[#e3ddd2] pt-6">
                <div className="mb-3 flex items-end justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#68736e]">Question style</span>
                  <span className="font-mono text-[11px] text-[#9a9d92]">{input.count} questions</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {styleOptions.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      onClick={() => update('questionType', option.value)}
                      className={`focus-ring rounded-xl border p-3 text-left transition ${input.questionType === option.value ? 'border-[#416b62] bg-[#eaf0e8]' : 'border-[#d8d0c2] bg-[#fbf8f2] hover:border-[#9bafa5]'}`}
                      data-testid={`button-style-${option.value}`}
                    >
                      <span className={`mb-2 flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${input.questionType === option.value ? 'bg-[#416b62] text-[#f6f1e8]' : 'bg-[#e8e1d6] text-[#7d8379]'}`}>{input.questionType === option.value ? <Check className="size-3" /> : '•'}</span>
                      <span className="block text-xs font-bold text-[#2d4145]">{option.label}</span>
                      <span className="mt-1 block text-[10px] leading-4 text-[#8b9189]">{option.note}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
                <label className="flex min-w-0 flex-1 items-center gap-3 text-xs font-bold text-[#68736e]" htmlFor="question-count">
                  <span className="whitespace-nowrap">How many</span>
                  <input
                    id="question-count"
                    type="range"
                    min="1"
                    max="20"
                    value={input.count}
                    onChange={(event) => update('count', Number(event.target.value))}
                    className="accent-[#416b62] h-1 min-w-0 flex-1"
                     aria-label="Number of questions"
                    data-testid="input-question-count"
                  />
                  <output className="w-7 font-mono text-sm font-medium text-[#183b3b]" data-testid="text-question-count">{input.count}</output>
                </label>
                <button
                  type="submit"
                    disabled={!requiredComplete || streaming}
                   className="focus-ring group flex h-12 w-full shrink-0 items-center justify-center gap-3 rounded-xl bg-[#f5d12c] px-4 text-sm font-extrabold text-[#17263d] shadow-[0_4px_0_#c1a51d] transition hover:-translate-y-0.5 hover:bg-[#ffe26b] active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 sm:w-auto sm:px-5"
                  data-testid="button-start-session"
                >
                    {streaming ? <span className="flex items-center gap-2"><span className="size-3.5 animate-pulse rounded-full bg-[#416b62]" /> loading questions</span> : <>Filter Questions <ArrowRight className="size-4 transition group-hover:translate-x-1" /></>}
                </button>
              </div>
                {streaming && (
                <div className="rounded-xl border border-[#d8d0c2] bg-[#f5f0e6] p-4" role="status" data-testid="status-generating">
                   <div className="mb-3 flex items-center gap-3 text-xs font-bold text-[#416b62]"><span className="size-2 animate-pulse rounded-full bg-[#d58974]" /> loading your first questions</div>
                  <div className="space-y-2"><div className="skeleton h-2 w-3/4 rounded-full" /><div className="skeleton h-2 w-1/2 rounded-full" /></div>
                </div>
              )}
               {streamError && (
                   <div className="flex items-start gap-3 rounded-xl border border-[#edc1b6] bg-[#fff1ed] p-4 text-[#8d463b]" role="alert" data-testid="status-generation-error">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <div className="flex-1 text-xs leading-5">
                      <strong className="font-bold">We couldn&apos;t load your questions.</strong> {streamError}
                      <button
                        type="button"
                        onClick={() => { setAccessError(streamError); setSubscriptionOpen(true); }}
                        className="focus-ring mt-2 block font-bold underline decoration-[#c97f6b]/50 underline-offset-2 hover:text-[#6f342d]"
                        data-testid="button-subscription-help"
                      >
                        Access and subscription help
                      </button>
                    </div>
                </div>
              )}
            </form>
          </div>
          <p className="mt-4 flex items-center justify-center gap-2 text-center text-[11px] text-[#9a9d92]"><LockKeyhole className="size-3" /> Nothing is saved. This desk is yours for today.</p>
        </section>
      </main>
    </div>
  );
}

function QuestionView({
  questions,
  input,
  generationComplete,
  generationError,
  onFinish,
  onRestart,
}: {
  questions: StudyQuestion[];
  input: SessionInput;
  generationComplete: boolean;
  generationError: string;
  onFinish: (responses: Record<string, string>) => void;
  onRestart: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [answerStreams, setAnswerStreams] = useState<Record<string, {
    text: string;
    loading: boolean;
    error: string;
    complete: boolean;
  }>>({});
  const answerRequests = useRef(new Map<string, AbortController>());
  const [zoom, setZoom] = useState(0.85);
  useEffect(() => () => {
    answerRequests.current.forEach((controller) => controller.abort());
    answerRequests.current.clear();
  }, []);

  const question = questions[index];
  if (!question) return null;
  const isLast = index === questions.length - 1;
  const totalQuestions = Math.max(input.count, questions.length);
  const isObjective = input.questionType === 'mcq';
  const answer = responses[question.id] ?? '';
  const isCorrect = isObjective && answer.trim().toLowerCase() === question.answer.trim().toLowerCase();
  const answerState = answerStreams[question.id];
  const progress = totalQuestions ? ((index + 1) / totalQuestions) * 100 : 0;

  const requestAnswer = (questionToAnswer: StudyQuestion) => {
    const currentAnswerState = answerStreams[questionToAnswer.id];
    if (answerRequests.current.has(questionToAnswer.id) || currentAnswerState?.complete) return;

    let email = '';
    let subscriberDeviceId = '';
    try {
      email = savedSubscriptionEmail();
      subscriberDeviceId = deviceId();
    } catch {
      setAnswerStreams((current) => ({
        ...current,
        [questionToAnswer.id]: {
          ...(current[questionToAnswer.id] ?? { text: '', loading: false, complete: false }),
          error: 'MED-A could not read the saved subscription on this device. Please restart your session.',
        },
      }));
      return;
    }
    if (!email || !subscriberDeviceId) {
      setAnswerStreams((current) => ({
        ...current,
        [questionToAnswer.id]: {
          ...(current[questionToAnswer.id] ?? { text: '', loading: false, complete: false }),
          error: 'Your saved subscription could not be found. Please restart your session.',
        },
      }));
      return;
    }

    const controller = new AbortController();
    answerRequests.current.set(questionToAnswer.id, controller);
    setAnswerStreams((current) => ({
      ...current,
      [questionToAnswer.id]: { text: '', loading: true, error: '', complete: false },
    }));

    void streamStudyAnswer({
      department: input.department,
      course: input.course,
      level: input.level,
      module: input.module,
      topic: input.topic,
      questionType: input.questionType,
      question: questionToAnswer.prompt,
      ...(isObjective
        ? { options: questionToAnswer.options, correctAnswer: questionToAnswer.answer }
        : {}),
      email,
      deviceId: subscriberDeviceId,
    }, controller.signal, {
      onDelta: (text) => {
        setAnswerStreams((current) => {
          const previous = current[questionToAnswer.id] ?? {
            text: '', loading: true, error: '', complete: false,
          };
          return {
            ...current,
            [questionToAnswer.id]: { ...previous, text: previous.text + text },
          };
        });
      },
      onDone: () => {
        setAnswerStreams((current) => ({
          ...current,
          [questionToAnswer.id]: {
            ...(current[questionToAnswer.id] ?? { text: '', loading: false, error: '' }),
            loading: false,
            error: '',
            complete: true,
          },
        }));
        if (!isObjective) {
          setResponses((current) => ({ ...current, [questionToAnswer.id]: '__reviewed__' }));
        }
      },
    }).catch((error) => {
      if (controller.signal.aborted) return;
      const status = (error as { status?: number })?.status;
      const message = status === 402 || status === 403 || status === 503
        ? accessErrorMessage(error)
        : error instanceof Error ? error.message : 'MED-A could not prepare this answer.';
      setAnswerStreams((current) => ({
        ...current,
        [questionToAnswer.id]: {
          ...(current[questionToAnswer.id] ?? { text: '', complete: false }),
          loading: false,
          error: message,
        },
      }));
    }).finally(() => {
      if (answerRequests.current.get(questionToAnswer.id) === controller) {
        answerRequests.current.delete(questionToAnswer.id);
      }
      if (controller.signal.aborted) return;
      setAnswerStreams((current) => {
        const state = current[questionToAnswer.id];
        return state ? {
          ...current,
          [questionToAnswer.id]: { ...state, loading: false },
        } : current;
      });
    });
  };

  const next = () => {
    if (isLast) {
      if (!generationComplete) return;
      onFinish(responses);
      return;
    }
    if (!questions[index + 1]) return;
    setIndex((current) => current + 1);
  };

  const previous = () => {
    if (index === 0) return;
    setIndex((current) => current - 1);
  };

  const zoomIn = () => setZoom((current) => Math.min(1.2, Number((current + 0.05).toFixed(2))));
  const zoomOut = () => setZoom((current) => Math.max(0.85, Number((current - 0.05).toFixed(2))));
  const resetZoom = () => setZoom(1);
  const canGoNext = isLast ? generationComplete : Boolean(questions[index + 1]);

  return (
    <div className="grain reader-app min-h-[100dvh] bg-[#f1eadc] text-[#253630]">
      <TopBar stage="quiz" onRestart={onRestart} />
      <main className="reader-main mx-auto w-full max-w-[1220px] px-3 pb-8 pt-2 sm:px-7 sm:pt-5 lg:px-10 lg:pt-7">
        <div className="reader-heading animate-rise">
          <div className="min-w-0">
            <p className="reader-kicker"><BookOpen className="size-3.5" /> {input.department} <span>/</span> {input.module}</p>
            <h1 className="reader-title">{input.topic}</h1>
          </div>
          <div className="reader-tools">
            <span className="reader-page-count" data-testid="text-question-progress">page {String(index + 1).padStart(2, '0')} <i>of {String(totalQuestions).padStart(2, '0')}</i></span>
            <div className="reader-zoom" aria-label="Text size controls">
              <button type="button" onClick={zoomOut} disabled={zoom <= .85} aria-label="Decrease text size" className="focus-ring" data-testid="button-zoom-out"><ZoomOut className="size-4" /></button>
              <button type="button" onClick={resetZoom} aria-label={`Reset text size to ${Math.round(zoom * 100)} percent`} className="focus-ring reader-zoom-value" data-testid="button-zoom-reset">{Math.round(zoom * 100)}%</button>
              <button type="button" onClick={zoomIn} disabled={zoom >= 1.2} aria-label="Increase text size" className="focus-ring" data-testid="button-zoom-in"><ZoomIn className="size-4" /></button>
            </div>
          </div>
        </div>
        <div className="reader-progress-row">
          <span className="page-number shrink-0">chapter {String(index + 1).padStart(2, '0')}</span>
          <div className="reader-progress-track" aria-label="Session progress">
            <div className="reader-progress-fill" style={{ width: `${progress}%` }} data-testid="progress-session" />
          </div>
          <span className="page-number shrink-0">{generationComplete ? `${Math.round(progress)}%` : 'loading questions'}</span>
        </div>
        <div className="reader-layout">
          <section className="book-stage reader-stage animate-rise animate-rise-delay-1">
            <div className="book-page reader-page rounded-[1.25rem]" style={{ '--reader-scale': zoom } as CSSProperties}>
              <div className="book-content">
                <div className="reader-page-top">
                  <div>
                    <p className="page-number mb-2">question {String(index + 1).padStart(2, '0')}</p>
                    <div className="h-px w-14 bg-[#b6745f]" />
                  </div>
                  <span className="reader-status"><Clock3 className="size-3.5" /> {answerState?.complete ? 'answer ready' : answer ? 'choice marked' : 'take a moment'}</span>
                </div>
                <div className="reader-question-block">
                  <RichText as="h2" className="reader-question" text={question.prompt} />
                  {input.questionType === 'mcq' ? (
                    <div className="reader-options">
                      {question.options.map((option, optionIndex) => {
                        const selected = answer === option;
                        const correct = Boolean(answer) && option.trim().toLowerCase() === question.answer.trim().toLowerCase();
                        const incorrect = Boolean(answer) && selected && !correct;
                        return (
                          <button
                            type="button"
                            key={`${question.id}-${optionIndex}`}
                            disabled={Boolean(answer)}
                            onClick={() => setResponses((current) => ({ ...current, [question.id]: option }))}
                            className={`book-option reader-option focus-ring group ${correct ? 'is-correct' : incorrect ? 'is-incorrect' : selected ? 'is-selected' : ''}`}
                            data-testid={`button-option-${question.id}-${optionIndex}`}
                            aria-pressed={selected}
                          >
                            <span className="reader-option-letter">{String.fromCharCode(65 + optionIndex)}</span>
                            <RichText className="reader-option-copy" text={option} />
                            {correct && <CheckCircle2 className="reader-option-icon text-[#4f766a]" />}
                            {incorrect && <X className="reader-option-icon text-[#c97f6b]" />}
                          </button>
                        );
                      })}
                      {answer && (
                        <div className={`mcq-feedback ${isCorrect ? 'is-correct' : 'is-incorrect'}`} role="status" data-testid="status-answer-marked">
                          <span className="mcq-feedback-mark">{isCorrect ? <Check className="size-4" /> : <X className="size-4" />}</span>
                          <span>{isCorrect ? 'That’s right.' : 'Not quite. The green option is the correct answer.'}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-5 max-w-2xl text-sm leading-6 text-[#758078]">
                      Take a moment to think it through. Your model answer will be ready whenever you are.
                    </p>
                  )}
                </div>
                {answerState && (answerState.loading || answerState.text || answerState.error) && (
                  <section className="meda-answer-panel" aria-busy={answerState.loading} data-testid="panel-streamed-answer">
                    <div className="meda-answer-heading">
                      <span className="meda-answer-icon"><Sparkles className="size-4" /></span>
                      <div>
                        <p className="meda-answer-title">A note from MED-A</p>
                        <p className="meda-answer-subtitle">Your study answer</p>
                      </div>
                    </div>
                    {answerState.loading && !answerState.text && (
                      <div className="meda-thinking" role="status" aria-live="polite" data-testid="status-meda-thinking">
                        <span className="meda-thinking-bubble" aria-hidden="true">
                          <i /><i /><i />
                        </span>
                        <span className="meda-thinking-copy">
                          <strong>MED-A Thinking</strong>
                          <span>Putting the key ideas together</span>
                        </span>
                      </div>
                    )}
                    {answerState.text && (
                      <RichText
                        as="div"
                        className={`meda-answer-copy ${answerState.loading ? 'is-streaming' : ''}`}
                        text={answerState.text}
                      />
                    )}
                    {answerState.error && (
                      <p className="meda-answer-error" role="alert" data-testid="status-answer-error">{answerState.error}</p>
                    )}
                  </section>
                )}
                <div className="reader-actions">
                  <button type="button" onClick={previous} disabled={index === 0} aria-label="Go to previous question" className="reader-nav-button focus-ring" data-testid="button-previous-question"><ChevronRight className="size-4 rotate-180" /><span>Previous</span></button>
                  <span className="reader-prompt-note">{isObjective ? answer ? 'Your choice is marked. The explanation is here when you want it.' : 'Choose an option, or turn the page when you are ready.' : 'Think it through, then reveal the model answer when ready.'}</span>
                  <div className="reader-action-stack">
                    {(!isObjective || answer) && (
                      <button
                        type="button"
                        onClick={() => requestAnswer(question)}
                        disabled={answerState?.loading || answerState?.complete}
                        className="reader-primary-button reader-answer-button focus-ring group"
                        data-testid={isObjective ? 'button-get-explanation' : 'button-get-answer'}
                      >
                        {answerState?.loading ? <><span className="meda-button-dots" aria-hidden="true"><i /><i /><i /></span> MED-A Thinking</> : answerState?.complete ? 'Answer ready' : answerState?.error ? 'Try again' : isObjective ? 'Get Explanation' : 'Get Answer'}
                        {!answerState?.loading && !answerState?.complete && <Sparkles className="size-4 transition group-hover:rotate-12" />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={next}
                      disabled={!canGoNext}
                      className="reader-next-button focus-ring group"
                      data-testid={isLast && generationComplete ? 'button-see-recap' : 'button-next-question'}
                    >
                      {isLast ? generationComplete ? 'See recap' : 'Questions loading' : questions[index + 1] ? 'Next page' : 'Next question loading'}
                      {canGoNext ? <ArrowRight className="size-4 transition group-hover:translate-x-1" /> : <span className="size-3 animate-pulse rounded-full bg-[#4f766a]" />}
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#9a866b]" role="status" aria-live="polite">
                  {!generationComplete && <span className="flex items-center gap-1.5"><span className="size-1.5 animate-pulse rounded-full bg-[#1b9d4d]" /> Loading more questions</span>}
                  {generationError && <span className="text-[#a34f43]">{generationError}</span>}
                </div>
                <div className="reader-page-footer">
                  <span className="page-number">med-a / study companion</span>
                  <span className="page-number" data-testid="text-page-number">{String(index + 1).padStart(2, '0')}</span>
                </div>
              </div>
            </div>
          </section>
          <aside className="reader-aside animate-rise animate-rise-delay-2">
            <div className="reader-note-card">
              <div className="mb-7 flex items-center justify-between"><Layers3 className="size-5 text-[#4f766a]" /><span className="font-mono text-[10px] text-[#71877b]">{input.level}</span></div>
              <p className="font-serif text-[1.45rem] font-semibold leading-tight tracking-[-.04em] text-[#2f554c]">One idea at a time.</p>
              <div className="mt-7 border-t border-[#bfd1c0] pt-4 text-[11px] leading-5 text-[#71877b]">Recall first. The marking is here to teach, not to rush you.</div>
            </div>
            <div className="reader-chapter-card">
              <p className="page-number">your chapter</p>
              <p className="mt-3 text-sm font-semibold leading-6 text-[#4b6259]">{input.topic}</p>
              <div className="mt-4 h-px bg-[#d7cbb9]" />
              <p className="mt-3 text-[11px] leading-5 text-[#9a866b]">Use the arrows to move through the set.</p>
            </div>
          </aside>
        </div>
      </main>
      <div className="reader-bottom-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
    </div>
  );
}

function Recap({
  questions,
  responses,
  input,
  generatedAt,
  onRestart,
}: {
  questions: StudyQuestion[];
  responses: Record<string, string>;
  input: SessionInput;
  generatedAt: string;
  onRestart: () => void;
}) {
  const results = useMemo(() => questions.map((question) => ({
    question,
    answer: responses[question.id] ?? '',
    correct: input.questionType === 'mcq' && (responses[question.id] ?? '').trim().toLowerCase() === question.answer.trim().toLowerCase(),
  })), [input.questionType, questions, responses]);
  const correctCount = results.filter((result) => result.correct).length;
  const isObjective = input.questionType === 'mcq';
  const completedCount = results.filter((result) => result.answer.trim().length > 0).length;
  const percent = questions.length ? Math.round(((isObjective ? correctCount : completedCount) / questions.length) * 100) : 0;
  const dateLabel = generatedAt ? new Date(generatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Today';

  return (
    <div className="grain min-h-[100dvh] bg-[#f6f1e8] text-[#17263d]">
      <TopBar stage="recap" onRestart={onRestart} />
      <main className="mx-auto w-full max-w-[980px] px-5 pb-20 pt-10 sm:px-8 lg:pt-16">
        <div className="animate-rise mb-10 max-w-[650px]">
          <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.18em] text-[#416b62]"><CheckCircle2 className="size-4" /> Session complete / {dateLabel}</p>
          <h1 className="font-serif text-[clamp(3rem,7vw,5.8rem)] font-extrabold leading-[.93] tracking-[-.075em]">You made room<br /><em className="font-serif not-italic text-[#416b62]">to remember.</em></h1>
          <p className="mt-6 max-w-[510px] text-base leading-7 text-[#66716d]">A small, deliberate session is more useful than a heroic plan. Here’s what you brought back to the surface.</p>
        </div>
        <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
          <section className="animate-rise animate-rise-delay-1 rounded-[1.5rem] border border-[#d8d0c2] bg-[#183b3b] p-6 text-[#f6f1e8] shadow-[0_18px_45px_rgba(23,38,61,.12)] sm:p-8" data-testid="card-session-score">
            <div className="flex items-start justify-between">
              <div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#a9c5ad]">{isObjective ? 'Your recall' : 'Answers reviewed'}</p><p className="mt-2 font-serif text-3xl font-extrabold tracking-[-.06em]">{input.topic}</p></div>
              <div className="flex size-20 items-center justify-center rounded-full border border-[#769c86] bg-[#416b62] font-mono text-2xl text-[#f5d12c]">{percent}<span className="text-sm">%</span></div>
            </div>
            <div className="mt-12 grid grid-cols-3 gap-3 border-t border-[#5d8175] pt-5">
              <div><p className="font-mono text-2xl text-[#f5d12c]" data-testid="text-correct-count">{isObjective ? correctCount : completedCount}</p><p className="mt-1 text-[10px] uppercase tracking-[.14em] text-[#a9c5ad]">{isObjective ? 'correct' : 'answers read'}</p></div>
              <div><p className="font-mono text-2xl text-[#f6f1e8]" data-testid="text-question-count-recap">{questions.length}</p><p className="mt-1 text-[10px] uppercase tracking-[.14em] text-[#a9c5ad]">visited</p></div>
              <div><p className="font-mono text-2xl text-[#f6f1e8]">1</p><p className="mt-1 text-[10px] uppercase tracking-[.14em] text-[#a9c5ad]">session</p></div>
            </div>
          </section>
          <section className="animate-rise animate-rise-delay-2 rounded-[1.5rem] border border-[#d8d0c2] bg-[#fbf8f2] p-6 sm:p-8">
            <div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-xl bg-[#f5d12c] text-[#183b3b]"><Lightbulb className="size-4" /></div><p className="font-serif text-xl font-extrabold tracking-[-.04em]">A note for next time</p></div>
             <p className="mt-7 text-[15px] leading-7 text-[#66716d]">{isObjective ? (correctCount === questions.length ? 'Strong recall. The next useful move is to return tomorrow before the answers feel easy.' : 'The edges you missed are not failures — they are your best next starting points. Revisit the explanations while they are fresh.') : 'Your model answers are ready to revisit. Return to the questions you have not reviewed and work through the key points while they are fresh.'}</p>
            <div className="mt-8 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.15em] text-[#416b62]"><BookOpen className="size-3.5" /> {input.course} / {input.level}</div>
          </section>
        </div>
        <section className="animate-rise animate-rise-delay-3 mt-5 rounded-[1.5rem] border border-[#d8d0c2] bg-[#fbf8f2] p-6 sm:p-8">
          <div className="mb-5 flex items-center justify-between"><p className="font-serif text-xl font-extrabold tracking-[-.04em]">Your trail</p><span className="font-mono text-[11px] text-[#9a9d92]">{questions.length} questions</span></div>
          <div className="recap-trail grid gap-2 sm:grid-cols-2">
            {results.map((result, resultIndex) => (
              <div key={result.question.id} className="recap-trail-row flex min-w-0 items-start gap-3 rounded-xl border border-[#e3ddd2] px-3.5 py-3" data-testid={`row-recap-${result.question.id}`}>
                 <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${result.correct || (!isObjective && result.answer.trim()) ? 'bg-[#eaf0e8] text-[#416b62]' : 'bg-[#fff1ed] text-[#d58974]'}`}>{result.correct || (!isObjective && result.answer.trim()) ? <Check className="size-3.5" /> : <span className="font-mono text-xs">{resultIndex + 1}</span>}</span>
                <RichText className="min-w-0 flex-1 text-xs font-semibold leading-5 text-[#53625e]" text={result.question.prompt} />
                <span className="shrink-0 pt-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#9a9d92]">{result.correct || (!isObjective && result.answer.trim()) ? (isObjective ? 'solid' : 'read') : 'review'}</span>
              </div>
            ))}
          </div>
        </section>
        <div className="animate-rise animate-rise-delay-3 mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
           <button type="button" onClick={onRestart} className="focus-ring group flex items-center gap-2 rounded-xl bg-[#f5d12c] px-6 py-3.5 text-sm font-extrabold text-[#17263d] shadow-[0_3px_0_#c1a51d] transition hover:bg-[#ffe26b] active:translate-y-0.5 active:shadow-none" data-testid="button-new-session"><RotateCcw className="size-4 transition group-hover:-rotate-45" /> Start a new session</button>
          <p className="flex items-center gap-2 text-xs text-[#9a9d92]"><LockKeyhole className="size-3" /> Nothing stored, as promised.</p>
        </div>
      </main>
    </div>
  );
}

function Home() {
  const [view, setView] = useState<View>('setup');
  const [questions, setQuestions] = useState<StudyQuestion[]>([]);
  const [input, setInput] = useState<SessionInput>(initialInput);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [generatedAt, setGeneratedAt] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [generationComplete, setGenerationComplete] = useState(true);
  const [generationError, setGenerationError] = useState('');
  const [launchError, setLaunchError] = useState('');
  const streamRun = useRef(0);

  const reset = () => {
    streamRun.current += 1;
    setView('setup');
    setQuestions([]);
    setResponses({});
    setGeneratedAt('');
    setStreaming(false);
    setGenerationComplete(true);
    setGenerationError('');
    setLaunchError('');
  };

  const startStream = (nextInput: SessionInput, email: string, subscriberDeviceId: string) => {
    const runId = streamRun.current + 1;
    streamRun.current = runId;
    setInput(nextInput);
    setQuestions([]);
    setResponses({});
    setGeneratedAt('');
    setGenerationError('');
    setLaunchError('');
    setStreaming(true);
    setGenerationComplete(false);
    let receivedFirstQuestion = false;

    let retryAttempt = 0;
    let retryTimer: number | undefined;

    const retryStream = (message: string) => {
      if (streamRun.current !== runId) return;
      setStreaming(true);
      setGenerationComplete(false);
      setGenerationError(`${message} Retrying automatically…`);
      const delay = Math.min(8_000, 750 * 2 ** Math.min(retryAttempt, 4));
      retryAttempt += 1;
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        if (streamRun.current === runId) openStream();
      }, delay);
    };

    const openStream = () => {
      if (streamRun.current !== runId) return;
      void streamStudyQuestions(
        { ...nextInput, email, deviceId: subscriberDeviceId },
        {
          onQuestion: (question, date) => {
            if (streamRun.current !== runId) return;
            retryAttempt = 0;
            setGenerationError('');
            setQuestions((current) => {
              const questionNumber = Number(question.id.match(/(\d+)$/)?.[1] ?? 0);
              const existingIndex = current.findIndex((item) => item.id === question.id);
              const replaceIndex = existingIndex >= 0 ? existingIndex : questionNumber - 1;
              if (replaceIndex >= 0 && replaceIndex < current.length) {
                const next = [...current];
                next[replaceIndex] = question;
                return next;
              }
              return [...current, question];
            });
            setGeneratedAt((current) => current || date);
            if (!receivedFirstQuestion) {
              receivedFirstQuestion = true;
              setView('quiz');
            }
          },
          onDone: (date) => {
            if (streamRun.current !== runId) return;
            setStreaming(false);
            setGenerationComplete(true);
            setGenerationError('');
            setGeneratedAt((current) => current || date);
          },
          onError: (message, retryable) => {
            if (retryable) {
              retryStream(message);
              return;
            }
            if (streamRun.current !== runId) return;
            setStreaming(false);
            setGenerationComplete(true);
            setGenerationError(message);
            if (!receivedFirstQuestion) setLaunchError(message);
          },
        },
      ).catch((error) => {
        if (streamRun.current !== runId) return;
        const status = (error as { status?: number }).status;
        if (status === 400 || status === 402 || status === 403 || status === 503) {
          const message = status === 400
            ? 'Please check the study details and try again.'
            : accessErrorMessage(error);
          setStreaming(false);
          setGenerationComplete(true);
          setGenerationError(message);
          if (!receivedFirstQuestion) setLaunchError(message);
          return;
        }
        retryStream(error instanceof Error ? error.message : 'The question stream was interrupted.');
      });
    };

    openStream();
    return () => {
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  };

  if (view === 'quiz') {
    return <QuestionView questions={questions} input={input} generationComplete={generationComplete} generationError={generationError} onFinish={(answers) => { setResponses(answers); setView('recap'); }} onRestart={reset} />;
  }
  if (view === 'recap') {
    return <Recap questions={questions} responses={responses} input={input} generatedAt={generatedAt} onRestart={reset} />;
  }
  return <Setup streaming={streaming} streamError={launchError} onAccessGranted={startStream} />;
}

function Router() {
  return (
    <ErrorBoundary resetKey={useLocation()[0]}>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={Home} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <div className="app-shell">
            <div className="app-scroll">
              <Router />
            </div>
          </div>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
