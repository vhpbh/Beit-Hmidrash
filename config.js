const SEARCH_TAGS = [
    { id: 'users', name: 'משתמשים', screens: ['screen-leaderboard', 'screen-chavrutas'] },
    { id: 'my-goals', name: 'המסכתות שלי', screens: ['screen-dashboard', 'screen-archive'] },
    { id: 'my-chavrutas', name: 'החברותות שלי', screens: ['screen-chavrutas'] },
    { id: 'chats', name: 'צ\'אטים', screens: [] }, // Special handling for open chat windows
    { id: 'books', name: 'ספרים', screens: ['screen-add'] } // Search the library
];

// הגדרת מסלולי מנוי
const SUBSCRIPTION_TIERS = [
    { price: 10, name: "תומך כשר", level: 1, color: "#d97706" },
    { price: 25, name: "תומך כשר מהדרין", level: 2, color: "#d97706" },
    { price: 50, name: "תומך תורה", level: 3, color: "#d97706" },
    { price: 75, name: "גביר", level: 4, color: "#d97706" },
    { price: 100, name: "זבולון מתחיל", level: 5, color: "#d97706" },
    { price: 150, name: "זבולון מתקדם", level: 6, color: "#d97706" },
    { price: 250, name: "זבולון אינטנסיבי", level: 7, color: "#d97706" }
];

// מסלולי תרומה חד פעמית
const ONE_TIME_TIERS = [
    { price: 18, name: "חי שקלים", level: 0, color: "#e5e7eb" },
    { price: 36, name: "פעמיים חי", level: 0, color: "#d1d5db" },
    { price: 72, name: "עולם חסד", level: 0, color: "#9ca3af" },
    { price: 100, name: "מאה ברכות", level: 0, color: "#fcd34d" },
    { price: 180, name: "עשרת המונים", level: 0, color: "#60a5fa" },
    { price: 360, name: "פרנס היום", level: 0, color: "#818cf8" },
    { price: 500, name: "נדיב לב", level: 0, color: "#a78bfa" },
    { price: 1000, name: "עמוד התווך", level: 0, color: "#f472b6" }
];