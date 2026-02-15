const BOOKS_DB = [
    // === תלמוד בבלי (יחידות = עמודים = דפים * 2) ===
    { name: "ברכות", category: "תלמוד בבלי", units: 126 }, // 63 דפים
    { name: "שבת", category: "תלמוד בבלי", units: 314 }, // 157 דפים
    { name: "עירובין", category: "תלמוד בבלי", units: 210 }, // 105 דפים
    { name: "פסחים", category: "תלמוד בבלי", units: 242 }, // 121 דפים
    { name: "שקלים", category: "תלמוד בבלי", units: 44 }, // 22 דפים
    { name: "יומא", category: "תלמוד בבלי", units: 176 }, // 88 דפים
    { name: "סוכה", category: "תלמוד בבלי", units: 112 }, // 56 דפים
    { name: "ביצה", category: "תלמוד בבלי", units: 80 }, // 40 דפים
    { name: "ראש השנה", category: "תלמוד בבלי", units: 70 }, // 35 דפים
    { name: "תענית", category: "תלמוד בבלי", units: 62 }, // 31 דפים
    { name: "מגילה", category: "תלמוד בבלי", units: 64 }, // 32 דפים
    { name: "מועד קטן", category: "תלמוד בבלי", units: 58 }, // 29 דפים
    { name: "חגיגה", category: "תלמוד בבלי", units: 54 }, // 27 דפים
    { name: "יבמות", category: "תלמוד בבלי", units: 244 }, // 122 דפים
    { name: "כתובות", category: "תלמוד בבלי", units: 224 }, // 112 דפים
    { name: "נדרים", category: "תלמוד בבלי", units: 182 }, // 91 דפים
    { name: "נזיר", category: "תלמוד בבלי", units: 132 }, // 66 דפים
    { name: "סוטה", category: "תלמוד בבלי", units: 98 }, // 49 דפים
    { name: "גיטין", category: "תלמוד בבלי", units: 180 }, // 90 דפים
    { name: "קידושין", category: "תלמוד בבלי", units: 164 }, // 82 דפים
    { name: "בבא קמא", category: "תלמוד בבלי", units: 238 }, // 119 דפים
    { name: "בבא מציעא", category: "תלמוד בבלי", units: 238 }, // 119 דפים
    { name: "בבא בתרא", category: "תלמוד בבלי", units: 352 }, // 176 דפים
    { name: "סנהדרין", category: "תלמוד בבלי", units: 226 }, // 113 דפים
    { name: "מכות", category: "תלמוד בבלי", units: 48 }, // 24 דפים
    { name: "שבועות", category: "תלמוד בבלי", units: 98 }, // 49 דפים
    { name: "עבודה זרה", category: "תלמוד בבלי", units: 152 }, // 76 דפים
    { name: "הוריות", category: "תלמוד בבלי", units: 28 }, // 14 דפים
    { name: "זבחים", category: "תלמוד בבלי", units: 240 }, // 120 דפים
    { name: "מנחות", category: "תלמוד בבלי", units: 220 }, // 110 דפים
    { name: "חולין", category: "תלמוד בבלי", units: 284 }, // 142 דפים
    { name: "בכורות", category: "תלמוד בבלי", units: 122 }, // 61 דפים
    { name: "ערכין", category: "תלמוד בבלי", units: 68 }, // 34 דפים
    { name: "תמורה", category: "תלמוד בבלי", units: 68 }, // 34 דפים
    { name: "כריתות", category: "תלמוד בבלי", units: 56 }, // 28 דפים
    { name: "מעילה", category: "תלמוד בבלי", units: 44 }, // 22 דפים
    { name: "תמיד", category: "תלמוד בבלי", units: 66 }, // 33 דפים
    { name: "מידות", category: "תלמוד בבלי", units: 74 }, // 37 דפים
    { name: "קינים", category: "תלמוד בבלי", units: 8 }, // 4 דפים
    { name: "נידה", category: "תלמוד בבלי", units: 146 }, // 73 דפים

    // === תנ"ך (יחידות = פרקים) ===
    { name: "בראשית", category: "תנ\"ך", units: 50 },
    { name: "שמות", category: "תנ\"ך", units: 40 },
    { name: "ויקרא", category: "תנ\"ך", units: 27 },
    { name: "במדבר", category: "תנ\"ך", units: 36 },
    { name: "דברים", category: "תנ\"ך", units: 34 },
    { name: "יהושע", category: "תנ\"ך", units: 24 },
    { name: "שופטים", category: "תנ\"ך", units: 21 },
    { name: "שמואל א", category: "תנ\"ך", units: 31 },
    { name: "שמואל ב", category: "תנ\"ך", units: 24 },
    { name: "מלכים א", category: "תנ\"ך", units: 22 },
    { name: "מלכים ב", category: "תנ\"ך", units: 25 },
    { name: "ישעיהו", category: "תנ\"ך", units: 66 },
    { name: "ירמיהו", category: "תנ\"ך", units: 52 },
    { name: "יחזקאל", category: "תנ\"ך", units: 48 },
    { name: "הושע", category: "תנ\"ך", units: 14 },
    { name: "יואל", category: "תנ\"ך", units: 4 },
    { name: "עמוס", category: "תנ\"ך", units: 9 },
    { name: "עובדיה", category: "תנ\"ך", units: 1 },
    { name: "יונה", category: "תנ\"ך", units: 4 },
    { name: "מיכה", category: "תנ\"ך", units: 7 },
    { name: "נחום", category: "תנ\"ך", units: 3 },
    { name: "חבקוק", category: "תנ\"ך", units: 3 },
    { name: "צפניה", category: "תנ\"ך", units: 3 },
    { name: "חגי", category: "תנ\"ך", units: 2 },
    { name: "זכריה", category: "תנ\"ך", units: 14 },
    { name: "מלאכי", category: "תנ\"ך", units: 3 },
    { name: "תהילים", category: "תנ\"ך", units: 150 },
    { name: "משלי", category: "תנ\"ך", units: 31 },
    { name: "איוב", category: "תנ\"ך", units: 42 },
    { name: "שיר השירים", category: "תנ\"ך", units: 8 },
    { name: "רות", category: "תנ\"ך", units: 4 },
    { name: "איכה", category: "תנ\"ך", units: 5 },
    { name: "קהלת", category: "תנ\"ך", units: 12 },
    { name: "אסתר", category: "תנ\"ך", units: 10 },
    { name: "דניאל", category: "תנ\"ך", units: 12 },
    { name: "עזרא", category: "תנ\"ך", units: 10 },
    { name: "נחמיה", category: "תנ\"ך", units: 13 },
    { name: "דברי הימים א", category: "תנ\"ך", units: 29 },
    { name: "דברי הימים ב", category: "תנ\"ך", units: 36 },

    // === משנה (יחידות = פרקים) ===
    { name: "ברכות (משנה)", category: "משנה", units: 9 },
    { name: "פאה", category: "משנה", units: 8 },
    { name: "דמאי", category: "משנה", units: 7 },
    { name: "כלאיים", category: "משנה", units: 9 },
    { name: "שביעית", category: "משנה", units: 10 },
    { name: "תרומות", category: "משנה", units: 11 },
    { name: "מעשרות", category: "משנה", units: 5 },
    { name: "מעשר שני", category: "משנה", units: 5 },
    { name: "חלה", category: "משנה", units: 4 },
    { name: "ערלה", category: "משנה", units: 3 },
    { name: "ביכורים", category: "משנה", units: 3 },
    { name: "שבת (משנה)", category: "משנה", units: 24 },
    { name: "עירובין (משנה)", category: "משנה", units: 10 },
    { name: "פסחים (משנה)", category: "משנה", units: 10 },
    { name: "שקלים (משנה)", category: "משנה", units: 8 },
    { name: "יומא (משנה)", category: "משנה", units: 8 },
    { name: "סוכה (משנה)", category: "משנה", units: 5 },
    { name: "ביצה (משנה)", category: "משנה", units: 5 },
    { name: "ראש השנה (משנה)", category: "משנה", units: 4 },
    { name: "תענית (משנה)", category: "משנה", units: 4 },
    { name: "מגילה (משנה)", category: "משנה", units: 4 },
    { name: "מועד קטן (משנה)", category: "משנה", units: 3 },
    { name: "חגיגה (משנה)", category: "משנה", units: 3 },
    { name: "יבמות (משנה)", category: "משנה", units: 16 },
    { name: "כתובות (משנה)", category: "משנה", units: 13 },
    { name: "נדרים (משנה)", category: "משנה", units: 11 },
    { name: "נזיר (משנה)", category: "משנה", units: 9 },
    { name: "סוטה (משנה)", category: "משנה", units: 9 },
    { name: "גיטין (משנה)", category: "משנה", units: 9 },
    { name: "קידושין (משנה)", category: "משנה", units: 4 },
    { name: "בבא קמא (משנה)", category: "משנה", units: 10 },
    { name: "בבא מציעא (משנה)", category: "משנה", units: 10 },
    { name: "בבא בתרא (משנה)", category: "משנה", units: 10 },
    { name: "סנהדרין (משנה)", category: "משנה", units: 11 },
    { name: "מכות (משנה)", category: "משנה", units: 3 },
    { name: "שבועות (משנה)", category: "משנה", units: 8 },
    { name: "עדיות", category: "משנה", units: 8 },
    { name: "עבודה זרה (משנה)", category: "משנה", units: 5 },
    { name: "אבות", category: "משנה", units: 6 },
    { name: "הוריות (משנה)", category: "משנה", units: 3 },
    { name: "זבחים (משנה)", category: "משנה", units: 14 },
    { name: "מנחות (משנה)", category: "משנה", units: 13 },
    { name: "חולין (משנה)", category: "משנה", units: 12 },
    { name: "בכורות (משנה)", category: "משנה", units: 9 },
    { name: "ערכין (משנה)", category: "משנה", units: 9 },
    { name: "תמורה (משנה)", category: "משנה", units: 7 },
    { name: "כריתות (משנה)", category: "משנה", units: 6 },
    { name: "מעילה (משנה)", category: "משנה", units: 6 },
    { name: "תמיד (משנה)", category: "משנה", units: 7 },
    { name: "מידות (משנה)", category: "משנה", units: 5 },
    { name: "קינים (משנה)", category: "משנה", units: 3 },
    { name: "כלים", category: "משנה", units: 30 },
    { name: "אוהלות", category: "משנה", units: 18 },
    { name: "נגעים", category: "משנה", units: 14 },
    { name: "פרה", category: "משנה", units: 12 },
    { name: "טהרות", category: "משנה", units: 10 },
    { name: "מקואות", category: "משנה", units: 10 },
    { name: "נידה (משנה)", category: "משנה", units: 10 },
    { name: "מכשירין", category: "משנה", units: 6 },
    { name: "זבים", category: "משנה", units: 5 },
    { name: "טבול יום", category: "משנה", units: 4 },
    { name: "ידיים", category: "משנה", units: 4 },
    { name: "עוקצין", category: "משנה", units: 3 },

    // === הלכה ===
    { name: "משנה ברורה", category: "הלכה", units: 697 },
    { name: "קיצור שולחן ערוך", category: "הלכה", units: 221 },
    { name: "שולחן ערוך - אורח חיים", category: "הלכה", units: 697 },
    { name: "שולחן ערוך - יורה דעה", category: "הלכה", units: 403 },
    { name: "שולחן ערוך - אבן העזר", category: "הלכה", units: 178 },
    { name: "שולחן ערוך - חושן משפט", category: "הלכה", units: 427 },
    { name: "חיי אדם", category: "הלכה", units: 224 },
    { name: "חזון איש", category: "הלכה", units: 100 },

    // === מוסר ומחשבה ===
    { name: "מסילת ישרים", category: "מוסר ומחשבה", units: 26 },
    { name: "חובת הלבבות", category: "מוסר ומחשבה", units: 10 },
    { name: "שערי תשובה", category: "מוסר ומחשבה", units: 4 },
    { name: "אורחות צדיקים", category: "מוסר ומחשבה", units: 28 },
    { name: "תומר דבורה", category: "מוסר ומחשבה", units: 10 },
    { name: "נפש החיים", category: "מוסר ומחשבה", units: 4 },
    { name: "מורה נבוכים", category: "מוסר ומחשבה", units: 178 },
    { name: "הכוזרי", category: "מוסר ומחשבה", units: 5 },
];
