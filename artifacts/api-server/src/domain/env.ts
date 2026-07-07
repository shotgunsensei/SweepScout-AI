export type RuntimeMode = "supabase" | "sqlite";

export type AppConfig = {
  mode: RuntimeMode;
  openaiConfigured: boolean;
  supabaseConfigured: boolean;
  browserHeadless: boolean;
  sqlitePath: string;
  openaiModel: string;
  warnings: string[];
};

export type OpenAIAccess = {
  baseUrl: string;
  apiKey: string;
};

function present(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function replitOpenAIConfigured() {
  return present(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) && present(process.env.AI_INTEGRATIONS_OPENAI_API_KEY);
}

function openAIConfigured() {
  return replitOpenAIConfigured() || present(process.env.OPENAI_API_KEY);
}

export function getAppConfig(): AppConfig {
  const supabaseConfigured =
    present(process.env.SUPABASE_URL) &&
    present(process.env.SUPABASE_ANON_KEY) &&
    present(process.env.SUPABASE_SERVICE_ROLE_KEY);

  const partialSupabase =
    present(process.env.SUPABASE_URL) ||
    present(process.env.SUPABASE_ANON_KEY) ||
    present(process.env.SUPABASE_SERVICE_ROLE_KEY);

  const warnings: string[] = [];
  if (!supabaseConfigured) {
    warnings.push("Supabase is not fully configured; using local SQLite fallback.");
  }
  if (partialSupabase && !supabaseConfigured) {
    warnings.push("Supabase env vars are partially configured; set all three keys to use Postgres/Auth.");
  }
  if (!openAIConfigured()) {
    warnings.push("OpenAI is not configured; rules extraction will queue but not call OpenAI.");
  }

  return {
    mode: supabaseConfigured ? "supabase" : "sqlite",
    openaiConfigured: openAIConfigured(),
    supabaseConfigured,
    browserHeadless: process.env.BROWSER_HEADLESS !== "false",
    sqlitePath: process.env.LOCAL_SQLITE_PATH ?? ".data/sweepscout.sqlite",
    openaiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    warnings,
  };
}

export class AppConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppConfigError";
  }
}

export function requireOpenAIAccess(): OpenAIAccess {
  if (replitOpenAIConfigured()) {
    return {
      baseUrl: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL!.replace(/\/$/, ""),
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY!,
    };
  }

  if (present(process.env.OPENAI_API_KEY)) {
    return {
      baseUrl: "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY!,
    };
  }

  throw new AppConfigError("OpenAI is not configured; connect the Replit OpenAI integration or set OPENAI_API_KEY before running rules extraction.");
}
