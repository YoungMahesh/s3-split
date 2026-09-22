"use client";

import React, { useState, useEffect, useCallback } from "react";
import { formatBytes, type StorageQuotaUnit } from "@/lib/quota";
import { ClientKeysModal } from "./client-keys-modal";
import {
  Button,
  Card,
  Badge,
  Modal,
  Input,
  Select,
  Label,
  FormGroup,
  Progress,
} from "@/app/components/ui";

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

  // Deletion Modal State
  const [deletingBucket, setDeletingBucket] = useState<ManagedBucketItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Object Inspection Modal
  const [inspectedBucket, setInspectedBucket] = useState<ManagedBucketItem | null>(null);
  const [bucketObjects, setBucketObjects] = useState<BucketObject[]>([]);
  const [isLoadingObjects, setIsLoadingObjects] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileMessage, setReconcileMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

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

  const confirmDeleteBucket = async () => {
    if (!deletingBucket) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/managed-buckets/${deletingBucket.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete bucket");
        return;
      }

      setDeletingBucket(null);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete bucket");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleInspectObjects = async (bucket: ManagedBucketItem) => {
    setInspectedBucket(bucket);
    setIsLoadingObjects(true);
    setBucketObjects([]);
    setReconcileMessage(null);

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

  const handleReconcileStorage = async (bucketId: string) => {
    setIsReconciling(true);
    setReconcileMessage(null);

    try {
      const res = await fetch(`/api/managed-buckets/${bucketId}/reconcile`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setReconcileMessage({
          type: "error",
          text: data.error || "Failed to reconcile storage with upstream provider.",
        });
        return;
      }

      const { reconciliation, bucket: updatedBucket, objects: updatedObjects } = data;

      if (updatedObjects) {
        setBucketObjects(updatedObjects);
      }

      if (updatedBucket) {
        setInspectedBucket(updatedBucket);
        setBuckets((prev) =>
          prev.map((b) =>
            b.id === updatedBucket.id
              ? {
                  ...b,
                  ...updatedBucket,
                  objectCount: updatedObjects?.length ?? b.objectCount,
                }
              : b,
          ),
        );
      }

      const driftPrefix = reconciliation.driftBytes > 0 ? "+" : "";
      const formattedDrift = `${driftPrefix}${formatBytes(reconciliation.driftBytes)}`;
      setReconcileMessage({
        type: "success",
        text: `Reconciliation complete: verified ${reconciliation.upstreamCount} upstream objects. Net drift: ${formattedDrift}. Quota synced.`,
      });
    } catch (err: unknown) {
      setReconcileMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Reconciliation failed.",
      });
    } finally {
      setIsReconciling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Notifications */}
      {formSuccess && (
        <div
          role="status"
          className="flex items-start justify-between rounded-xl border border-[#5db8a6]/40 bg-[#5db8a6]/15 p-4 text-sm text-[#1e6155] shadow-xs"
        >
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 shrink-0 text-[#2b7264]"
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
            className="text-[#2b7264] hover:text-[#141413] cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header and Action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#e6dfd8] pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-serif text-2xl font-medium tracking-tight text-[#141413]">
              Managed Buckets
            </h2>
            <Badge variant="coral" size="sm">
              Quota Enforcement
            </Badge>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-[#6c6a64]">
            Isolated storage targets governed by strict byte quotas. Downstream applications authenticate using Client Keys via S3 proxy.
          </p>
        </div>

        <Button
          id="create-bucket-btn"
          variant="primary"
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          disabled={upstreamAccounts.length === 0}
          className="shrink-0"
        >
          <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Managed Bucket
        </Button>
      </div>

      {/* Upstream Account Prerequisite Warning */}
      {upstreamAccounts.length === 0 && !isLoading && (
        <div className="rounded-xl border border-[#e8a55a]/40 bg-[#e8a55a]/15 p-4 text-xs text-[#855013]">
          Connect at least one Upstream Account above before creating a Managed Bucket.
        </div>
      )}

      {/* Managed Buckets Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
          <div className="h-56 rounded-xl bg-[#efe9de]" />
          <div className="h-56 rounded-xl bg-[#efe9de]" />
        </div>
      ) : fetchError ? (
        <div className="rounded-xl border border-[#c64545]/30 bg-[#c64545]/10 p-5 text-sm text-[#9a2c2c]">
          <p className="font-semibold">Failed to load managed buckets</p>
          <p className="mt-1 text-xs">{fetchError}</p>
        </div>
      ) : buckets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#e6dfd8] bg-[#faf9f5] p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#efe9de] text-[#cc785c] mb-3 border border-[#e6dfd8]">
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
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
          </div>
          <h3 className="font-serif text-lg font-medium text-[#141413]">
            No Managed Buckets Created
          </h3>
          <p className="mt-1 max-w-sm text-xs text-[#6c6a64] leading-relaxed">
            Create a managed bucket target (physical bucket or virtual prefix partition) with a defined byte quota to issue client credentials.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            disabled={upstreamAccounts.length === 0}
            className="mt-4"
          >
            Create First Managed Bucket
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {buckets.map((bucket) => {
            const isExceeded = bucket.status === "quota_exceeded" || bucket.progress.percentage >= 100;
            const isApproaching = !isExceeded && bucket.progress.percentage >= 75;

            return (
              <Card key={bucket.id} variant="card" className="flex flex-col justify-between">
                <div className="p-5 sm:p-6 space-y-4">
                  {/* Bucket Header: Name and Type Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-serif text-xl font-medium tracking-tight text-[#141413]">
                          {bucket.name}
                        </span>
                        {bucket.bucketType === "virtual_prefix" ? (
                          <Badge variant="coral" size="sm">
                            Virtual Prefix
                          </Badge>
                        ) : (
                          <Badge variant="cream" size="sm">
                            Physical Bucket
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-[#6c6a64]">
                        <span>Upstream: <strong className="text-[#3d3d3a]">{bucket.upstreamAccountName || "External S3"}</strong></span>
                        <span>•</span>
                        <span className="font-mono text-[#3d3d3a]">{bucket.upstreamBucket}</span>
                      </div>
                    </div>
                  </div>

                  {/* Virtual Prefix indicator if applicable */}
                  {bucket.bucketType === "virtual_prefix" && bucket.virtualPrefix && (
                    <div className="rounded-lg bg-[#faf9f5] border border-[#e6dfd8] p-2.5 text-xs font-mono text-[#6c6a64]">
                      <span className="text-[10px] font-sans font-semibold uppercase text-[#8e8b82] block">
                        Partition Prefix
                      </span>
                      <span className="text-[#141413] mt-0.5 block truncate select-all">
                        {bucket.virtualPrefix}
                      </span>
                    </div>
                  )}

                  {/* Harmonious Quota Progress Meter */}
                  <div className="pt-1">
                    <Progress
                      percentage={bucket.progress.percentage}
                      usedFormatted={bucket.progress.formattedUsed}
                      quotaFormatted={bucket.progress.formattedQuota}
                      showBadge={true}
                      showDetails={true}
                    />
                  </div>

                  {/* Quota Status Warning Banners */}
                  {isExceeded && (
                    <div className="rounded-lg border border-[#c64545]/30 bg-[#c64545]/10 p-3 text-xs text-[#9a2c2c] leading-relaxed">
                      <strong>Storage Quota Exceeded:</strong> PutObject operations will be rejected with HTTP 507 QuotaExceeded until existing objects are deleted.
                    </div>
                  )}

                  {isApproaching && (
                    <div className="rounded-lg border border-[#cc785c]/30 bg-[#cc785c]/10 p-3 text-xs text-[#a9583e] leading-relaxed">
                      <strong>Approaching Quota:</strong> Over 75% of allocated storage capacity is utilized.
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="border-t border-[#e6dfd8] bg-[#f5f0e8]/50 px-5 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleInspectObjects(bucket)}
                    >
                      Objects ({bucket.objectCount})
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setKeysModalBucket(bucket)}
                      className="border-[#cc785c]/30 text-[#cc785c] hover:bg-[#cc785c]/10"
                    >
                      Client Keys
                    </Button>
                  </div>

                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setDeletingBucket(bucket)}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Managed Bucket Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Managed Bucket"
        description="Allocate an upstream storage target governed by an enforced byte quota."
        maxWidth="xl"
      >
        {formError && (
          <div
            role="alert"
            className="rounded-xl border border-[#c64545]/30 bg-[#c64545]/10 p-4 text-xs text-[#9a2c2c]"
          >
            {formError}
          </div>
        )}

        <form onSubmit={handleCreateBucket} className="space-y-4">
          <FormGroup>
            <Label htmlFor="bucket-name">Bucket Name (Tenant Unique)</Label>
            <Input
              id="bucket-name"
              type="text"
              required
              placeholder="e.g. app-assets or user-uploads"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="font-mono"
            />
            <p className="text-[11px] text-[#8e8b82]">
              Lowercase alphanumeric, hyphens, and dots (3 to 63 chars).
            </p>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="upstream-account-select">Upstream Provider Account</Label>
            <Select
              id="upstream-account-select"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              required
            >
              {upstreamAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.region})
                </option>
              ))}
            </Select>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="upstream-physical-bucket">Upstream Bucket Target</Label>
            <Input
              id="upstream-physical-bucket"
              type="text"
              required
              placeholder="e.g. my-cloud-storage-bucket"
              value={upstreamBucket}
              onChange={(e) => setUpstreamBucket(e.target.value)}
              className="font-mono"
            />
          </FormGroup>

          <FormGroup>
            <Label>Bucket Isolation Mode</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBucketType("physical")}
                className={`p-3 text-left rounded-lg border text-xs transition-colors cursor-pointer ${
                  bucketType === "physical"
                    ? "border-[#cc785c] bg-[#faf9f5] ring-1 ring-[#cc785c]"
                    : "border-[#e6dfd8] bg-[#faf9f5] hover:bg-[#efe9de]"
                }`}
              >
                <span className="font-semibold block text-[#141413]">
                  Physical Bucket
                </span>
                <span className="text-[#6c6a64] text-[11px] block mt-0.5">
                  1:1 mapping with upstream bucket
                </span>
              </button>

              <button
                type="button"
                onClick={() => setBucketType("virtual_prefix")}
                className={`p-3 text-left rounded-lg border text-xs transition-colors cursor-pointer ${
                  bucketType === "virtual_prefix"
                    ? "border-[#cc785c] bg-[#faf9f5] ring-1 ring-[#cc785c]"
                    : "border-[#e6dfd8] bg-[#faf9f5] hover:bg-[#efe9de]"
                }`}
              >
                <span className="font-semibold block text-[#141413]">
                  Virtual Prefix Partition
                </span>
                <span className="text-[#6c6a64] text-[11px] block mt-0.5">
                  Isolated prefix inside shared bucket
                </span>
              </button>
            </div>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="quota-value">Storage Quota Cap</Label>
            <div className="flex gap-2">
              <Input
                id="quota-value"
                type="number"
                min="0.001"
                step="any"
                required
                value={quotaValue}
                onChange={(e) => setQuotaValue(e.target.value)}
                className="w-2/3"
              />
              <Select
                value={quotaUnit}
                onChange={(e) => setQuotaUnit(e.target.value as StorageQuotaUnit)}
                className="w-1/3"
              >
                <option value="MB">MB</option>
                <option value="GB">GB</option>
                <option value="TB">TB</option>
              </Select>
            </div>
          </FormGroup>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#e6dfd8]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
            >
              {isSubmitting ? "Creating & Crawling..." : "Create Bucket"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Object Inspection & Reconciliation Modal */}
      {inspectedBucket && (
        <Modal
          isOpen={Boolean(inspectedBucket)}
          onClose={() => setInspectedBucket(null)}
          title={`Object Explorer — ${inspectedBucket.name}`}
          description={`Tracked objects and upstream synchronization for bucket ${inspectedBucket.name}.`}
          maxWidth="3xl"
        >
          {reconcileMessage && (
            <div
              role="alert"
              className={`rounded-xl border p-4 text-xs leading-relaxed ${
                reconcileMessage.type === "success"
                  ? "border-[#5db8a6]/40 bg-[#5db8a6]/15 text-[#1e6155]"
                  : "border-[#c64545]/30 bg-[#c64545]/10 text-[#9a2c2c]"
              }`}
            >
              {reconcileMessage.text}
            </div>
          )}

          {/* Sync Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-xl bg-[#efe9de] border border-[#e6dfd8]">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#6c6a64]">Used Capacity:</span>
                <span className="font-mono text-xs font-bold text-[#141413]">
                  {formatBytes(inspectedBucket.usedBytes)} / {formatBytes(inspectedBucket.storageQuotaBytes)}
                </span>
                <Badge variant={inspectedBucket.status === "quota_exceeded" ? "crimson" : "teal"} size="sm" dot>
                  {inspectedBucket.status === "quota_exceeded" ? "Quota Exceeded" : "Healthy"}
                </Badge>
              </div>
              <p className="text-[11px] text-[#8e8b82] mt-0.5">
                {bucketObjects.length} object{bucketObjects.length === 1 ? "" : "s"} indexed in registry.
              </p>
            </div>

            <Button
              variant="secondary"
              size="sm"
              isLoading={isReconciling}
              onClick={() => handleReconcileStorage(inspectedBucket.id)}
            >
              <svg className="h-3.5 w-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reconcile Upstream
            </Button>
          </div>

          {/* Object Table */}
          {isLoadingObjects ? (
            <div className="p-8 text-center text-xs text-[#6c6a64] animate-pulse">
              Loading tracked objects...
            </div>
          ) : bucketObjects.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#6c6a64] border border-dashed border-[#e6dfd8] rounded-xl bg-[#faf9f5]">
              No objects stored yet in this managed bucket.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#e6dfd8] bg-[#faf9f5]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#e6dfd8] bg-[#efe9de] text-[11px] font-semibold uppercase text-[#6c6a64]">
                  <tr>
                    <th scope="col" className="px-4 py-2.5">Key</th>
                    <th scope="col" className="px-4 py-2.5">Size</th>
                    <th scope="col" className="px-4 py-2.5">ETag</th>
                    <th scope="col" className="px-4 py-2.5">Last Modified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e6dfd8] font-mono">
                  {bucketObjects.map((obj) => (
                    <tr key={obj.id} className="hover:bg-[#efe9de]/50 transition-colors">
                      <td className="px-4 py-2.5 text-[#141413] font-medium max-w-xs truncate">
                        {obj.key}
                      </td>
                      <td className="px-4 py-2.5 text-[#3d3d3a] whitespace-nowrap">
                        {formatBytes(obj.sizeBytes)}
                      </td>
                      <td className="px-4 py-2.5 text-[#8e8b82] max-w-xs truncate">
                        {obj.etag || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[#6c6a64] font-sans whitespace-nowrap">
                        {obj.lastModified ? new Date(obj.lastModified).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {/* Client Keys Modal */}
      {keysModalBucket && (
        <ClientKeysModal
          bucket={keysModalBucket}
          onClose={() => setKeysModalBucket(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deletingBucket)}
        onClose={() => setDeletingBucket(null)}
        title="Delete Managed Bucket"
        maxWidth="md"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDeletingBucket(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger-fill"
              size="sm"
              isLoading={isDeleting}
              onClick={confirmDeleteBucket}
            >
              Delete Bucket
            </Button>
          </>
        }
      >
        <p className="text-sm text-[#3d3d3a] leading-relaxed">
          Are you sure you want to delete managed bucket{" "}
          <strong className="text-[#141413]">{deletingBucket?.name}</strong>?
          This removes object tracking and client credential associations.
        </p>
      </Modal>
    </div>
  );
}
