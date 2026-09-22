"use client";

import React from "react";
import {
  LandingHeader,
  LandingHero,
  ArchitectureSection,
  FeaturesGrid,
  SdkShowcase,
  QuotaSimulator,
  LandingFooter,
} from "@/app/components/landing";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#faf9f5] text-[#141413] flex flex-col justify-between selection:bg-[#cc785c]/20 selection:text-[#141413]">
      <LandingHeader />
      <main className="flex-1">
        <LandingHero />
        <ArchitectureSection />
        <FeaturesGrid />
        <SdkShowcase />
        <QuotaSimulator />
      </main>
      <LandingFooter />
    </div>
  );
}
