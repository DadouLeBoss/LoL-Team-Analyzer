import "./globals.css";

export const metadata = {
  title: "LoL Team Analyzer",
  description: "Analyse d'équipe : pools de champions, flex, bans recommandés",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
