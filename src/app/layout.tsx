import type { Metadata } from 'next';
import { ThemeScript, TooltipProvider } from '@dffoogg/omnia-ui';
import '@dffoogg/omnia-ui/tokens.css';
import '@dffoogg/omnia-ui/globals.css';

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
