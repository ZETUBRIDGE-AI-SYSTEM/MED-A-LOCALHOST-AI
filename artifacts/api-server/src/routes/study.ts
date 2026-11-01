import { Router, type IRouter } from "express";
import {
  CheckStudyAccessBody,
  GenerateStudyQuestionsBody,
  GenerateStudyQuestionsResponse,
  StreamStudyAnswerBody,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import {
  OllamaQueueFullError,
  OllamaQueueTimeoutError,
  withOllamaRequestSlot,
} from "../lib/ollama-request-queue";

const router: IRouter = Router();

type GeneratedQuestion = {
  id: string;
  prompt: string;
  options: string[];
  answer: string;
  answerPoints: string[];
  explanation: string;
  answerLabel: string;
};

type SubscriptionCheckPayload = {
  access?: unknown;
  active?: unknown;
  authorized?: unknown;
  disabled?: unknown;
  accountDisabled?: unknown;
  hasAccess?: unknown;
  isActive?: unknown;
  ok?: unknown;
  subscribed?: unknown;
  valid?: unknown;
  status?: unknown;
};

type StudyContext = {
  department: string;
  course: string;
  level: "Certificate" | "Upgrading" | "Diploma" | "Higher Diploma";
  module: string;
  topic: string;
  questionType: "mcq" | "short" | "long";
  count: number;
};

type OllamaSettings = {
  baseUrl: string;
  model: string | null;
};

const OLLAMA_STREAM_IDLE_TIMEOUT_MS = 120_000;
const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = "qwen2.5:7b";
const OLLAMA_MODEL_CACHE_TTL_MS = 30_000;
const ollamaModelCache = new Map<string, { model: string; expiresAt: number }>();
const ollamaModelLookups = new Map<string, Promise<string>>();

function isTruthyFlag(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

async function verifySubscription(email: string, deviceId: string) {
  const verifierUrl = new URL("https://api.zetubridge.co.ke/verify-access");
  verifierUrl.searchParams.set("email", email);
  verifierUrl.searchParams.set("device_id", deviceId);
  let response: Response;
  try {
    response = await fetch(verifierUrl, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    throw Object.assign(new Error("The subscription service could not be reached."), {
      code: "SUBSCRIPTION_UNAVAILABLE",
      cause: error,
    });
  }

  let payload: SubscriptionCheckPayload = {};
  try {
    payload = (await response.json()) as SubscriptionCheckPayload;
  } catch {
    payload = {};
  }

  const status = typeof payload.status === "string" ? payload.status.toLowerCase() : "";
  const disabled =
    isTruthyFlag(payload.disabled) ||
    isTruthyFlag(payload.accountDisabled) ||
    status === "disabled" ||
    status === "suspended";
  if (disabled) {
    throw Object.assign(new Error("This subscription account has been disabled."), {
      code: "ACCOUNT_DISABLED",
    });
  }

  if (!response.ok) {
    if (response.status >= 500) {
      throw Object.assign(new Error("The subscription service is temporarily unavailable."), {
        code: "SUBSCRIPTION_UNAVAILABLE",
      });
    }
    throw Object.assign(new Error("No active subscription was found for this email and device."), {
      code: "SUBSCRIPTION_REQUIRED",
    });
  }

  if (payload.access !== true) {
    throw Object.assign(new Error("No active subscription was found for this email and device."), {
      code: "SUBSCRIPTION_REQUIRED",
    });
  }
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1));
  }
  return JSON.parse(withoutFence);
}

function stripOptionLabel(value: string) {
  const withoutPrefixes = value.trim().replace(/^(?:(?:option\s*)?\(?[A-D]\)?[.):\-]\s*)+/i, "").trim();
  return /^(?:option\s*)?\(?[A-D]\)?$/i.test(withoutPrefixes) ? "" : withoutPrefixes;
}

