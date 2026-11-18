import type { Metadata } from 'next';
import { ThemeScript, TooltipProvider } from '@dff-oo/omnia-ui';
import '@dff-oo/omnia-ui/tokens.css';
import '@dff-oo/omnia-ui/globals.css';

export const metadata: Metadata = {
  title: 'DFFOO field editor',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-omnia-theme="dark" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <div className="omnia-root">
          <TooltipProvider>{children}</TooltipProvider>
        </div>
      </body>
    </html>
  );
}
