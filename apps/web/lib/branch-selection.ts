"use client";

const SELECTED_BRANCH_KEY = "pocket:selected-branch-id";

export function getSelectedBranchId() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(SELECTED_BRANCH_KEY) ?? "";
}

export function setSelectedBranchId(branchId: string) {
  if (typeof window === "undefined") {
    return;
  }

  if (branchId) {
    window.localStorage.setItem(SELECTED_BRANCH_KEY, branchId);
  } else {
    window.localStorage.removeItem(SELECTED_BRANCH_KEY);
  }
}

export function ensureSelectedBranchId(accessibleBranchIds: string[], fallbackBranchId?: string | null) {
  const current = getSelectedBranchId();
  if (current && accessibleBranchIds.includes(current)) {
    return current;
  }

  const next = (fallbackBranchId && accessibleBranchIds.includes(fallbackBranchId) ? fallbackBranchId : accessibleBranchIds[0]) ?? "";
  setSelectedBranchId(next);
  return next;
}

