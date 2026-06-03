import { useCallback, useEffect, useState } from "react";
import { getStoredUser, mobileAreaForRole, restoreSession, type MobileUser } from "../services/auth";

export function useMobileSession() {
  const [user, setUser] = useState<MobileUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const cached = await getStoredUser();
    if (cached) setUser(cached);
    const restored = await restoreSession();
    setUser(restored);
    setLoading(false);
    return restored;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { user, area: mobileAreaForRole(user?.role), loading, refresh };
}
