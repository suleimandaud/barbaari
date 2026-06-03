import { useEffect } from "react";

export function usePageTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} | Barbaari` : "Barbaari";
    return () => { document.title = prev; };
  }, [title]);
}
