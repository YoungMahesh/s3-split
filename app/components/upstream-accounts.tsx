"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Button,
  Card,
  Badge,
  Modal,
  Input,
  Label,
  FormGroup,
} from "@/app/components/ui";

export interface UpstreamAccount {
  id: string;
  name: string;
  endpointUrl: string;
  region: string;
  accessKeyId: string;
  createdAt: string;
  updatedAt?: string;
}

interface ProviderPreset {
  label: string;
  endpoint: string;
  region: string;
  tag: string;
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    label: "AWS S3",
    endpoint: "https://s3.us-east-1.amazonaws.com",
    region: "us-east-1",
    tag: "AWS",
  },
  {
    label: "Cloudflare R2",
    endpoint: "https://<account-id>.r2.cloudflarestorage.com",
    region: "auto",
    tag: "R2",
  },
  {
    label: "Wasabi",
    endpoint: "https://s3.wasabisys.com",
    region: "us-east-1",
    tag: "Wasabi",
  },
  {
    label: "MinIO",
    endpoint: "http://localhost:9000",
    region: "us-east-1",
    tag: "MinIO",
  },
];

function getProviderTag(endpoint: string): { label: string; variant: "amber" | "coral" | "teal" | "cream" } {
  const lower = endpoint.toLowerCase();
  if (lower.includes("amazonaws.com")) {
    return { label: "AWS S3", variant: "amber" };
  }
  if (lower.includes("r2.cloudflarestorage.com")) {
    return { label: "Cloudflare R2", variant: "coral" };
  }
  if (lower.includes("wasabisys.com")) {
    return { label: "Wasabi", variant: "teal" };
  }
  if (lower.includes("localhost") || lower.includes("minio") || lower.includes("127.0.0.1")) {
    return { label: "MinIO", variant: "coral" };
  }
  return { label: "S3 Compatible", variant: "cream" };
}

