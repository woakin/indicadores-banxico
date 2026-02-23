/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./*.html", "./*.js"],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                "primary": "#38BDF8",
                "primary-alt": "#13386fff",
                "danger": "#C93A56",
                "success": "#1DCCA3",
                "background-dark": "#0F172A",
                "card-dark": "#151E31",
                "card-border": "rgba(255, 255, 255, 0.05)",
                "input-dark": "rgba(0, 0, 0, 0.15)",
                "text-muted": "#93A2B7",
            },
            fontFamily: {
                "display": ["Inter", "sans-serif"]
            },
            animation: {
                'spin-slow': 'spin 3s linear infinite',
            }
        },
    },
    plugins: [],
}
