const GITHUB_SETUP_STORAGE_KEY = "performance-agent:github-setup";
const GITHUB_SETUP_MAX_AGE_MS = 30 * 60 * 1000;

export type PendingGithubSetup = {
  provider: "GITHUB";
  organizationId: string;
  startedAt: number;
};

export function savePendingGithubSetup(organizationId: string) {
  const pending: PendingGithubSetup = {
    provider: "GITHUB",
    organizationId,
    startedAt: Date.now(),
  };
  sessionStorage.setItem(GITHUB_SETUP_STORAGE_KEY, JSON.stringify(pending));
}

export function readPendingGithubSetup() {
  const raw = sessionStorage.getItem(GITHUB_SETUP_STORAGE_KEY);
  if (!raw) return null;

  try {
    const pending = JSON.parse(raw) as Partial<PendingGithubSetup>;
    if (
      pending.provider !== "GITHUB" ||
      typeof pending.organizationId !== "string" ||
      typeof pending.startedAt !== "number"
    ) {
      return null;
    }

    if (Date.now() - pending.startedAt > GITHUB_SETUP_MAX_AGE_MS) {
      clearPendingGithubSetup();
      return null;
    }

    return pending as PendingGithubSetup;
  } catch {
    return null;
  }
}

export function clearPendingGithubSetup() {
  sessionStorage.removeItem(GITHUB_SETUP_STORAGE_KEY);
}
