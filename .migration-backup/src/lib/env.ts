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

function present(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
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
  if (!present(process.env.OPENAI_API_KEY)) {
    warnings.push("OPENAI_API_KEY is missing; rules extraction will queue but not call OpenAI.");
  }

  return {
    mode: supabaseConfigured ? "supabase" : "sqlite",
    openaiConfigured: present(process.env.OPENAI_API_KEY),
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

export function requireOpenAIKey() {
  if (!present(process.env.OPENAI_API_KEY)) {
    throw new AppConfigError("OPENAI_API_KEY is required before running rules extraction.");
  }

  return process.env.OPENAI_API_KEY!;
}
