/** Einheitliches Rückgabeformat aller Server Actions, die mit `useActionState` verwendet werden. */
export interface ActionState {
  status: "idle" | "success" | "error";
  message?: string;
  /** Feldbezogene Fehlermeldungen, Schlüssel = Feldname. */
  fieldErrors?: Record<string, string[]>;
  /** Optionale Nutzdaten (z. B. neu erzeugte Recovery-Codes). */
  data?: Record<string, unknown>;
}

export const IDLE_STATE: ActionState = { status: "idle" };

export function errorState(message: string, fieldErrors?: Record<string, string[]>): ActionState {
  return { status: "error", message, fieldErrors };
}

export function successState(message: string, data?: Record<string, unknown>): ActionState {
  return { status: "success", message, data };
}

/** Wandelt ein Zod-Fehlerobjekt in das ActionState-Format. */
export function fromZodError(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }): ActionState {
  const flattened = error.flatten().fieldErrors;
  const fieldErrors: Record<string, string[]> = {};

  for (const [key, value] of Object.entries(flattened)) {
    if (value && value.length > 0) fieldErrors[key] = value;
  }

  return {
    status: "error",
    message: "Bitte prüfe deine Eingaben.",
    fieldErrors,
  };
}
