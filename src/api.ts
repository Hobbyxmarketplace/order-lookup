export interface LookupResult {
  invoice: string;
  grading_company: string;
  status: string;
  status_date: string | null;
  submission_number: string | null;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  me: () => req<{ user: string }>("/api/me"),
  login: (username: string, password: string) =>
    req<{ ok: true; user: string }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => req<{ ok: true }>("/api/logout", { method: "POST" }),
  lookup: (invoice: string) =>
    req<LookupResult>(`/api/lookup?invoice=${encodeURIComponent(invoice)}`),
};