export function UpstreamAccountsManager() {
  const [accounts, setAccounts] = useState<UpstreamAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Form Modal State
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

  // Deletion Modal State
  const [deletingAccount, setDeletingAccount] = useState<UpstreamAccount | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const applyPreset = (preset: ProviderPreset) => {
    setEndpointUrl(preset.endpoint);
    setRegion(preset.region);
    if (!name) {
      setName(`${preset.label} Account`);
    }
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
            "Failed to connect upstream account. Probe validation failed.",
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

  const confirmDelete = async () => {
    if (!deletingAccount) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/upstream-accounts/${deletingAccount.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to disconnect account");
        return;
      }
      setDeletingAccount(null);
      await fetchAccounts();
    } catch (err: unknown) {
      alert(
        err instanceof Error ? err.message : "Failed to disconnect account",
      );
    } finally {
      setIsDeleting(false);
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
              Upstream Accounts
            </h2>
            <Badge variant="teal" size="sm" dot>
              Active Gateway
            </Badge>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-[#6c6a64]">
            External S3-compatible cloud storage providers. Upstream credentials are encrypted at rest with AES-256-GCM.
          </p>
        </div>

        <Button
          id="connect-upstream-btn"
          variant="primary"
          onClick={() => {
            resetForm();
            setIsFormOpen(true);
          }}
          className="shrink-0"
        >
          <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Connect Upstream Account
        </Button>
      </div>

      {/* Accounts Listing in Responsive Feature Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
          <div className="h-44 rounded-xl bg-[#efe9de]" />
          <div className="h-44 rounded-xl bg-[#efe9de]" />
        </div>
      ) : fetchError ? (
        <div className="rounded-xl border border-[#c64545]/30 bg-[#c64545]/10 p-5 text-sm text-[#9a2c2c]">
          <p className="font-semibold">Failed to load upstream accounts</p>
          <p className="mt-1 text-xs">{fetchError}</p>
        </div>
      ) : accounts.length === 0 ? (
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
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <h3 className="font-serif text-lg font-medium text-[#141413]">
            No Upstream Accounts Connected
          </h3>
          <p className="mt-1 max-w-sm text-xs text-[#6c6a64] leading-relaxed">
            Connect an external S3-compatible provider (AWS S3, Cloudflare R2, Wasabi, or MinIO) to configure managed buckets and quota partitions.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsFormOpen(true)}
            className="mt-4"
          >
            Connect First Provider
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((acc) => {
            const providerInfo = getProviderTag(acc.endpointUrl);
            return (
              <Card key={acc.id} variant="card" className="flex flex-col justify-between">
                <div className="p-5 sm:p-6 space-y-4">
                  {/* Card Header: Name and Provider Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-serif text-lg font-medium text-[#141413]">
                          {acc.name}
                        </span>
                        <Badge variant={providerInfo.variant} size="sm">
                          {providerInfo.label}
                        </Badge>
                      </div>
                      <span className="text-[11px] text-[#8e8b82]">
                        Connected {new Date(acc.createdAt).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>

                    <Badge variant="teal" size="sm" dot>
                      Verified Probe
                    </Badge>
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                    <div className="rounded-lg bg-[#faf9f5] border border-[#e6dfd8] p-2.5">
                      <span className="text-[#8e8b82] text-[10px] uppercase font-sans font-semibold block">
                        Region
                      </span>
                      <span className="text-[#141413] font-semibold truncate block mt-0.5">
                        {acc.region}
                      </span>
                    </div>

                    <div className="rounded-lg bg-[#faf9f5] border border-[#e6dfd8] p-2.5">
                      <span className="text-[#8e8b82] text-[10px] uppercase font-sans font-semibold block">
                        Access Key ID
                      </span>
                      <span className="text-[#141413] truncate block mt-0.5">
                        {acc.accessKeyId}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg bg-[#faf9f5] border border-[#e6dfd8] p-2.5 text-xs font-mono">
                    <span className="text-[#8e8b82] text-[10px] uppercase font-sans font-semibold block">
                      Endpoint URL
                    </span>
                    <span className="text-[#3d3d3a] truncate block mt-0.5 select-all">
                      {acc.endpointUrl}
                    </span>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="border-t border-[#e6dfd8] bg-[#f5f0e8]/50 px-5 sm:px-6 py-3 flex items-center justify-between">
                  <span className="text-xs text-[#6c6a64]">
                    AES-256-GCM Encrypted
                  </span>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setDeletingAccount(acc)}
                  >
                    Disconnect
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Connect Upstream Account Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title="Connect Upstream Storage Provider"
        description="S3-Split actively probes your endpoint and validates credentials with ListBuckets before saving."
        maxWidth="2xl"
      >
        {/* Provider Presets */}
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wider text-[#6c6a64] mb-2">
            Quick Provider Presets
          </span>
          <div className="flex flex-wrap gap-2">
            {PROVIDER_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="rounded-md border border-[#e6dfd8] bg-[#faf9f5] px-3 py-1.5 text-xs font-medium text-[#141413] hover:border-[#cc785c] hover:bg-[#efe9de] transition-colors cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Probe Error Alert */}
        {formError && (
          <div
            role="alert"
            id="upstream-form-error"
            className="rounded-xl border border-[#c64545]/30 bg-[#c64545]/10 p-4 text-sm text-[#9a2c2c]"
          >
            <div className="flex items-start gap-2.5">
              <svg
                className="h-5 w-5 shrink-0 text-[#c64545] mt-0.5"
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
                <p className="mt-0.5 text-xs text-[#9a2c2c] leading-relaxed">
                  {formError}
                </p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleConnect} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup>
              <Label htmlFor="upstream-name">Account Name</Label>
              <Input
                id="upstream-name"
                type="text"
                required
                placeholder="e.g. Production R2 or AWS Main"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </FormGroup>

            <FormGroup>
              <Label htmlFor="upstream-region">Region</Label>
              <Input
                id="upstream-region"
                type="text"
                required
                placeholder="e.g. us-east-1 or auto"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
            </FormGroup>
          </div>

          <FormGroup>
            <Label htmlFor="upstream-endpoint">Endpoint URL</Label>
            <Input
              id="upstream-endpoint"
              type="url"
              required
              placeholder="https://s3.us-east-1.amazonaws.com"
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
              className="font-mono"
            />
          </FormGroup>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormGroup>
              <Label htmlFor="upstream-access-key-id">Access Key ID</Label>
              <Input
                id="upstream-access-key-id"
                type="text"
                required
                placeholder="AKIAIOSFODNN7EXAMPLE"
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                className="font-mono"
              />
            </FormGroup>

            <FormGroup>
              <div className="flex items-center justify-between">
                <Label htmlFor="upstream-secret-access-key">Secret Access Key</Label>
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="text-xs text-[#6c6a64] hover:text-[#141413] cursor-pointer"
                >
                  {showSecret ? "Hide" : "Reveal"}
                </button>
              </div>
              <Input
                id="upstream-secret-access-key"
                type={showSecret ? "text" : "password"}
                required
                placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                value={secretAccessKey}
                onChange={(e) => setSecretAccessKey(e.target.value)}
                className="font-mono"
              />
            </FormGroup>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#e6dfd8]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsFormOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              id="submit-upstream-btn"
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
            >
              {isSubmitting ? "Probing S3 Endpoint..." : "Test Connection & Save"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Disconnect Confirmation Modal */}
      <Modal
        isOpen={Boolean(deletingAccount)}
        onClose={() => setDeletingAccount(null)}
        title="Disconnect Upstream Account"
        maxWidth="md"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDeletingAccount(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger-fill"
              size="sm"
              isLoading={isDeleting}
              onClick={confirmDelete}
            >
              Disconnect Account
            </Button>
          </>
        }
      >
        <p className="text-sm text-[#3d3d3a] leading-relaxed">
          Are you sure you want to disconnect upstream account{" "}
          <strong className="text-[#141413]">{deletingAccount?.name}</strong>?
          Any managed buckets linked to this upstream account will no longer be able to proxy S3 traffic.
        </p>
      </Modal>
    </div>
  );
}