function normalizeQuestions(
  payload: unknown,
  count: number,
  questionType: "mcq" | "short" | "long",
): GeneratedQuestion[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { questions?: unknown }).questions)) {
    throw new Error("The study set was not returned in the expected format.");
  }

  const questions = (payload as { questions: unknown[] }).questions.slice(0, count);
  if (questions.length !== count) {
    throw new Error("The study set did not contain the requested number of questions.");
  }

  return questions.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Question ${index + 1} was not returned in the expected format.`);
    }
    const question = item as Partial<GeneratedQuestion>;
    if (typeof question.prompt !== "string") {
      throw new Error(`Question ${index + 1} is missing study content.`);
    }

    const rawOptions = Array.isArray(question.options)
      ? question.options.filter((option): option is string => typeof option === "string" && option.trim().length > 0)
      : [];
    const options = rawOptions.map(stripOptionLabel).filter(Boolean);
    if (questionType === "mcq" && options.length !== 4) {
      throw new Error(`Question ${index + 1} did not include exactly four usable choices.`);
    }
    if (
      questionType === "mcq" &&
      (
        options.every((option) => /^[A-D]$/i.test(option)) ||
        new Set(options.map((option) => option.toLowerCase())).size !== 4
      )
    ) {
      throw new Error(`Question ${index + 1} returned letter labels or duplicate choices instead of choice text.`);
    }

    const rawAnswer = typeof question.answer === "string" ? question.answer.trim() : "";
    const answerText = stripOptionLabel(rawAnswer);
    const answerLabelMatch = rawAnswer.match(/^(?:option\s*)?\(?([A-D])\)?(?:[.)])?$/i);
    const answerLabelIndex = answerLabelMatch
      ? answerLabelMatch[1].toUpperCase().charCodeAt(0) - 65
      : -1;
    const answer = options.find((option) => option.toLowerCase() === answerText.toLowerCase())
      ?? (answerLabelIndex >= 0 ? options[answerLabelIndex] ?? "" : answerText);
    if (
      questionType === "mcq" &&
      (!answer || !options.some((option) => option.trim().toLowerCase() === answer.toLowerCase()))
    ) {
      throw new Error(`Question ${index + 1} did not identify its correct option exactly.`);
    }

    return {
      id: typeof question.id === "string" ? question.id : `study-question-${index + 1}`,
      prompt: question.prompt,
      options: questionType === "mcq" ? options : [],
      answer: questionType === "mcq" ? answer : "",
      answerPoints: [],
      explanation: "",
      answerLabel: "",
    };
  });
}

function questionOnlyPrompt(context: StudyContext) {
  const isMultipleChoice = context.questionType === "mcq";
  const responseShape = isMultipleChoice
    ? `{"questions":[{"id":"q1","prompt":"...","options":["First full choice text","Second full choice text","Third full choice text","Fourth full choice text"],"answer":"exact full correct choice text"}]}`
    : `{"questions":[{"id":"q1","prompt":"...","options":[]}]}`;
  const contentInstruction = isMultipleChoice
    ? `Write exactly four distinct, meaningful choices. The sample choice strings in the JSON shape are placeholders; replace each with a real choice. Each "options" value must contain only choice text; do not prefix it with A, B, C, or D because the interface adds those labels. Never return the letters A, B, C, D as the choices. Put the exact full text of the correct choice in "answer". Do not include an explanation, worked solution, answer points, or answer label.`
    : `Write only the question. Do not include an answer, model answer, explanation, worked solution, answer points, or answer label.`;

  return `Create one accurate, focused revision question for this student context:
- Department: ${context.department}
- Course: ${context.course}
- Level: ${context.level}
- Module: ${context.module}
- Topic: ${context.topic}
- Style: ${context.questionType}

The question must be clear, relevant, appropriately challenging, and not a trick. Keep it concise enough to start practice quickly. ${contentInstruction}
Use LaTeX delimiters for mathematical or chemical notation when needed.
Return ONLY valid JSON matching this exact shape, with no markdown fences or additional text:
${responseShape}`;
}

function answerPrompt(input: {
  department: string;
  course: string;
  level: "Certificate" | "Upgrading" | "Diploma" | "Higher Diploma";
  module: string;
  topic: string;
  questionType: "mcq" | "short" | "long";
  question: string;
  options?: string[];
  correctAnswer?: string;
}) {
  const context = `Study context: ${input.department} / ${input.course} / ${input.level} / ${input.module} / ${input.topic}.`;
  if (input.questionType === "mcq") {
    return `You are MED-A, a careful revision tutor. Explain this multiple-choice answer in a clear, warm, concise way.
