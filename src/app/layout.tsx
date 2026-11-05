import type { Metadata } from 'next';
import './globals.css';
import { ChatbotWidget } from '@/components/chatbot/ChatbotWidget';
import { ThemeProvider } from '@/components/theme/ThemeProvider';

export const metadata: Metadata = {
  title: 'BANTUIN | Platform Servis Elektronik Rumah Tangga Terpadu',
  description: 'Pusat layanan perbaikan peralatan elektronik rumah tangga terpercaya dengan mitra teknisi tersertifikasi.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="h-full" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Zero-Flash Theme Initialization Script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('bantuin-theme');
                  var theme = stored || 'system';
                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var resolved = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
                  document.documentElement.classList.add(resolved);
                  document.documentElement.classList.remove(resolved === 'dark' ? 'light' : 'dark');
                  document.documentElement.setAttribute('data-theme', resolved);
                } catch (e) {
                  document.documentElement.classList.add('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body className="h-full bg-[#11120D] text-[#FFFBF4] font-['Plus_Jakarta_Sans',sans-serif] antialiased selection:bg-[#D8CFBC]/25 selection:text-[#FFFBF4] transition-colors duration-200">
        <ThemeProvider>
          {children}
          <ChatbotWidget />
        </ThemeProvider>
      </body>
    </html>
  );
}
