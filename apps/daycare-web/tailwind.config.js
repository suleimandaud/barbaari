export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // design/redesign-2026/tokens.md
        brand: "#2F8F98",
        accent: { DEFAULT: "#237680", 600: "#1E6A73", 700: "#1A5E66", 800: "#174F55", 100: "#E7F4F5", 200: "#CBE7EA", 300: "#9FD0D5", 400: "#5FB0B8" },
        ink: "#173236",
        paper: "#F8F6F1",
        cream: "#EFECE4",
        rule: "#D9E0DF",
        slate: { 700: "#53656A", 800: "#3A4B4E" }
      },
      fontFamily: {
        serif: ["\"Source Serif 4\"", "Georgia", "serif"]
      },
      borderRadius: { sm: "2px", DEFAULT: "2px", lg: "4px" },
      boxShadow: {
        sm: "0 1px 2px rgba(45,43,43,.14)",
        md: "0 3px 10px rgba(45,43,43,.16)",
        lg: "0 12px 32px rgba(45,43,43,.22)"
      }
    }
  },
  plugins: []
};
