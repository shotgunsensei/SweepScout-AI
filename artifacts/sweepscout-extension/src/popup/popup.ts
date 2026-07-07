export {};

type PopupConfig = {
  apiBase: string;
  dashboardUrl: string;
};

type PopupProfile = {
  email: string;
  syncedAt: string;
};

type PopupPageState = {
  analysis: {
    url: string;
    title: string;
    detected: boolean;
    confidence: number;
    riskScore: number;
    riskLevel: "low" | "medium" | "high";
    signals: string[];
    suspiciousFields: Array<{ suspiciousKind: string | null }>;
  };
  apiScore?: {
    status: string;
    scamScore: number;
    eligibilityScore: number;
    complianceNotes: string[];
  } | null;
};

type PopupResponse<T> = { ok: true; data: T } | { ok: false; error: string };

const pageTitle = mustElement("page-title");
const connectionPill = mustElement("connection-pill");
const detectionScore = mustElement("detection-score");
const riskScore = mustElement("risk-score");
const pageSummary = mustElement("page-summary");
const signals = mustElement("signals");
const status = mustElement("status");
const profileState = mustElement("profile-state");
const apiBase = mustInput("api-base");
const dashboardUrl = mustInput("dashboard-url");
const saveConfigButton = mustButton("save-config");
const syncProfileButton = mustButton("sync-profile");
const savePageButton = mustButton("save-page");
const prefillPageButton = mustButton("prefill-page");
const openDashboardButton = mustButton("open-dashboard");

let activeTabId: number | null = null;
let currentConfig: PopupConfig | null = null;

document.addEventListener("DOMContentLoaded", () => {
  initialize().catch((error) => setStatus(errorMessage(error), true));
});

saveConfigButton.addEventListener("click", () => {
  sendRuntime<PopupConfig>("SWEEPSCOUT_SAVE_CONFIG", {
    config: {
      apiBase: apiBase.value,
      dashboardUrl: dashboardUrl.value,
    },
  })
    .then((config) => {
      currentConfig = config;
      renderConfig(config);
      setStatus("Extension config saved.");
      return checkApi();
    })
    .catch((error) => setStatus(errorMessage(error), true));
});

syncProfileButton.addEventListener("click", () => {
  setBusy(syncProfileButton, true, "Syncing");
  sendRuntime<PopupProfile>("SWEEPSCOUT_SYNC_PROFILE")
    .then((profile) => {
      renderProfile(profile);
      setStatus("Approved profile synced locally.");
    })
    .catch((error) => setStatus(errorMessage(error), true))
    .finally(() => setBusy(syncProfileButton, false, "Sync Approved Profile"));
});

savePageButton.addEventListener("click", () => {
  sendToActiveTab("SWEEPSCOUT_SAVE_FROM_POPUP");
});

prefillPageButton.addEventListener("click", () => {
  sendToActiveTab("SWEEPSCOUT_PREFILL_FROM_POPUP");
});

openDashboardButton.addEventListener("click", () => {
  const url = currentConfig?.dashboardUrl ?? dashboardUrl.value;
  chrome.tabs.create({ url });
});

async function initialize() {
  const [config, profile] = await Promise.all([
    sendRuntime<PopupConfig>("SWEEPSCOUT_GET_CONFIG"),
    sendRuntime<PopupProfile | null>("SWEEPSCOUT_GET_PROFILE"),
  ]);
  currentConfig = config;
  renderConfig(config);
  renderProfile(profile);
  await checkApi();
  const tab = await getActiveTab();
  activeTabId = tab.id ?? null;
  if (!activeTabId) {
    throw new Error("No active tab available.");
  }
  await requestPageState();
}

async function checkApi() {
  try {
    await sendRuntime("SWEEPSCOUT_CHECK_API");
    setPill(connectionPill, "API online", "ok");
  } catch (error) {
    setPill(connectionPill, "API offline", "danger");
    setStatus(errorMessage(error), true);
  }
}

async function requestPageState() {
  if (!activeTabId) return;
  const response = await sendTab<PopupPageState>(activeTabId, { type: "SWEEPSCOUT_REQUEST_PAGE_STATE" });
  renderPageState(response);
}

