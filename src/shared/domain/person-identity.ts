export interface PersonIdentity {
  employeeId?: string | null;
  email?: string | null;
  profileUrl?: string | null;
  resumeFingerprint?: string | null;
}

export function normalizePersonEmail(value?: string | null): string | null {
  const email = value?.normalize("NFKC").trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ? email : null;
}

export function normalizePersonProfileUrl(value?: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    const input = value.normalize("NFKC").trim();
    const url = new URL(/^https?:\/\//iu.test(input) ? input : `https://${input}`);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    const hostname = url.hostname.toLowerCase().replace(/^www\./u, "");
    const pathname = decodeURIComponent(url.pathname).replace(/\/+$/u, "");
    if (!pathname) return null;
    if (/(?:^|\.)linkedin\.com$/u.test(hostname)) {
      if (!/^\/(?:in|pub)\/[^/]+/iu.test(pathname)) return null;
      const personPath = pathname.match(/^\/in\/[^/]+/iu)?.[0] ?? pathname;
      return `linkedin.com${personPath.toLowerCase()}`;
    }
    // Other sites can identify people through query parameters; preserve them.
    return `${hostname}${url.port ? `:${url.port}` : ""}${pathname}${url.search}`;
  } catch { return null; }
}

export function isSamePerson(candidate: PersonIdentity | undefined, employee: PersonIdentity): boolean {
  if (!candidate) return false;
  const candidateId = candidate.employeeId?.normalize("NFKC").trim();
  if (candidateId && candidateId === employee.employeeId?.normalize("NFKC").trim()) return true;
  const email = normalizePersonEmail(candidate.email);
  if (email && email === normalizePersonEmail(employee.email)) return true;
  const profileUrl = normalizePersonProfileUrl(candidate.profileUrl);
  if (profileUrl && profileUrl === normalizePersonProfileUrl(employee.profileUrl)) return true;
  return Boolean(candidate.resumeFingerprint && candidate.resumeFingerprint === employee.resumeFingerprint);
}
