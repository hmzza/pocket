"use client";

import { useState } from "react";
import { HandCoins, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InvestmentManagement } from "@/components/admin/investment-management";
import { LoanManagement } from "@/components/admin/loan-management";
import { cn } from "@/lib/utils";

type CapitalTab = "loans" | "investments";

const tabs: Array<{ id: CapitalTab; label: string; icon: typeof HandCoins; description: string }> = [
  { id: "loans", label: "Loans", icon: HandCoins, description: "Loans taken, repayments, and outstanding balances." },
  { id: "investments", label: "Investments", icon: Landmark, description: "Partner commitments, paid capital, unpaid balances, and equity." }
];

export function CapitalManagement() {
  const [activeTab, setActiveTab] = useState<CapitalTab>("loans");
  const active = tabs.find((tab) => tab.id === activeTab)!;

  return (
    <div className="space-y-5">
      <Card className="p-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              type="button"
              variant={activeTab === tab.id ? "default" : "ghost"}
              className={cn("justify-start", activeTab !== tab.id && "text-pocket-navy")}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </Button>
          ))}
        </div>
      </Card>

      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">{active.label}</p>
        <p className="text-sm text-pocket-navy/60">{active.description}</p>
      </div>

      {activeTab === "loans" ? <LoanManagement /> : <InvestmentManagement />}
    </div>
  );
}
