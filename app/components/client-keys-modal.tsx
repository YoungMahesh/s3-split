"use client";

import { useState, useEffect } from "react";
import type { ManagedBucketItem } from "./managed-buckets";
import type { IntegrationSnippets } from "@/lib/snippets";

export interface ClientKeyItem {
  id: string;
  name: string;
  accessKeyId: string;
  permission: "read_write" | "read_only";
  status: "active" | "revoked";
  lastUsedAt: string | null;
  createdAt: string;
}

export interface NewKeyResponse {
  key: ClientKeyItem;
  secretAccessKey: string;
  snippets: IntegrationSnippets;
}

interface ClientKeysModalProps {
  bucket: ManagedBucketItem;
  onClose: () => void;
}

export function ClientKeysModal({ bucket, onClose }: ClientKeysModalProps) {
  const [keys, setKeys] = useState<ClientKeyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [permission, setPermission] = useState<"read_write" | "read_only">("read_write");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // One-time Reveal State
  const [revealedData, setRevealedData] = useState<NewKeyResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"env" | "node" | "python" | "awsCli">("env");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  // Revocation State
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmRevokeKey, setConfirmRevokeKey] = useState<ClientKeyItem | null>(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const res = await fetch(`/api/managed-buckets/${bucket.id}/client-keys`);
        if (!res.ok) {
          throw new Error("Failed to load client keys.");
        }
        const data = await res.json();
        if (!ignore) {
          setKeys(data.keys || []);
          setErrorMessage(null);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setErrorMessage(
            err instanceof Error ? err.message : "Error loading client keys.",
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
  }, [bucket.id]);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch(`/api/managed-buckets/${bucket.id}/client-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: keyName.trim(),
          permission,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate client key.");
      }

      // Add to list and trigger one-time reveal
      setKeys((prev) => [data.key, ...prev]);
      setRevealedData(data);
      setShowCreateForm(false);
      setKeyName("");
      setPermission("read_write");
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Failed to generate client key.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeKey = async (keyItem: ClientKeyItem) => {
    setRevokingId(keyItem.id);
    try {
      const res = await fetch(`/api/client-keys/${keyItem.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to revoke client key.");
      }

      // Remove from active list
      setKeys((prev) => prev.filter((k) => k.id !== keyItem.id));
      setConfirmRevokeKey(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to revoke client key.");
    } finally {
      setRevokingId(null);
    }
  };

  const copyToClipboard = async (text: string, identifier: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(identifier);
      setTimeout(() => {
        setCopiedField(null);
      }, 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  Client Keys
                </h2>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {bucket.name}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Issue and manage AWS SigV4 credentials for downstream applications.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ONE-TIME REVEAL MODAL / BANNER */}
          {revealedData && (
            <div className="rounded-2xl border-2 border-indigo-500/40 bg-indigo-50/40 p-5 dark:border-indigo-500/30 dark:bg-indigo-950/30 space-y-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-amber-500/20 p-2 text-amber-600 dark:text-amber-400 shrink-0">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    Save Your Secret Access Key Now
                  </h3>
                  <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                    This is the <span className="font-semibold text-amber-600 dark:text-amber-400">only time</span> the secret access key will be shown. S3-Split encrypts credentials at rest with AES-256-GCM and will never reveal it again.
                  </p>
                </div>
              </div>

              {/* Key Details Grid */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Access Key ID */}
                <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                    <span>Access Key ID</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(revealedData.key.accessKeyId, "accessKeyId")}
                      className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 cursor-pointer"
                    >
                      {copiedField === "accessKeyId" ? "✓ Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="mt-1 font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100 select-all truncate">
                    {revealedData.key.accessKeyId}
                  </div>
                </div>

                {/* Secret Access Key */}
                <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                    <span>Secret Access Key</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer"
                      >
                        {showSecret ? "Hide" : "Show"}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(revealedData.secretAccessKey, "secretAccessKey")}
                        className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 cursor-pointer"
                      >
                        {copiedField === "secretAccessKey" ? "✓ Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100 select-all truncate">
                    {showSecret ? revealedData.secretAccessKey : "••••••••••••••••••••••••••••••••••••••••"}
                  </div>
                </div>
              </div>

              {/* Code Snippet Tabs */}
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Integration Code Snippets
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(revealedData.snippets[activeTab], activeTab)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 cursor-pointer"
                  >
                    {copiedField === activeTab ? "✓ Snippet Copied!" : "📋 Copy Snippet"}
                  </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex items-center gap-1 border-b border-zinc-100 dark:border-zinc-800 pb-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("env")}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === "env"
                        ? "bg-indigo-600 text-white"
                        : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                  >
                    .env
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("node")}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === "node"
                        ? "bg-indigo-600 text-white"
                        : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                  >
                    Node.js (@aws-sdk)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("python")}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === "python"
                        ? "bg-indigo-600 text-white"
                        : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                  >
                    Python (boto3)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("awsCli")}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                      activeTab === "awsCli"
                        ? "bg-indigo-600 text-white"
                        : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                  >
                    AWS CLI
                  </button>
                </div>

                {/* Snippet Display */}
                <pre className="max-h-48 overflow-x-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-200 dark:bg-black font-mono leading-relaxed border border-zinc-800 select-all">
                  {revealedData.snippets[activeTab]}
                </pre>
              </div>

              {/* Dismiss Button */}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setRevealedData(null)}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 cursor-pointer"
                >
                  I Have Safely Saved My Secret Key
                </button>
              </div>
            </div>
          )}

          {/* GENERATE KEY FORM */}
          {showCreateForm ? (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-5 dark:border-zinc-800 dark:bg-zinc-950/50 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Generate New Client Key
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                >
                  {formError}
                </div>
              )}

              <form onSubmit={handleCreateKey} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Friendly Key Name
                  </label>
                  <input
                    type="text"
                    required
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    placeholder="e.g. Staging App, Ingestion Pipeline, Analytics"
                    className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-xs focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Permission Scope
                  </label>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label
                      className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-all ${
                        permission === "read_write"
                          ? "border-indigo-600 bg-indigo-50/50 dark:border-indigo-500 dark:bg-indigo-950/30"
                          : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="permission"
                        value="read_write"
                        checked={permission === "read_write"}
                        onChange={() => setPermission("read_write")}
                        className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">
                          Read & Write (Full Access)
                        </span>
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block mt-0.5">
                          Allows PutObject, GetObject, DeleteObject, and Multipart Uploads within quota.
                        </span>
                      </div>
                    </label>

                    <label
                      className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-all ${
                        permission === "read_only"
                          ? "border-indigo-600 bg-indigo-50/50 dark:border-indigo-500 dark:bg-indigo-950/30"
                          : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="permission"
                        value="read_only"
                        checked={permission === "read_only"}
                        onChange={() => setPermission("read_only")}
                        className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">
                          Read-Only (Restricted)
                        </span>
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block mt-0.5">
                          Allows GetObject, HeadObject, ListObjectsV2. Rejects all mutating writes with AccessDenied.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !keyName.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? "Generating Key..." : "Generate Key"}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Active Client Keys ({keys.length})
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Downstream applications connect using these credentials.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-all hover:bg-indigo-500 active:scale-98 cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Issue New Key
              </button>
            </div>
          )}

          {/* KEYS LISTING */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((n) => (
                <div key={n} className="h-16 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
              ))}
            </div>
          ) : errorMessage ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {errorMessage}
            </div>
          ) : keys.length === 0 && !showCreateForm ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-950/30">
              <svg className="mx-auto h-8 w-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
              <h4 className="mt-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                No active Client Keys
              </h4>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
                Generate a Client Key to grant S3 access to this bucket with dedicated quotas and permission scopes.
              </p>
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 cursor-pointer"
              >
                + Issue First Client Key
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-100 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Key Name</th>
                    <th className="px-4 py-3 font-semibold">Access Key ID</th>
                    <th className="px-4 py-3 font-semibold">Scope</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                    <th className="px-4 py-3 font-semibold">Last Used</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {keys.map((k) => (
                    <tr key={k.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3.5 font-medium text-zinc-900 dark:text-zinc-100">
                        {k.name}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-zinc-700 dark:text-zinc-300">
                        <div className="flex items-center gap-1.5">
                          <span>{k.accessKeyId}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(k.accessKeyId, k.id)}
                            className="text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                            title="Copy Access Key ID"
                          >
                            {copiedField === k.id ? "✓" : "📋"}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            k.permission === "read_write"
                              ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-900"
                          }`}
                        >
                          {k.permission === "read_write" ? "Read / Write" : "Read Only"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-zinc-500 dark:text-zinc-400">
                        {new Date(k.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-500 dark:text-zinc-400">
                        {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "Never"}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => setConfirmRevokeKey(k)}
                          disabled={revokingId === k.id}
                          className="font-semibold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 cursor-pointer disabled:opacity-50"
                        >
                          {revokingId === k.id ? "Revoking..." : "Revoke"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end border-t border-zinc-100 bg-zinc-50/50 px-6 py-3.5 dark:border-zinc-800 dark:bg-zinc-950/50">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Revocation Confirmation Dialog */}
      {confirmRevokeKey && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              Revoke Client Key?
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Are you sure you want to revoke key <span className="font-semibold text-zinc-900 dark:text-zinc-100">&quot;{confirmRevokeKey.name}&quot;</span> (<span className="font-mono text-[11px]">{confirmRevokeKey.accessKeyId}</span>)? Any application using this key will immediately lose access to the gateway.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRevokeKey(null)}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRevokeKey(confirmRevokeKey)}
                className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-red-500 cursor-pointer"
              >
                Yes, Revoke Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
