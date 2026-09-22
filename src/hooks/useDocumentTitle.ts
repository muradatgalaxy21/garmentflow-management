import { useEffect } from "react";

/**
 * Hook to set the browser tab title dynamically.
 *
 * @param title - The page title string. If empty or null, resets to default.
 * @param retainOnUnmount - Whether to keep the title when component unmounts. Default: false.
 */
export function useDocumentTitle(title?: string, retainOnUnmount: boolean = false) {
  useEffect(() => {
    if (!title) return;

    const previousTitle = document.title;
    document.title = title;

    return () => {
      if (!retainOnUnmount && previousTitle) {
        document.title = previousTitle;
      }
    };
  }, [title, retainOnUnmount]);
}

export default useDocumentTitle;
