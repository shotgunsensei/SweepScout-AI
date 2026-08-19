export type AuthFragment = {
  accessToken: string | null;
  refreshToken: string | null;
  type: string | null;
};

export function readAuthFragment(hash: string): AuthFragment {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return {
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
    type: params.get("type"),
  };
}

export function recoveryRedirectTarget(
  location: Pick<Location, "pathname" | "search" | "hash">,
  baseUrl: string,
) {
  const fragment = readAuthFragment(location.hash);
  if (fragment.type !== "recovery" || !fragment.accessToken || !fragment.refreshToken) return null;
  const basePath = baseUrl === "/" ? "" : `/${baseUrl.replace(/^\/|\/$/g, "")}`;
  const resetPath = `${basePath}/reset-password`;
  if (location.pathname === resetPath) return null;
  return `${resetPath}${location.search}${location.hash}`;
}