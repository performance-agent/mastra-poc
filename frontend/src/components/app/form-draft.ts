import { createContext } from "react";
export const FormDraftContext = createContext<{
  register: (id: string, upload: (() => Promise<void>) | null) => void;
} | null>(null);
