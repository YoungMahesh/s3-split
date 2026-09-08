"use client";

import { useState, useEffect, useCallback } from "react";

export interface UpstreamAccount {
  id: string;
  name: string;
  endpointUrl: string;
  region: string;
  accessKeyId: string;
  createdAt: string;
  updatedAt?: string;
}

const PROVIDER_PRESETS = [
  {
    label: "AWS S3",
    endpoint: "https://s3.us-east-1.amazonaws.com",
    region: "us-east-1",
  },
  {
    label: "Cloudflare R2",
    endpoint: "https://<account-id>.r2.cloudflarestorage.com",
    region: "auto",
  },
  {
    label: "Wasabi",
    endpoint: "https://s3.wasabisys.com",
    region: "us-east-1",
  },
  {
    label: "MinIO",
    endpoint: "http://localhost:9000",
    region: "us-east-1",
  },
];

export function UpstreamAccountsManager() {
  const [accounts, setAccounts] = useState<UpstreamAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Deletion State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/upstream-accounts");
      if (!res.ok) {
        throw new Error("Failed to load upstream accounts");
      }
      const data = await res.json();
      setAccounts(data.accounts || []);
      setFetchError(null);
    } catch (err: unknown) {
      setFetchError(
        err instanceof Error ? err.message : "Error loading accounts",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const res = await fetch("/api/upstream-accounts");
        if (!res.ok) {
          throw new Error("Failed to load upstream accounts");
        }
        const data = await res.json();
        if (!ignore) {
          setAccounts(data.accounts || []);
          setFetchError(null);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setFetchError(
            err instanceof Error ? err.message : "Error loading accounts",
          );
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      ignore = true;
    };
  }, []);

  const applyPreset = (endpoint: string, presetRegion: string) => {
    setEndpointUrl(endpoint);
    setRegion(presetRegion);
  };

  const resetForm = () => {
    setName("");
    setEndpointUrl("");
    setRegion("us-east-1");
    setAccessKeyId("");
    setSecretAccessKey("");
    setShowSecret(false);
    setFormError(null);
  };

  const handleConnect = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/upstream-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          endpointUrl: endpointUrl.trim(),
          region: region.trim(),
          accessKeyId: accessKeyId.trim(),
          secretAccessKey: secretAccessKey.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(
          data.error ||
            "Failed to connect upstream account. Please check credentials and endpoint.",
        );
        return;
      }

      setFormSuccess(
        `Successfully connected and validated "${data.account?.name || name}". Credentials encrypted at rest.`,
      );
      resetForm();
      setIsFormOpen(false);
      await fetchAccounts();
    } catch (err: unknown) {
      setFormError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during upstream verification.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, accountName: string) => {
    if (
      !confirm(
        `Are you sure you want to disconnect upstream account "${accountName}"?`,
      )
    ) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await fetch(`/api/upstream-accounts/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to disconnect account");
        return;
      }
      await fetchAccounts();
    } catch (err: unknown) {
      alert(
        err instanceof Error ? err.message : "Failed to disconnect account",
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Notifications */}
      {formSuccess && (
        <div
          role="status"
          className="flex items-start justify-between rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-900 shadow-xs dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <p className="font-medium">{formSuccess}</p>
          </div>
          <button
            type="button"
            onClick={() => setFormSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-200"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header and Action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Connected Upstream Accounts
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            External S3-compatible providers connected to your account.
            Credentials are encrypted at rest with AES-256-GCM.
          </p>
        </div>
        <button
          type="button"
          id="connect-upstream-btn"
          onClick={() => {
            setIsFormOpen(!isFormOpen);
            setFormError(null);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 cursor-pointer dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={isFormOpen ? "M6 18L18 6M6 6l12 12" : "M12 4v16m8-8H4"}
            />
          </svg>
          {isFormOpen ? "Cancel" : "Connect Upstream Account"}
        </button>
      </div>

      {/* Connect Form Modal / Panel */}
      {isFormOpen && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Connect New S3-Compatible Storage Provider
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              S3-Split actively probes your endpoint and validates credentials
              before saving.
            </p>
          </div>

          {/* Quick Presets */}
          <div className="mb-5">
            <span className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
              Quick Provider Presets
            </span>
            <div className="flex flex-wrap gap-2">
              {PROVIDER_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p.endpoint, p.region)}
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-300 dark:hover:border-zinc-700 cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Form Error Alert */}
          {formError && (
            <div
              role="alert"
              id="upstream-form-error"
              className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300"
            >
              <div className="flex items-start gap-2.5">
                <svg
                  className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <p className="font-semibold">Connection Probe Failed</p>
                  <p className="mt-0.5 text-xs text-red-800 dark:text-red-300/90 leading-relaxed">
                    {formError}
                  </p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleConnect} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1 text-left">
                <label
                  htmlFor="upstream-name"
                  className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
                >
                  Account Name
                </label>
                <input
                  id="upstream-name"
                  type="text"
                  required
                  placeholder="e.g. Production R2 or AWS Main"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />
              </div>

              <div className="space-y-1 text-left">
                <label
                  htmlFor="upstream-region"
                  className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
                >
                  Region
                </label>
                <input
                  id="upstream-region"
                  type="text"
                  required
                  placeholder="e.g. us-east-1 or auto"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />
              </div>
            </div>

            <div className="space-y-1 text-left">
              <label
                htmlFor="upstream-endpoint"
                className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
              >
                Endpoint URL
              </label>
              <input
                id="upstream-endpoint"
                type="url"
                required
                placeholder="https://s3.us-east-1.amazonaws.com"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                className="block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1 text-left">
                <label
                  htmlFor="upstream-access-key-id"
                  className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
                >
                  Access Key ID
                </label>
                <input
                  id="upstream-access-key-id"
                  type="text"
                  required
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                  value={accessKeyId}
                  onChange={(e) => setAccessKeyId(e.target.value)}
                  className="block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />
              </div>

              <div className="space-y-1 text-left">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="upstream-secret-access-key"
                    className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
                  >
                    Secret Access Key
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 cursor-pointer"
                  >
                    {showSecret ? "Hide" : "Reveal"}
                  </button>
                </div>
                <input
                  id="upstream-secret-access-key"
                  type={showSecret ? "text" : "password"}
                  required
                  placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                  value={secretAccessKey}
                  onChange={(e) => setSecretAccessKey(e.target.value)}
                  className="block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                disabled={isSubmitting}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                id="submit-upstream-btn"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {isSubmitting ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin text-white dark:text-zinc-900"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>Probing S3 Endpoint...</span>
                  </>
                ) : (
                  "Test Connection & Save"
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Upstream Accounts Listing */}
      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-16 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-16 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        </div>
      ) : fetchError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-semibold">Failed to load upstream accounts</p>
          <p className="mt-1 text-xs">{fetchError}</p>
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 p-12 text-center dark:border-zinc-800 dark:bg-zinc-900/30">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 mb-3">
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            No Upstream Accounts Connected
          </h3>
          <p className="mt-1 max-w-sm text-xs text-zinc-500 dark:text-zinc-400">
            Connect an external S3-compatible cloud storage provider (such as
            AWS S3, Cloudflare R2, Wasabi, or MinIO) to configure managed
            buckets.
          </p>
          <button
            type="button"
            onClick={() => setIsFormOpen(true)}
            className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 cursor-pointer"
          >
            Connect First Provider
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
                <tr>
                  <th scope="col" className="px-6 py-3.5">
                    Account Name
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Endpoint URL
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Region
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Access Key ID
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Connected
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {accounts.map((acc) => (
                  <tr
                    key={acc.id}
                    className="transition hover:bg-zinc-50/70 dark:hover:bg-zinc-800/30"
                  >
                    <td className="px-6 py-4 font-semibold text-zinc-900 dark:text-zinc-100">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          S3
                        </span>
                        <span>{acc.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-zinc-600 dark:text-zinc-300 max-w-xs truncate">
                      {acc.endpointUrl}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {acc.region}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                      {acc.accessKeyId}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500 dark:text-zinc-400">
                      {new Date(acc.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(acc.id, acc.name)}
                        disabled={deletingId === acc.id}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300 cursor-pointer disabled:opacity-50"
                      >
                        {deletingId === acc.id
                          ? "Disconnecting..."
                          : "Disconnect"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
