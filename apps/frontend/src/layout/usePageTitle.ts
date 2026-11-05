import { useEffect } from 'react';

const APP = 'Healthcare Workforce Planning';

/**
 * Sets the browser tab title for the page (WCAG 2.4.2). Every page had the same title before (U-01), so tabs,
 * history and screen readers could not tell the pages apart.
 */
export function usePageTitle(title: string | null) {
  useEffect(() => {
    document.title = title ? `${title} | ${APP}` : APP;
  }, [title]);
}
