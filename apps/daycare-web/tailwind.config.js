export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#2A7B88",
        secondary: "#FF9E80",
        tertiary: "#FFD54F",
        neutral: "#455A64",
        calm: "#EEF8FB",
        card: "#E4F4F8"
      },
      fontFamily: {
        headline: ["Quicksand", "sans-serif"],
        body: ["Plus Jakarta Sans", "sans-serif"]
      },
      boxShadow: {
        soft: "0 16px 40px rgba(42, 123, 136, 0.12)"
      }
    }
  },
  plugins: []
};
