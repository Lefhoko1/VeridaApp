// What the AI service read from a receipt. Every value is a suggestion for the user to check:
// nothing is saved until they confirm the form (FR-G20).
export type ReceiptReading = {
  occurredOn: string | null;
  total: number | null;
  description: string | null;
  vendor: string | null;
  category: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
};

export type ReceiptKind = 'sale' | 'expense';

// A port: records needs a receipt read, and the composition root connects it to the AI service.
export interface ReceiptReader {
  read(request: { businessId: string; path: string; kind: ReceiptKind; categories: string[] }): Promise<ReceiptReading>;
}
