"use client";

import { useState, useEffect, useCallback } from "react";
import { formatBytes, type StorageQuotaUnit } from "@/lib/quota";
import { ClientKeysModal } from "./client-keys-modal";

export interface ManagedBucketItem {
  id: string;
  name: string;
  upstreamAccountId: string;
  upstreamAccountName: string | null;
  upstreamBucket: string;
  bucketType: "physical" | "virtual_prefix";
  virtualPrefix: string | null;
  storageQuotaBytes: number;
  usedBytes: number;
  status: "active" | "quota_exceeded";
  createdAt: string;
  updatedAt: string;
  objectCount: number;
  progress: {
    percentage: number;
    isExceeded: boolean;
    status: "active" | "quota_exceeded";
    formattedUsed: string;
    formattedQuota: string;
  };
}

export interface UpstreamAccountOption {
  id: string;
  name: string;
  endpointUrl: string;
  region: string;
}

export interface BucketObject {
  id: string;
  key: string;
  sizeBytes: number;
  etag: string | null;
  lastModified: string | null;
  createdAt: string;
}

export function ManagedBucketsManager() {
  const [buckets, setBuckets] = useState<ManagedBucketItem[]>([]);
  const [upstreamAccounts, setUpstreamAccounts] = useState<UpstreamAccountOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [upstreamBucket, setUpstreamBucket] = useState("");
  const [bucketType, setBucketType] = useState<"physical" | "virtual_prefix">("physical");
  const [quotaValue, setQuotaValue] = useState("5");
  const [quotaUnit, setQuotaUnit] = useState<StorageQuotaUnit>("GB");

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Deletion State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Object Inspection Modal
  const [inspectedBucket, setInspectedBucket] = useState<ManagedBucketItem | null>(null);
  const [bucketObjects, setBucketObjects] = useState<BucketObject[]>([]);
  const [isLoadingObjects, setIsLoadingObjects] = useState(false);

  // Client Keys Management Modal
  const [keysModalBucket, setKeysModalBucket] = useState<ManagedBucketItem | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [bucketsRes, accountsRes] = await Promise.all([
        fetch("/api/managed-buckets"),
        fetch("/api/upstream-accounts"),
      ]);

      if (!bucketsRes.ok || !accountsRes.ok) {
        throw new Error("Failed to load managed buckets data.");
      }

      const bucketsData = await bucketsRes.json();
      const accountsData = await accountsRes.json();

      setBuckets(bucketsData.buckets || []);
      setUpstreamAccounts(accountsData.accounts || []);
      if (accountsData.accounts?.length > 0) {
        setSelectedAccountId((prev) => prev || accountsData.accounts[0].id);
      }
      setFetchError(null);
    } catch (err: unknown) {
      setFetchError(
        err instanceof Error ? err.message : "Error loading data.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const [bucketsRes, accountsRes] = await Promise.all([
          fetch("/api/managed-buckets"),
          fetch("/api/upstream-accounts"),
        ]);

        if (!bucketsRes.ok || !accountsRes.ok) {
          throw new Error("Failed to load managed buckets data.");
        }

        const bucketsData = await bucketsRes.json();
        const accountsData = await accountsRes.json();

        if (!ignore) {
          setBuckets(bucketsData.buckets || []);
          setUpstreamAccounts(accountsData.accounts || []);
          if (accountsData.accounts?.length > 0) {
            setSelectedAccountId((prev) => prev || accountsData.accounts[0].id);
          }
          setFetchError(null);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setFetchError(
            err instanceof Error ? err.message : "Error loading data.",
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

  const resetForm = () => {
    setName("");
    setUpstreamBucket("");
    setBucketType("physical");
    setQuotaValue("5");
    setQuotaUnit("GB");
    setFormError(null);
  };

  const handleCreateBucket = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/managed-buckets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim().toLowerCase(),
          upstreamAccountId: selectedAccountId,
          upstreamBucket: upstreamBucket.trim(),
          bucketType,
          storageQuotaValue: Number(quotaValue),
          storageQuotaUnit: quotaUnit,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Failed to create managed bucket.");
        return;
      }

      setFormSuccess(
        `Managed bucket "${data.bucket?.name || name}" successfully created! Baseline crawl indexed ${data.bucket?.usedBytes ? formatBytes(data.bucket.usedBytes) : "0 B"}.`,
      );
      resetForm();
      setIsModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      setFormError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during bucket creation.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBucket = async (bucket: ManagedBucketItem) => {
    if (
      !confirm(
        `Are you sure you want to delete managed bucket "${bucket.name}"? This removes object tracking and client associations.`,
      )
    ) {
      return;
    }

    setDeletingId(bucket.id);
    try {
      const res = await fetch(`/api/managed-buckets/${bucket.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete bucket");
        return;
      }

      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete bucket");
    } finally {
      setDeletingId(null);
    }
  };

  const handleInspectObjects = async (bucket: ManagedBucketItem) => {
    setInspectedBucket(bucket);
    setIsLoadingObjects(true);
    setBucketObjects([]);

    try {
      const res = await fetch(`/api/managed-buckets/${bucket.id}`);
      if (!res.ok) {
        throw new Error("Failed to fetch bucket objects.");
      }
      const data = await res.json();
      setBucketObjects(data.objects || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingObjects(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Success Notification */}
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

      {/* Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2
            id="buckets-section"
            className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100"
          >
            Managed Buckets
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Define storage targets with strictly enforced byte quotas, 1:1 physical mappings, or isolated virtual prefixes.
          </p>
        </div>

        <button
          type="button"
          id="create-managed-bucket-btn"
          onClick={() => {
            setFormError(null);
            setIsModalOpen(true);
          }}
          disabled={upstreamAccounts.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition-all hover:bg-indigo-500 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Managed Bucket
        </button>
      </div>

      {upstreamAccounts.length === 0 && !isLoading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <p className="font-semibold">Upstream Account Required</p>
          <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-400">
            Connect an Upstream Account above before creating a Managed Bucket.
          </p>
        </div>
      )}

      {/* Bucket List / Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-56 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100/50 p-6 dark:border-zinc-800 dark:bg-zinc-900/50"
            />
          ))}
        </div>
      ) : fetchError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {fetchError}
        </div>
      ) : buckets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white/50 p-12 text-center dark:border-zinc-800 dark:bg-zinc-900/20">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            No Managed Buckets configured
          </h3>
          <p className="mt-1 max-w-sm text-xs text-zinc-500 dark:text-zinc-400">
            Create a Managed Bucket to allocate an isolated storage namespace with an enforced byte quota.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {buckets.map((bucket) => {
            const isExceeded = bucket.status === "quota_exceeded" || bucket.progress.isExceeded;
            const percentage = bucket.progress.percentage;

            // Determine bar color
            const barColor = isExceeded
              ? "bg-red-500"
              : percentage >= 80
                ? "bg-amber-500"
                : "bg-emerald-500";

            return (
              <div
                key={bucket.id}
                className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div>
                  {/* Top Row: Name & Status Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-mono text-base font-bold text-zinc-900 dark:text-zinc-100 truncate">
                        {bucket.name}
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Account: <span className="font-medium text-zinc-700 dark:text-zinc-300">{bucket.upstreamAccountName || "External S3"}</span>
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        isExceeded
                          ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400 border border-red-200 dark:border-red-900"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${isExceeded ? "bg-red-500" : "bg-emerald-500"}`} />
                      {isExceeded ? "Quota Exceeded" : "Active"}
                    </span>
                  </div>

                  {/* Mapping Type & Target */}
                  <div className="mt-3 rounded-lg bg-zinc-50 p-2.5 text-xs dark:bg-zinc-950 space-y-1">
                    <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
                      <span>Mapping</span>
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                        {bucket.bucketType === "physical" ? "Physical 1:1" : "Virtual Prefix"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
                      <span>Target</span>
                      <span className="font-mono text-zinc-800 dark:text-zinc-200 truncate max-w-45">
                        {bucket.upstreamBucket}
                      </span>
                    </div>
                    {bucket.virtualPrefix && (
                      <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
                        <span>Prefix</span>
                        <span className="font-mono text-indigo-600 dark:text-indigo-400 truncate max-w-45">
                          {bucket.virtualPrefix}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Capacity Progress Bar */}
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-600 dark:text-zinc-300">
                        Storage Capacity
                      </span>
                      <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                        {bucket.progress.formattedUsed} / {bucket.progress.formattedQuota} ({percentage}%)
                      </span>
                    </div>

                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className={`h-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>

                    {isExceeded && (
                      <p className="text-[11px] text-red-600 dark:text-red-400 font-medium">
                        Storage quota breached. Write operations will be rejected.
                      </p>
                    )}
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleInspectObjects(bucket)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 cursor-pointer"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                    {bucket.objectCount} {bucket.objectCount === 1 ? "object" : "objects"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setKeysModalBucket(bucket)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 hover:text-indigo-600 dark:text-zinc-300 dark:hover:text-indigo-400 cursor-pointer"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                      />
                    </svg>
                    Keys
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteBucket(bucket)}
                    disabled={deletingId === bucket.id}
                    className="text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 cursor-pointer disabled:opacity-50"
                  >
                    {deletingId === bucket.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Managed Bucket Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                Create Managed Bucket
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateBucket} className="mt-4 space-y-4">
              {/* Upstream Account Select */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Upstream Account
                </label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  required
                  className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-xs focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  {upstreamAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.region})
                    </option>
                  ))}
                </select>
              </div>

              {/* Tenant Bucket Name */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Tenant-Scoped Bucket Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. app-assets"
                  className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 shadow-xs focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  The logical bucket name exposed to your downstream apps (3-63 lowercase alphanumeric characters).
                </p>
              </div>

              {/* Upstream Physical Bucket */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Upstream Physical Bucket Name
                </label>
                <input
                  type="text"
                  required
                  value={upstreamBucket}
                  onChange={(e) => setUpstreamBucket(e.target.value)}
                  placeholder="e.g. my-company-raw-s3"
                  className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 shadow-xs focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              {/* Bucket Type Radio */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Mapping Mode
                </label>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setBucketType("physical")}
                    className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${
                      bucketType === "physical"
                        ? "border-indigo-600 bg-indigo-50/50 dark:border-indigo-500 dark:bg-indigo-950/30"
                        : "border-zinc-200 bg-zinc-50/50 hover:bg-zinc-100/50 dark:border-zinc-700 dark:bg-zinc-800/40"
                    }`}
                  >
                    <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      Physical (1:1)
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                      Maps directly to the entire upstream bucket.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBucketType("virtual_prefix")}
                    className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${
                      bucketType === "virtual_prefix"
                        ? "border-indigo-600 bg-indigo-50/50 dark:border-indigo-500 dark:bg-indigo-950/30"
                        : "border-zinc-200 bg-zinc-50/50 hover:bg-zinc-100/50 dark:border-zinc-700 dark:bg-zinc-800/40"
                    }`}
                  >
                    <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      Virtual Prefix
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                      Partitions bucket using an isolated prefix (split/&lt;id&gt;/).
                    </div>
                  </button>
                </div>
              </div>

              {/* Storage Quota */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Storage Quota Limit
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    type="number"
                    min="1"
                    required
                    value={quotaValue}
                    onChange={(e) => setQuotaValue(e.target.value)}
                    className="w-2/3 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-xs focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  <select
                    value={quotaUnit}
                    onChange={(e) => setQuotaUnit(e.target.value as StorageQuotaUnit)}
                    className="w-1/3 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 shadow-xs focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  >
                    <option value="MB">MB</option>
                    <option value="GB">GB</option>
                    <option value="TB">TB</option>
                  </select>
                </div>
              </div>

              {/* Notice Banner */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
                <p className="font-semibold">Baseline Crawl Notice</p>
                <p className="mt-0.5 text-[11px] text-blue-800 dark:text-blue-400">
                  S3-Split will immediately scan upstream objects via ListObjectsV2 to calculate current baseline usage.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                  }}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Scanning & Creating...
                    </>
                  ) : (
                    "Create Managed Bucket"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Object Inspection Modal */}
      {inspectedBucket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Tracked Objects: <span className="font-mono text-indigo-600 dark:text-indigo-400">{inspectedBucket.name}</span>
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Indexed from upstream storage during baseline crawl
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedBucket(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 max-h-96 overflow-auto">
              {isLoadingObjects ? (
                <div className="py-12 text-center text-xs text-zinc-500 dark:text-zinc-400 animate-pulse">
                  Loading tracked objects...
                </div>
              ) : bucketObjects.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
                  No objects indexed in this bucket yet.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-zinc-200 bg-zinc-50 font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                    <tr>
                      <th className="py-2 px-3">Key</th>
                      <th className="py-2 px-3">Size</th>
                      <th className="py-2 px-3">ETag</th>
                      <th className="py-2 px-3">Last Modified</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                    {bucketObjects.map((obj) => (
                      <tr key={obj.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                        <td className="py-2 px-3 font-mono text-zinc-900 dark:text-zinc-100 break-all">
                          {obj.key}
                        </td>
                        <td className="py-2 px-3 font-medium text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                          {formatBytes(obj.sizeBytes)}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-30">
                          {obj.etag || "-"}
                        </td>
                        <td className="py-2 px-3 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                          {obj.lastModified ? new Date(obj.lastModified).toLocaleDateString() : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-4 flex justify-end pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setInspectedBucket(null)}
                className="rounded-xl border border-zinc-200 px-4 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Keys Modal */}
      {keysModalBucket && (
        <ClientKeysModal
          bucket={keysModalBucket}
          onClose={() => setKeysModalBucket(null)}
        />
      )}
    </div>
  );
}
