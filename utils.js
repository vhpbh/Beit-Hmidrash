    const JOKES = [
        "נראה שהסיסמה שלך יצאה לשבתון... נסה שוב אחרי הבדלה.",
        "אפילו משה רבנו היה צריך לבקש את הלוחות פעמיים. נסה שוב!",
        "הסיסמה לא נכונה. אולי שכחת אותה בבית המדרש?",
        "טעות לעולם חוזרת, וגם סיסמה שגויה. נסה שוב!"
    ];

    // זיהוי מצב אופליין
window.addEventListener('offline', () => {
    const overlay = document.createElement('div');
    overlay.id = 'offline-overlay';
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); color:white; display:flex; flex-direction:column; justify-content:center; align-items:center; z-index:99999; text-align:center;';
    overlay.innerHTML = '<h1 style="font-size:4rem;">📶</h1><h2>אין אינטרנט?</h2><p style="font-size:1.2rem;">זה הזמן המצוין לחזור על תלמודך בעל פה!<br>(או לבדוק את הראוטר...)</p>';
    document.body.appendChild(overlay);
});
window.addEventListener('online', () => {
    const el = document.getElementById('offline-overlay');
    if(el) el.remove();
    showToast("האינטרנט חזר! ברוך מחיה המתים ;)", "success");
});
