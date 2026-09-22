import React from "react";
import { Badge, Card } from "@/app/components/ui";

export function FeaturesGrid() {
  const features = [
    {
      badge: "Storage Quota",
      variant: "coral" as const,
      title: "Real-Time Byte Quotas",
      description:
        "Reject over-quota uploads before sending a single byte to upstream providers. S3-Split tracks active byte allocations and locks part reservations during multipart uploads to prevent concurrent overages.",
      metric: "0 Over-Allocation Leaks",
    },
    {
      badge: "Virtual Prefix Buckets",
      variant: "teal" as const,
      title: "Virtual Storage Partitioning",
      description:
        "Carve a single upstream physical S3 bucket into hundreds of isolated Managed Buckets using virtual prefixes. Downstream apps operate with dedicated Client Keys as if they owned dedicated physical buckets.",
      metric: "Bypass AWS 100-Bucket Limit",
    },
    {
      badge: "SigV4 Standard",
      variant: "amber" as const,
      title: "Drop-in S3 SDK Compatibility",
      description:
        "Full support for AWS Signature Version 4 protocol. Downstream applications continue using official AWS SDKs, boto3, or the AWS CLI by simply re-pointing the endpoint URL and supplying their Client Key.",
      metric: "Zero Code Rewrites Required",
    },
    {
      badge: "Object Registry",
      variant: "dark" as const,
      title: "Database Registry & Baseline Scan",
      description:
        "A relational PostgreSQL registry records all Managed Objects, sizes, and ETags. Background baseline scans index pre-existing objects upon bucket registration to ensure byte-perfect quota accounting.",
      metric: "Sub-Millisecond Quota Lookup",
    },
  ];

  return (
    <section id="features" className="scroll-mt-20 py-16 sm:py-20 border-t border-[#e6dfd8] bg-[#faf9f5]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="max-w-2xl space-y-3">
          <Badge variant="coral" size="sm">
            Platform Capabilities
          </Badge>
          <h2 className="font-serif text-3xl sm:text-4xl font-medium tracking-tight text-[#141413]">
            Engineered for multi-tenant storage governance.
          </h2>
          <p className="text-sm sm:text-base text-[#3d3d3a] leading-relaxed">
            Eliminate runaway S3 storage bills, partition tenant data securely,
            and enforce hard quotas without disrupting developer workflows or
            switching tools.
          </p>
        </div>

        {/* 4 Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((f, i) => (
            <Card
              key={i}
              className="p-6 sm:p-8 flex flex-col justify-between space-y-6 hover:border-[#cc785c]/40 transition-colors"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Badge variant={f.variant} size="sm">
                    {f.badge}
                  </Badge>
                  <span className="text-xs font-mono text-[#8e8b82]">
                    0{i + 1}
                  </span>
                </div>

                <h3 className="font-serif text-2xl font-medium text-[#141413]">
                  {f.title}
                </h3>

                <p className="text-xs sm:text-sm text-[#3d3d3a] leading-relaxed">
                  {f.description}
                </p>
              </div>

              <div className="pt-4 border-t border-[#e6dfd8] flex items-center justify-between">
                <span className="text-xs font-mono text-[#6c6a64]">
                  Key Invariant
                </span>
                <span className="text-xs font-semibold text-[#141413]">
                  {f.metric}
                </span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