${context}
Question: ${input.question}
Options:
${(input.options ?? []).map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join("\n")}
Correct option: ${input.correctAnswer}

Start with a short heading, then explain why the correct option is right. If useful, briefly distinguish the closest distractor. Do not repeat the full question or invent unsupported details. Keep it to about 2-4 sentences. Use LaTeX delimiters for math or chemistry when relevant. Do not mention AI, chatbots, or how the answer was prepared. Return readable plain text, not JSON or markdown fences.`;
  }

  const lengthGuidance = input.questionType === "long"
    ? "Write a thorough model answer with a brief opening, well-organized key points, and a concise conclusion. Aim for 5-8 meaningful points."
    : "Write a focused model answer with a direct opening and 3-5 complete, useful supporting points.";
  return `You are MED-A, a careful revision tutor. Prepare a high-quality model answer for this question.
${context}
Question: ${input.question}

${lengthGuidance} Explain the subject clearly from the top, like a textbook answer. Use a short heading and readable paragraphs or bullets. Be factually careful, do not refer to the learner or their response, and do not add an invitation to ask more questions. Do not mention AI, chatbots, or how the answer was prepared. For calculations, show the formula, substitution, working, and units. Use LaTeX delimiters for math or chemistry when relevant. Return readable plain text, not JSON or markdown fences.`;
}

function configuredOllamaSettings(): OllamaSettings {
  const baseUrl = (process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_URL).replace(/\/+$/, "");
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    throw new Error("OLLAMA_BASE_URL must be a valid URL, such as http://127.0.0.1:11434.");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("OLLAMA_BASE_URL must use http or https.");
  }

  return {
    baseUrl: parsedUrl.toString().replace(/\/+$/, ""),
    model: process.env.OLLAMA_MODEL?.trim() || null,
  };
}

async function getOllamaModel(settings: OllamaSettings, timeoutMs: number) {
  if (settings.model) return settings.model;

  const cached = ollamaModelCache.get(settings.baseUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.model;

  const pendingLookup = ollamaModelLookups.get(settings.baseUrl);
  if (pendingLookup) return pendingLookup;

  const lookup = fetchOllamaModel(settings, timeoutMs);
  ollamaModelLookups.set(settings.baseUrl, lookup);
  try {
    const model = await lookup;
    ollamaModelCache.set(settings.baseUrl, {
      model,
      expiresAt: Date.now() + OLLAMA_MODEL_CACHE_TTL_MS,
    });
    return model;
  } finally {
    if (ollamaModelLookups.get(settings.baseUrl) === lookup) {
      ollamaModelLookups.delete(settings.baseUrl);
    }
  }
}

async function fetchOllamaModel(settings: OllamaSettings, timeoutMs: number) {
  let response: Response;
  try {
    response = await fetch(`${settings.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(Math.max(1_000, timeoutMs)),
    });
  } catch {
    throw new Error(
      `Ollama is not responding at ${settings.baseUrl}. Start the Ollama app, then try again.`,
    );
  }

  if (!response.ok) {
    throw new Error(`Ollama could not list installed models (HTTP ${response.status}).`);
  }

  const body = (await response.json().catch(() => ({}))) as {
    models?: Array<{ name?: unknown }>;
  };
  const model = body.models?.find(
    (candidate): candidate is { name: string } =>
      typeof candidate.name === "string" && candidate.name.trim().length > 0,
  )?.name;
  if (!model) {
    throw new Error(
      `No Ollama model is installed. In PowerShell, run: ollama pull ${DEFAULT_OLLAMA_MODEL}`,
    );
  }
  return model;
}

