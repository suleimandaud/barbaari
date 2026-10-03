import { useOutletContext } from "react-router-dom";

/** What AppLayout already loaded from /auth/me, shared so pages don't re-request it. */
export type ShellContext = {
  user: any | null;
  organization: any | null;
  familyChildCare: boolean;
};

export function useShell(): ShellContext {
  return useOutletContext<ShellContext | undefined>() ?? { user: null, organization: null, familyChildCare: false };
}
