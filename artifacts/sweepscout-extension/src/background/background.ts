export {};

type BgConfig = {
  apiBase: string;
  dashboardUrl: string;
};

type BgApprovedProfile = {
  firstName: string;
  lastName: string;
  email: string;
  alternateEmail: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  dob: string;
  syncedAt: string;
};

type BgEnvelope<T> = { ok: true; data: T } | { ok: false; error: string };

type BgMessage = {
  type?: string;
  analysis?: unknown;
  config?: Partial<BgConfig>;
};

const DEFAULT_CONFIG: BgConfig = {
  apiBase: "http://localhost:5000/api",
  dashboardUrl: "http://localhost:5173/dashboard",
};

chrome.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
  const message = rawMessage as BgMessage;
  handleMessage(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => {
      const messageText = error instanceof Error ? error.message : "Extension request failed.";
      sendResponse({ ok: false, error: messageText });
    });
  return true;
});

async function handleMessage(message: BgMessage) {
  switch (message.type) {
    case "SWEEPSCOUT_GET_CONFIG":
      return getConfig();
    case "SWEEPSCOUT_SAVE_CONFIG":
      return saveConfig(message.config ?? {});
    case "SWEEPSCOUT_CHECK_API":
      return checkApi();
    case "SWEEPSCOUT_SYNC_PROFILE":
      return syncApprovedProfile();
    case "SWEEPSCOUT_GET_PROFILE":
      return getApprovedProfile();
    case "SWEEPSCOUT_ANALYZE_PAGE":
      return postApi("/extension/analyze", message.analysis ?? {});
    case "SWEEPSCOUT_SAVE_PAGE":
      return postApi("/extension/save", message.analysis ?? {});
    default:
      throw new Error("Unknown SweepScout extension message.");
  }
}

async function checkApi() {
  const config = await getConfig();
  const response = await fetch(`${config.apiBase}/config`, { headers: { accept: "application/json" } });
  return parseApiResponse(response);
}

async function syncApprovedProfile() {
  const profile = await getApi<{
    firstName: string;
    lastName: string;
    email: string;
    alternateEmail: string;
    phone: string;
    address1: string;
    address2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    dob: string;
    consentToPrefill: boolean;
  }>("/profile");

  if (!profile.consentToPrefill) {
    throw new Error("Enable prefill consent in the SweepScout profile vault before syncing the extension profile.");
  }

  const approvedProfile: BgApprovedProfile = {
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    alternateEmail: profile.alternateEmail,
    phone: profile.phone,
    address1: profile.address1,
    address2: profile.address2,
    city: profile.city,
    state: profile.state,
    postalCode: profile.postalCode,
    country: profile.country,
    dob: profile.dob,
    syncedAt: new Date().toISOString(),
  };
  await storageSet({ approvedProfile });
  return approvedProfile;
}

async function getApprovedProfile() {
  const stored = await storageGet({ approvedProfile: null });
  return stored["approvedProfile"] as BgApprovedProfile | null;
}

async function getApi<T>(path: string): Promise<T> {
  const config = await getConfig();
  const response = await fetch(`${config.apiBase}${path}`, { headers: { accept: "application/json" } });
  return parseApiResponse<T>(response);
}

async function postApi<T>(path: string, body: unknown): Promise<T> {
  const config = await getConfig();
  const response = await fetch(`${config.apiBase}${path}`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return parseApiResponse<T>(response);
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let envelope: BgEnvelope<T> | null = null;
  if (text) {
    try {
      envelope = JSON.parse(text) as BgEnvelope<T>;
    } catch {
      envelope = null;
    }
  }
  if (!response.ok || !envelope || !envelope.ok) {
    const error = envelope && !envelope.ok ? envelope.error : response.statusText || "SweepScout API request failed.";
    throw new Error(error);
  }
  return envelope.data;
}

async function getConfig(): Promise<BgConfig> {
  const stored = await storageGet({ config: DEFAULT_CONFIG });
  return normalizeConfig(stored["config"] as Partial<BgConfig> | null | undefined);
}

async function saveConfig(input: Partial<BgConfig>) {
  const current = await getConfig();
  const config = normalizeConfig({ ...current, ...input });
  await storageSet({ config });
  return config;
}

function normalizeConfig(input: Partial<BgConfig> | null | undefined): BgConfig {
  return {
    apiBase: normalizeUrl(input?.apiBase, DEFAULT_CONFIG.apiBase).replace(/\/$/, ""),
    dashboardUrl: normalizeUrl(input?.dashboardUrl, DEFAULT_CONFIG.dashboardUrl).replace(/\/$/, ""),
  };
}

function normalizeUrl(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

function storageGet(defaults: Record<string, unknown>) {
  return new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.local.get(defaults, (items) => resolve(items));
  });
}

function storageSet(items: Record<string, unknown>) {
  return new Promise<void>((resolve) => {
    chrome.storage.local.set(items, () => resolve());
  });
}
