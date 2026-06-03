import { useEffect } from "react";

export function usePageTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} | Barbaari Admin` : "Barbaari Admin";
    return () => { document.title = prev; };
  }, [title]);
}