async function generateWithOllama(
  context: StudyContext,
  settings: OllamaSettings,
  timeoutMs = 300_000,
  signal?: AbortSignal,
) {
  return withOllamaRequestSlot("question", signal, () =>
    generateWithOllamaUnlocked(context, settings, timeoutMs, signal),
  );
}

async function generateWithOllamaUnlocked(
  context: StudyContext,
  settings: OllamaSettings,
  timeoutMs: number,
  signal?: AbortSignal,
) {
  const questionTokenLimit = context.questionType === "mcq" ? 360 : context.questionType === "long" ? 240 : 190;
  const model = await getOllamaModel(settings, timeoutMs);
  const timeoutSignal = AbortSignal.timeout(Math.max(1_000, timeoutMs));
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  let response: Response;
  try {
    response = await fetch(`${settings.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: questionOnlyPrompt(context) }],
        stream: false,
        format: "json",
        keep_alive: "20m",
        options: {
          temperature: 0.4,
          num_ctx: 2048,
          num_predict: questionTokenLimit,
        },
      }),
      signal: requestSignal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("Ollama took too long to answer. Try a smaller model or fewer questions.");
    }
    throw new Error(
      `Ollama is not responding at ${settings.baseUrl}. Start the Ollama app, then try again.`,
      { cause: error },
    );
  }

  let body: {
    error?: string;
    message?: { content?: unknown };
  };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new Error(`Ollama returned an unreadable response (HTTP ${response.status}).`);
  }

  if (!response.ok || body.error) {
    const detail = body.error || response.statusText;
    if (/not found|pull model/i.test(detail)) {
      throw new Error(
        `Ollama does not have the model "${model}" installed. In PowerShell, run: ollama pull ${model}`,
      );
    }
    throw new Error(`Ollama returned HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }

  const text = typeof body.message?.content === "string" ? body.message.content : "";
  if (!text) throw new Error("Ollama returned an empty answer. Try the question again.");
  const questions = normalizeQuestions(extractJson(text), 1, context.questionType);
  logger.info({ model, questionType: context.questionType }, "Ollama study question generated");
  return questions;
}

function logOllamaReadiness() {
  const settings = configuredOllamaSettings();
  logger.info(
    { baseUrl: settings.baseUrl, model: settings.model ?? "first installed Ollama model" },
    "Local Ollama question generation is configured",
  );
}

async function generateQuestionSet(context: StudyContext, settings: OllamaSettings) {
  const recovered: GeneratedQuestion[] = [];
  const questionSettings = {
    ...settings,
    model: await getOllamaModel(settings, 15_000),
  };
  for (let index = 0; index < context.count; index += 1) {
    recovered.push(await generateStreamQuestion(context, questionSettings, index));
  }

  return recovered;
}

const streamQuestionAttempts = 3;

function retryDelay(attempt: number) {
  return Math.min(1_000, 250 * 2 ** attempt);
}

async function waitForRetry(attempt: number) {
  await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
}

async function generateStreamQuestion(
  context: StudyContext,
  settings: OllamaSettings,
  questionIndex: number,
  signal?: AbortSignal,
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < streamQuestionAttempts; attempt += 1) {
    try {
      const [question] = await generateWithOllama(context, settings, 300_000, signal);
      if (!question) {
        throw new Error(`Question ${questionIndex + 1} was not returned.`);
      }
      return question;
    } catch (error) {
      if (
        signal?.aborted ||
        error instanceof OllamaQueueFullError ||
        error instanceof OllamaQueueTimeoutError
      ) {
        throw error;
      }
      lastError = error;
      logger.warn(
        {
          err: error,
          questionNumber: questionIndex + 1,
          attempt: attempt + 1,
          maxAttempts: streamQuestionAttempts,
        },
        "Streaming question failed; retrying",
      );
      if (attempt < streamQuestionAttempts - 1) {
        await waitForRetry(attempt);
      }
    }
  }

  throw new Error(`Could not generate question ${questionIndex + 1}.`, {
    cause: lastError,
  });
}

