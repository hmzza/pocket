import { Suspense } from "react";

import { PosTerminal } from "@/components/pos/pos-terminal";

export default function PosPage() {
  return (
    <Suspense fallback={null}>
      <PosTerminal />
    </Suspense>
  );
}
