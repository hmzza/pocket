export {};

declare global {
  interface Window {
    pocketDesktop?: {
      getAppInfo: () => Promise<{ mode: "pos" | "admin"; productName: string; version: string }>;
      getPrinters: () => Promise<{
        selectedPrinter: string;
        printers: Array<{ name: string; displayName: string; isDefault: boolean; status: number }>;
      }>;
      setPrinter: (printerName: string) => Promise<{ selectedPrinter: string }>;
      printReceipt: (request: { orderId: string; copy: "all" | "chef" | "store" | "store-chef" }) => Promise<{ success: true }>;
      printCurrentReceipt: () => Promise<{ success: true }>;
      startDeliveryAlarm: () => Promise<{ playing: boolean }>;
      stopDeliveryAlarm: () => Promise<{ playing: boolean }>;
      receiptReady: () => void;
    };
  }
}
