"use client";

import React, { useState, useEffect } from "react";
import type { ManagedBucketItem } from "./managed-buckets";
import type { IntegrationSnippets } from "@/lib/snippets";
import {
  Button,
  Badge,
  Modal,
  Input,
  Select,
  Label,
  FormGroup,
  CodeWindow,
  type CodeTab,
} from "@/app/components/ui";

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
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  // Revocation State
  const [revokingKey, setRevokingKey] = useState<ClientKeyItem | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

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

  const confirmRevokeKey = async () => {
    if (!revokingKey) return;

    setIsRevoking(true);
    try {
      const res = await fetch(`/api/client-keys/${revokingKey.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to revoke client key.");
      }

      // Remove from active list
      setKeys((prev) => prev.filter((k) => k.id !== revokingKey.id));
      setRevokingKey(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to revoke client key.");
    } finally {
      setIsRevoking(false);
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

  const snippetTabs: CodeTab[] = revealedData
    ? [
        { id: "env", label: ".env", code: revealedData.snippets.env },
        { id: "node", label: "Node.js (@aws-sdk)", code: revealedData.snippets.node },
        { id: "python", label: "Python (boto3)", code: revealedData.snippets.python },
        { id: "awsCli", label: "AWS CLI", code: revealedData.snippets.awsCli },
        { id: "curl", label: "curl (SigV4)", code: revealedData.snippets.curl },
      ]
    : [];

  return (
    <>
      <Modal
        isOpen={true}
        onClose={onClose}
        title={
          <div className="flex items-center gap-2">
            <span>Client Keys</span>
            <Badge variant="coral" size="sm">
              {bucket.name}
            </Badge>
          </div>
        }
        description="Issue and manage AWS SigV4 credentials for downstream applications communicating with the S3 gateway."
        maxWidth="3xl"
      >
        {errorMessage && (
          <div className="rounded-xl border border-[#c64545]/30 bg-[#c64545]/10 p-4 text-xs text-[#9a2c2c]">
            {errorMessage}
          </div>
        )}

        {/* ONE-TIME REVEAL CARD IN CURATED DARK NAVY PRODUCT CHROME */}
        {revealedData && (
          <div className="rounded-2xl border border-[#252320] bg-[#181715] p-5 sm:p-6 text-[#faf9f5] space-y-5 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-[#cc785c]/20 p-2 text-[#cc785c] shrink-0">
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
                <h3 className="font-serif text-lg font-medium text-[#faf9f5]">
                  Save Your Secret Access Key Now
                </h3>
                <p className="mt-0.5 text-xs text-[#a09d96] leading-relaxed">
                  This is the <span className="font-semibold text-[#cc785c]">only time</span> the secret access key will be shown. S3-Split encrypts credentials at rest with AES-256-GCM and will never reveal it again.
                </p>
              </div>
            </div>

            {/* Key Details Grid */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Access Key ID */}
              <div className="rounded-xl border border-[#252320] bg-[#1f1e1b] p-3.5">
                <div className="flex items-center justify-between text-xs text-[#a09d96]">
                  <span>Access Key ID</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(revealedData.key.accessKeyId, "accessKeyId")}
                    className="inline-flex items-center gap-1 font-medium text-[#cc785c] hover:text-[#e8a55a] transition-colors cursor-pointer"
                  >
                    {copiedField === "accessKeyId" ? "✓ Copied" : "Copy"}
                  </button>
                </div>
                <div className="mt-1 font-mono text-sm font-bold text-[#faf9f5] select-all truncate">
                  {revealedData.key.accessKeyId}
                </div>
              </div>

              {/* Secret Access Key */}
              <div className="rounded-xl border border-[#252320] bg-[#1f1e1b] p-3.5">
                <div className="flex items-center justify-between text-xs text-[#a09d96]">
                  <span>Secret Access Key</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="text-[#a09d96] hover:text-[#faf9f5] transition-colors cursor-pointer"
                    >
                      {showSecret ? "Hide" : "Reveal"}
                    </button>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(revealedData.secretAccessKey, "secretAccessKey")}
                      className="inline-flex items-center gap-1 font-medium text-[#cc785c] hover:text-[#e8a55a] transition-colors cursor-pointer"
                    >
                      {copiedField === "secretAccessKey" ? "✓ Copied" : "Copy"}
                    </button>
                  </div>
                </div>
                <div className="mt-1 font-mono text-sm font-bold text-[#faf9f5] select-all truncate">
                  {showSecret ? revealedData.secretAccessKey : "••••••••••••••••••••••••••••••••••••••••"}
                </div>
              </div>
            </div>

            {/* Integration Snippets CodeWindow */}
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#a09d96] block">
                Integration Snippets
              </span>
              <CodeWindow
                tabs={snippetTabs}
                maxHeight="max-h-56"
              />
            </div>

            {/* Dismiss Button */}
            <div className="flex justify-end pt-1">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setRevealedData(null)}
              >
                I Have Safely Saved My Secret Key
              </Button>
            </div>
          </div>
        )}

        {/* GENERATE KEY FORM / TRIGGER */}
        {!showCreateForm ? (
          <div className="flex items-center justify-between border-b border-[#e6dfd8] pb-4">
            <div>
              <h3 className="font-serif text-lg font-medium text-[#141413]">
                Active Client Keys
              </h3>
              <p className="text-xs text-[#6c6a64]">
                Downstream applications use these credentials with standard S3 SDKs.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowCreateForm(true)}
            >
              <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Client Key
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-[#e6dfd8] bg-[#efe9de] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#e6dfd8] pb-2">
              <h4 className="font-serif text-base font-medium text-[#141413]">
                Generate New Client Key
              </h4>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="text-xs text-[#6c6a64] hover:text-[#141413] cursor-pointer"
              >
                ✕ Cancel
              </button>
            </div>

            {formError && (
              <div className="rounded-lg border border-[#c64545]/30 bg-[#c64545]/10 p-3 text-xs text-[#9a2c2c]">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateKey} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormGroup>
                  <Label htmlFor="key-name">Key Identifier / Application Name</Label>
                  <Input
                    id="key-name"
                    type="text"
                    required
                    placeholder="e.g. Next.js Uploads or Backup Job"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                  />
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="key-permission">Permissions</Label>
                  <Select
                    id="key-permission"
                    value={permission}
                    onChange={(e) => setPermission(e.target.value as "read_write" | "read_only")}
                  >
                    <option value="read_write">Read & Write (Full Gateway Access)</option>
                    <option value="read_only">Read Only (GetObject & ListObjectsV2)</option>
                  </Select>
                </FormGroup>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowCreateForm(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={isSubmitting}
                >
                  Generate Key Pair
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* ACTIVE KEYS LISTING */}
        {isLoading ? (
          <div className="p-8 text-center text-xs text-[#6c6a64] animate-pulse">
            Loading client keys...
          </div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-[#e6dfd8] rounded-xl bg-[#faf9f5]">
            <p className="font-serif text-base font-medium text-[#141413]">
              No Client Keys Issued
            </p>
            <p className="mt-1 text-xs text-[#6c6a64]">
              Generate a client key to connect downstream SDKs to this managed bucket.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#e6dfd8] bg-[#faf9f5]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#e6dfd8] bg-[#efe9de] text-[11px] font-semibold uppercase text-[#6c6a64]">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Key Name</th>
                  <th scope="col" className="px-4 py-2.5">Access Key ID</th>
                  <th scope="col" className="px-4 py-2.5">Permission</th>
                  <th scope="col" className="px-4 py-2.5">Created</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6dfd8]">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-[#efe9de]/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-[#141413]">
                      {k.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#3d3d3a]">
                      {k.accessKeyId}
                    </td>
                    <td className="px-4 py-3">
                      {k.permission === "read_write" ? (
                        <Badge variant="teal" size="sm">
                          Read / Write
                        </Badge>
                      ) : (
                        <Badge variant="cream" size="sm">
                          Read Only
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#6c6a64]">
                      {new Date(k.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setRevokingKey(k)}
                      >
                        Revoke
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Revocation Confirmation Modal */}
      <Modal
        isOpen={Boolean(revokingKey)}
        onClose={() => setRevokingKey(null)}
        title="Revoke Client Key"
        maxWidth="md"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRevokingKey(null)}
              disabled={isRevoking}
            >
              Cancel
            </Button>
            <Button
              variant="danger-fill"
              size="sm"
              isLoading={isRevoking}
              onClick={confirmRevokeKey}
            >
              Revoke Key Permanently
            </Button>
          </>
        }
      >
        <p className="text-sm text-[#3d3d3a] leading-relaxed">
          Are you sure you want to revoke key <strong className="text-[#141413]">{revokingKey?.name}</strong> ({revokingKey?.accessKeyId})?
          Applications using this key will immediately lose access to the S3 gateway.
        </p>
      </Modal>
    </>
  );
}