function renderConfig(config: PopupConfig) {
  apiBase.value = config.apiBase;
  dashboardUrl.value = config.dashboardUrl;
}

function renderProfile(profile: PopupProfile | null) {
  if (!profile) {
    profileState.textContent = "No approved profile synced.";
    return;
  }
  profileState.textContent = `Synced ${profile.email} at ${formatDate(profile.syncedAt)}. Stored locally in this extension.`;
}

function renderPageState(state: PopupPageState) {
  const analysis = state.analysis;
  pageTitle.textContent = analysis.title || new URL(analysis.url).hostname;
  detectionScore.textContent = analysis.detected ? `${Math.round(analysis.confidence * 100)}%` : "No";
  riskScore.textContent = state.apiScore ? `${state.apiScore.scamScore}/100` : `${analysis.riskScore}/100`;

  const apiStatus = state.apiScore ? `${titleCase(state.apiScore.status)}. Eligibility ${state.apiScore.eligibilityScore}/100.` : "";
  const fieldCount = analysis.suspiciousFields.length;
  pageSummary.textContent = [
    analysis.detected ? "Sweepstakes signals detected." : "No strong sweepstakes signals detected.",
    apiStatus,
    fieldCount ? `${fieldCount} sensitive field warning${fieldCount === 1 ? "" : "s"} highlighted.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  signals.replaceChildren(
    ...analysis.signals.slice(0, 8).map((signal) => {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = signal;
      return tag;
    }),
  );
}

function sendToActiveTab(type: string) {
  if (!activeTabId) {
    setStatus("No active tab available.", true);
    return;
  }
  setStatus(type.includes("SAVE") ? "Saving page..." : "Requesting local prefill...");
  sendTab<{ message?: string }>(activeTabId, { type })
    .then((result) => {
      setStatus(result.message ?? "Done.");
      return requestPageState();
    })
    .catch((error) => setStatus(errorMessage(error), true));
}

function sendRuntime<T = unknown>(type: string, payload: Record<string, unknown> = {}) {
  return new Promise<T>((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (rawResponse) => {
      const lastError = chrome.runtime.lastError;
      if (lastError?.message) {
        reject(new Error(lastError.message));
        return;
      }
      const response = rawResponse as PopupResponse<T> | undefined;
      if (!response) {
        reject(new Error("No response from SweepScout extension background worker."));
        return;
      }
      if (!response.ok) {
        reject(new Error(response.error));
        return;
      }
      resolve(response.data);
    });
  });
}

function sendTab<T>(tabId: number, message: Record<string, unknown>) {
  return new Promise<T>((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (rawResponse) => {
      const lastError = chrome.runtime.lastError;
      if (lastError?.message) {
        reject(new Error("SweepScout content script is not available on this page."));
        return;
      }
      const response = rawResponse as PopupResponse<T> | undefined;
      if (!response) {
        reject(new Error("No response from the current page."));
        return;
      }
      if (!response.ok) {
        reject(new Error(response.error));
        return;
      }
      resolve(response.data);
    });
  });
}

function getActiveTab() {
  return new Promise<chrome.tabs.Tab>((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) {
        reject(new Error("No active tab found."));
        return;
      }
      resolve(tab);
    });
  });
}

function setPill(element: Element, text: string, tone: "ok" | "warn" | "danger") {
  element.className = `pill ${tone}`;
  element.textContent = text;
}

function setStatus(message: string, isError = false) {
  status.textContent = message;
  status.style.borderColor = isError ? "rgba(248,113,113,.42)" : "#22302d";
  status.style.color = isError ? "#fca5a5" : "#b8c3be";
}

function setBusy(button: HTMLButtonElement, busy: boolean, label: string) {
  button.disabled = busy;
  button.textContent = label;
}

function mustElement(id: string) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing popup element: ${id}`);
  return element;
}

function mustInput(id: string) {
  const element = mustElement(id);
  if (!(element instanceof HTMLInputElement)) throw new Error(`Expected input: ${id}`);
  return element;
}

function mustButton(id: string) {
  const element = mustElement(id);
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Expected button: ${id}`);
  return element;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

function titleCase(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