function writeStreamEvent(res: import("express").Response, event: string, payload: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  (res as import("express").Response & { flush?: () => void }).flush?.();
}

function writeStreamKeepAlive(res: import("express").Response) {
  res.write(": keep-alive\n\n");
  (res as import("express").Response & { flush?: () => void }).flush?.();
}

async function streamOllamaAnswer(
  input: ReturnType<typeof StreamStudyAnswerBody.parse>,
  model: string,
  settings: OllamaSettings,
  res: import("express").Response,
  signal: AbortSignal,
) {
  await withOllamaRequestSlot("answer", signal, () =>
    streamOllamaAnswerFromOllama(input, model, settings, res, signal),
  );
}

function createStreamIdleTimeout(timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const reset = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error("Ollama stopped sending answer text."));
    }, timeoutMs);
    timer.unref?.();
  };

  reset();
  return {
    signal: controller.signal,
    reset,
    timedOut: () => timedOut,
    dispose: () => {
      if (timer) clearTimeout(timer);
    },
  };
}

async function streamOllamaAnswerFromOllama(
  input: ReturnType<typeof StreamStudyAnswerBody.parse>,
  model: string,
  settings: OllamaSettings,
  res: import("express").Response,
  signal: AbortSignal,
) {
  const outputLimit = input.questionType === "long" ? 850 : input.questionType === "short" ? 500 : 300;
  const idleTimeout = createStreamIdleTimeout(OLLAMA_STREAM_IDLE_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(`${settings.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/x-ndjson",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: answerPrompt(input) }],
          stream: true,
          keep_alive: "20m",
          options: {
            temperature: 0.35,
            top_p: 0.9,
            num_ctx: 4096,
            num_predict: outputLimit,
          },
        }),
        signal: AbortSignal.any([signal, idleTimeout.signal, AbortSignal.timeout(300_000)]),
      });
    } catch (error) {
      if (signal.aborted) throw error;
      if (idleTimeout.timedOut()) {
        throw new Error("Ollama did not start sending answer text. Please try again.");
      }
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error("MED-A took too long to prepare this answer. Please try again.");
      }
      throw new Error(`Ollama is not responding at ${settings.baseUrl}. Start the Ollama app, then try again.`, {
        cause: error,
      });
    }

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        detail.slice(0, 300) || `Ollama could not start the answer stream (HTTP ${response.status}).`,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let hasContent = false;
    let ollamaDone = false;

    const consumeLine = (line: string) => {
      if (!line.trim()) return;
      let chunk: { done?: boolean; error?: string; message?: { content?: unknown } };
      try {
        chunk = JSON.parse(line) as typeof chunk;
      } catch {
        throw new Error("Ollama returned an unreadable answer stream.");
      }
      if (chunk.error) throw new Error(`Ollama returned an error: ${chunk.error.slice(0, 300)}`);
      if (typeof chunk.message?.content === "string" && chunk.message.content.length > 0) {
        hasContent = true;
        writeStreamEvent(res, "delta", { text: chunk.message.content });
      }
      ollamaDone = chunk.done === true;
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value?.byteLength) idleTimeout.reset();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          consumeLine(line);
          if (ollamaDone) break;
        }
        if (ollamaDone) {
          await reader.cancel().catch(() => {});
          break;
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) consumeLine(buffer);
    } catch (error) {
      if (signal.aborted) throw error;
      if (idleTimeout.timedOut()) {
        throw new Error("Ollama stopped streaming this answer. Please try again.");
      }
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error("MED-A took too long to prepare this answer. Please try again.");
      }
      throw error;
    } finally {
      reader.releaseLock();
    }

    if (!hasContent) throw new Error("Ollama returned an empty answer. Please try again.");
  } finally {
    idleTimeout.dispose();
  }
}

async function checkStudyRequest(req: import("express").Request, res: import("express").Response) {
  const parsed = GenerateStudyQuestionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please complete every study detail before starting." });
    return null;
  }

  try {
    await verifySubscription(parsed.data.email.trim().toLowerCase(), parsed.data.deviceId.trim());
    return parsed.data;
  } catch (error) {
    const code = (error as Error & { code?: string }).code;
    if (code === "ACCOUNT_DISABLED") {
      res.status(403).json({ error: "ACCOUNT_DISABLED" });
      return null;
    }
    if (code === "SUBSCRIPTION_REQUIRED") {
      res.status(402).json({ error: "SUBSCRIPTION_REQUIRED" });
      return null;
    }
    logger.error({ err: error }, "Subscription access check failed before question generation");
    res.status(503).json({ error: "SUBSCRIPTION_UNAVAILABLE" });
    return null;
  }
}

router.post("/study/questions/stream", async (req, res) => {
  const parsed = await checkStudyRequest(req, res);
  if (!parsed) return;

  const settings = configuredOllamaSettings();
  const generationController = new AbortController();
  const abortGenerationOnClose = () => {
    if (!res.writableEnded) generationController.abort();
  };
  res.on("close", abortGenerationOnClose);

  const { email: _email, deviceId: _deviceId, ...context } = parsed;
  res.status(200);
  res.setHeader("cache-control", "no-cache, no-store");
  res.setHeader("content-type", "text/event-stream; charset=utf-8");
  res.setHeader("connection", "keep-alive");
  res.setHeader("x-accel-buffering", "no");
  res.flushHeaders();

  const keepAliveTimer = setInterval(() => {
    if (!res.destroyed && !res.writableEnded) {
      writeStreamKeepAlive(res);
    }
  }, 15_000);
  keepAliveTimer.unref?.();

  try {
    const streamSettings = {
      ...settings,
      model: await getOllamaModel(settings, 15_000),
    };
    for (let index = 0; index < context.count; index += 1) {
      if (generationController.signal.aborted || res.destroyed || res.writableEnded) return;
      const question = await generateStreamQuestion(
        context,
        streamSettings,
        index,
        generationController.signal,
      );
      if (generationController.signal.aborted || res.destroyed || res.writableEnded) return;
      writeStreamEvent(res, "question", {
        question: { ...question, id: `stream-question-${index + 1}` },
        index,
        total: context.count,
        topic: context.topic,
        generatedAt: new Date().toISOString(),
      });
    }
    if (res.destroyed || res.writableEnded) return;
    writeStreamEvent(res, "done", {
      topic: context.topic,
      total: context.count,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (!generationController.signal.aborted && !res.destroyed && !res.writableEnded) {
      logger.error({ err: error }, "Streaming question generation failed");
      writeStreamEvent(res, "error", {
        error: error instanceof Error ? error.message : "Ollama could not finish generating the requested questions.",
        retryable: !(error instanceof OllamaQueueFullError || error instanceof OllamaQueueTimeoutError),
      });
    }
  } finally {
    clearInterval(keepAliveTimer);
    res.off("close", abortGenerationOnClose);
    if (!res.destroyed && !res.writableEnded) res.end();
  }
});

router.post("/study/answer/stream", async (req, res): Promise<void> => {
  const parsed = StreamStudyAnswerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "The requested answer is missing study details." });
    return;
  }

  const input = parsed.data;
  if (input.questionType === "mcq") {
    const options = input.options ?? [];
    if (
      options.length !== 4 ||
      !input.correctAnswer?.trim() ||
      !options.some((option) => option.trim().toLowerCase() === input.correctAnswer?.trim().toLowerCase())
    ) {
      res.status(400).json({ error: "The multiple-choice answer details are incomplete." });
      return;
    }
  }

  try {
    await verifySubscription(input.email.trim().toLowerCase(), input.deviceId.trim());
  } catch (error) {
    const code = (error as Error & { code?: string }).code;
    if (code === "ACCOUNT_DISABLED") {
      res.status(403).json({ error: "ACCOUNT_DISABLED" });
      return;
    }
    if (code === "SUBSCRIPTION_REQUIRED") {
      res.status(402).json({ error: "SUBSCRIPTION_REQUIRED" });
      return;
    }
    logger.error({ err: error }, "Subscription access check failed before answer generation");
    res.status(503).json({ error: "SUBSCRIPTION_UNAVAILABLE" });
    return;
  }

  const settings = configuredOllamaSettings();
  const abortController = new AbortController();
  const abortOnClose = () => {
    if (!res.writableEnded) abortController.abort();
  };
  res.on("close", abortOnClose);

  res.status(200);
  res.setHeader("cache-control", "no-cache, no-store");
  res.setHeader("content-type", "text/event-stream; charset=utf-8");
  res.setHeader("connection", "keep-alive");
  res.setHeader("x-accel-buffering", "no");
  res.flushHeaders();

  const keepAliveTimer = setInterval(() => {
    if (!res.destroyed && !res.writableEnded) {
      writeStreamKeepAlive(res);
    }
  }, 15_000);
  keepAliveTimer.unref?.();

  try {
    const model = await getOllamaModel(settings, 15_000);
    await streamOllamaAnswer(input, model, settings, res, abortController.signal);
    if (!res.destroyed && !res.writableEnded) {
      writeStreamEvent(res, "done", { generatedAt: new Date().toISOString() });
    }
  } catch (error) {
    if (!abortController.signal.aborted && !res.destroyed && !res.writableEnded) {
      logger.error({ err: error, questionType: input.questionType }, "On-demand answer stream failed");
      writeStreamEvent(res, "error", {
        error: error instanceof Error ? error.message : "MED-A could not prepare this answer.",
      });
    }
  } finally {
    clearInterval(keepAliveTimer);
    res.off("close", abortOnClose);
    if (!res.destroyed && !res.writableEnded) res.end();
  }
});

router.post("/study/access", async (req, res) => {
  const parsed = CheckStudyAccessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "No saved subscription identity was found on this device." });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const deviceId = parsed.data.deviceId.trim();
  try {
    await verifySubscription(email, deviceId);
    res.setHeader("cache-control", "no-store");
    res.json({ access: true });
  } catch (error) {
    const code = (error as Error & { code?: string }).code;
    if (code === "ACCOUNT_DISABLED") {
      res.status(403).json({ error: "ACCOUNT_DISABLED" });
      return;
    }
    if (code === "SUBSCRIPTION_REQUIRED") {
      res.status(402).json({ error: "SUBSCRIPTION_REQUIRED" });
      return;
    }
    logger.error({ err: error }, "Subscription access check failed");
    res.status(503).json({ error: "SUBSCRIPTION_UNAVAILABLE" });
  }
});

router.post("/study/questions", async (req, res) => {
  const parsed = GenerateStudyQuestionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please complete every study detail before starting." });
    return;
  }

  try {
    await verifySubscription(parsed.data.email.trim().toLowerCase(), parsed.data.deviceId.trim());
  } catch (error) {
    const code = (error as Error & { code?: string }).code;
    if (code === "ACCOUNT_DISABLED") {
      res.status(403).json({ error: "ACCOUNT_DISABLED" });
      return;
    }
    if (code === "SUBSCRIPTION_REQUIRED") {
      res.status(402).json({ error: "SUBSCRIPTION_REQUIRED" });
      return;
    }
    logger.error({ err: error }, "Subscription access check failed before question generation");
    res.status(503).json({ error: "SUBSCRIPTION_UNAVAILABLE" });
    return;
  }

  const settings = configuredOllamaSettings();

  const { department, course, level, module, topic, questionType, count } = parsed.data;
  try {
    const questions = await generateQuestionSet(
      { department, course, level, module, topic, questionType, count },
      settings,
    );
    const result = GenerateStudyQuestionsResponse.parse({
      questions,
      topic,
      generatedAt: new Date().toISOString(),
    });
    res.json(result);
    return;
  } catch (error) {
    logger.error({ err: error, model: settings.model }, "Ollama question generation failed");
    res.status(503).json({
      error: error instanceof Error ? error.message : "Ollama could not generate the requested questions.",
    });
    return;
  }
});

logOllamaReadiness();

export default router;