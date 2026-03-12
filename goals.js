let userGoals = [];

function incDailyProgress(goalId, amount) {
    const current = getDailyProgress(goalId);
    const today = new Date().toLocaleDateString('en-GB');
    localStorage.setItem('daily_track_' + goalId, JSON.stringify({ date: today, count: current + amount }));
}

function renderGoals() {
    const list = document.getElementById('goalsList');
    const tasksList = document.getElementById('dailyTasksList');
    const archiveList = document.getElementById('archiveList');

    if (!list) return;

    list.innerHTML = '';
    if (tasksList) tasksList.innerHTML = '';
    if (archiveList) archiveList.innerHTML = '';

    let hasTasks = false;
    let totalLearned = 0;

    // בדיקת ריקנות
    const activeGoals = userGoals.filter(g => g.status === 'active');
    if (activeGoals.length === 0) {
        // Empty state handled by the add button at the bottom
    }

    userGoals.forEach(goal => {
        // חישוב אחוז התקדמות
        const percent = Math.min(100, Math.round((goal.currentUnit / goal.totalUnits) * 100));
        totalLearned += goal.currentUnit;

        // בדיקה אם יש חברותא לספר זה
        const connection = chavrutaConnections.find(c => c.book === goal.bookName && c.email);
        const partner = connection ? globalUsersData.find(u => u.email === connection.email) : null;
        const partnerName = partner ? partner.name : (connection ? connection.email : '');

        if (goal.status === 'active') {
            // יצירת כרטיס לימוד פעיל
            const div = document.createElement('div');
            div.id = `goal-card-${goal.id}`; // הוספת ID לזיהוי ייחודי
            div.className = 'glass rounded-super p-6 transition-all hover:shadow-2xl hover:translate-y-[-2px] border border-white/50 dark:border-slate-700/40 mb-4';

            if (window.newGoalId === goal.id.toString()) {
                // div.classList.add('new-goal-highlight'); // Optional: adapt to new style
                if (window.isNewGoalAnimation) {
                    // div.classList.add('new-goal-animation');
                    window.isNewGoalAnimation = false; // איפוס
                }
            }

            // אנימציה אם הושלם הרגע
            if (window.justCompletedDailyGoal === goal.id) {
                // div.classList.add('daily-goal-reached');
            }

            div.innerHTML = `
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div class="flex-1">
                    <div class="flex items-center gap-4 mb-2">
                        <div class="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xl">
                            <i class="fas fa-book"></i>
                        </div>
                        <div>
                            <h3 class="text-lg font-bold flex items-center gap-2">
                                ${goal.bookName}
                                ${connection ? `<i class="fas fa-user-friends" style="color: var(--success); font-size: 1rem;" title="בחברותא עם ${partnerName}"></i>` : ''}
                            </h3>
                            <p class="text-sm text-slate-500 dark:text-slate-400">${unitToDafString(goal)}</p>
                        </div>
                    </div>
                    <div class="mt-4">
                        <div class="flex justify-between text-xs mb-2 px-1">
                            <span class="text-slate-400">${goal.totalUnits - goal.currentUnit} עמודים לסיום</span>
                            <span class="font-bold text-primary">${percent}%</span>
                        </div>
                        <div class="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div class="h-full progress-gradient rounded-full" style="width: ${percent}%"></div>
                        </div>
                    </div>
                </div>
                <div class="flex items-center justify-between md:justify-end gap-3">
                    <div class="flex items-center gap-2">
                        <button class="w-10 h-10 rounded-full glass hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center text-slate-500 dark:text-slate-400" onclick="deleteGoal('${goal.id}')" title="מחק">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                        <button class="w-10 h-10 rounded-full glass hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center text-slate-500 dark:text-slate-400" onclick="openNotes('${goal.id}')" title="הערות">
                            <i class="fas fa-sticky-note"></i>
                        </button>
                        <button class="w-10 h-10 rounded-full glass hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center text-slate-500 dark:text-slate-400" onclick="openBookChat('${goal.bookName}')" title="צ'אט">
                            <i class="fas fa-comment"></i>
                        </button>
                        <button class="w-10 h-10 rounded-full glass hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center text-slate-500 dark:text-slate-400" ${connection ? 'disabled' : ''} onclick="openChavrutaSearch('${goal.bookName}')" title="${connection ? 'כבר לומד בחברותא' : 'מצא חברותא'}">
                            <i class="fas fa-user-plus" ${connection ? 'style="color: #94a3b8;"' : ''}></i>
                        </button>
                    </div>
                    <div class="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl">
                        <button class="w-10 h-10 rounded-xl bg-white dark:bg-slate-700 shadow-sm flex items-center justify-center hover:scale-110 active:scale-95 transition-all text-slate-600 dark:text-slate-300" onclick="updateProgress(${goal.id}, -1)">
                            <i class="fas fa-minus"></i>
                        </button>
                        <button class="w-10 h-10 rounded-xl bg-amber-500 text-white shadow-lg shadow-amber-500/30 flex items-center justify-center hover:scale-110 active:scale-95 transition-all" onclick="updateProgress(${goal.id}, 1)">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                </div>
            </div>`;
            list.appendChild(div);

            // חישוב יעד יומי (אם הוגדר תאריך יעד)
            if (goal.targetDate && tasksList) {
                const diffTime = new Date(goal.targetDate) - new Date();
                const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                const unitsLeft = goal.totalUnits - goal.currentUnit;
                if (unitsLeft > 0 && diffDays > 0) {
                    hasTasks = true;
                    const dailyTarget = (unitsLeft / diffDays).toFixed(1);

                    // חישוב התקדמות יומית
                    const doneToday = getDailyProgress(goal.id);
                    const dailyPercent = Math.min(100, (doneToday / Math.ceil(dailyTarget)) * 100);
                    const isDailyDone = doneToday >= Math.ceil(dailyTarget);

                    const taskDiv = document.createElement('div');
                    taskDiv.id = `daily-task-${goal.id}`; // זיהוי ייחודי לעדכון
                    taskDiv.className = 'task-row';

                    if (window.justCompletedDailyGoal === goal.id) {
                        taskDiv.classList.add('daily-goal-reached');
                    }

                    let statusHtml = `<span class="task-highlight">יעד יומי: ${dailyTarget}</span>`;
                    if (isDailyDone) {
                        statusHtml = `<span style="color:#16a34a; font-weight:bold; font-size:0.9rem;"><i class="fas fa-check"></i> הושלם</span>`;
                    }

                    taskDiv.innerHTML = `<div><strong>${goal.bookName}</strong></div><div style="text-align:left;">${statusHtml}
                    <div class="daily-progress-bg"><div class="daily-progress-fill" style="width:${dailyPercent}%; background:${isDailyDone ? '#16a34a' : 'var(--accent)'}"></div></div></div>`;
                    tasksList.appendChild(taskDiv);
                }
            }
        } else {
            // הצגת הלימוד בארכיון
            if (archiveList) {
                const archiveDiv = document.createElement('div');
                archiveDiv.className = 'goal-item';
                archiveDiv.style.borderTopColor = 'var(--success)';
                archiveDiv.innerHTML = `
                <div class="goal-header">
                    <span class="goal-title">${goal.bookName}</span>
                    <span style="color:var(--success); font-weight:bold;">הושלם! <i class="fas fa-check"></i></span>
                </div>
                <div class="progress-container"><div class="progress-bar" style="width: 100%; background: var(--success);"></div></div>`;
                archiveList.appendChild(archiveDiv);
            }
        }
    });

    // עדכון תצוגת הדרגות והסטטיסטיקה
    updateRankProgressBar(totalLearned);
    document.getElementById('dailyTasksContainer').style.display = hasTasks ? 'block' : 'none';

    const activeBooksCount = userGoals.filter(g => g.status === 'active').length;
    const completedBooksCount = userGoals.filter(g => g.status === 'completed').length;

    const booksEl = document.getElementById('stat-books');
    const pagesEl = document.getElementById('stat-pages');
    const completedEl = document.getElementById('stat-completed');

    if (booksEl && pagesEl && completedEl && typeof animateValue === 'function') {
        const oldBooks = parseInt(booksEl.innerText.replace(/,/g, '')) || 0;
        const oldPages = parseInt(pagesEl.innerText.replace(/,/g, '')) || 0;
        const oldCompleted = parseInt(completedEl.innerText.replace(/,/g, '')) || 0;

        animateValue(booksEl, oldBooks, activeBooksCount, 1000);
        animateValue(pagesEl, oldPages, totalLearned, 1000);
        animateValue(completedEl, oldCompleted, completedBooksCount, 1000);
    } else {
        if (booksEl) booksEl.innerText = activeBooksCount;
        if (pagesEl) pagesEl.innerText = totalLearned;
        if (completedEl) completedEl.innerText = completedBooksCount;
    }

    // שמירת סטטיסטיקה למטמון לטעינה מהירה בפעם הבאה
    const stats = { books: activeBooksCount, pages: totalLearned, completed: completedBooksCount };
    localStorage.setItem('torahApp_stats', JSON.stringify(stats));

    // Rating updated elsewhere

    // איפוס דגלים
    window.justCompletedDailyGoal = null;
    window.newGoalId = null;
}

async function createGoal(name, total, targetDate, dedication) {
    if (!requireAuth()) return;
    // 1. יצירת האובייקט
    const newGoal = {
        id: Date.now().toString(),
        bookName: name,
        totalUnits: total,
        currentUnit: 0,
        targetDate: targetDate || '',
        status: 'active',
        dedication: dedication || ''
    };

    // 2. הוספה לרשימה המקומית ורענון
    userGoals.unshift(newGoal); // הוספה לראש הרשימה
    saveGoals();

    window.newGoalId = newGoal.id;
    window.isNewGoalAnimation = true;

    renderGoals(); // חשוב מאוד כדי שיופיע מיד במסך!

    // 3. מעבר אוטומטי ללוח הבקרה כדי לראות את התוצאה
    switchScreen('dashboard', document.querySelectorAll('.nav-item')[0]); // מעבר לבית (אינדקס 0)

    // 4. שמירה ב-Supabase
    try {
        if (typeof supabaseClient !== 'undefined' && currentUser) {
            await supabaseClient.from('user_goals').insert([{
                id: newGoal.id,
                user_email: currentUser.email,
                book_name: name,
                total_units: total,
                current_unit: 0,
                status: 'active',
                target_date: targetDate || null
            }]);

            // 5. חיבור אוטומטי לצ'אט הציבורי של הספר
            openChat('book:' + name, name);
            // Ensure it appears in the list by checking/adding a local draft or state if needed
            // (The openChat function handles the window, but to make it "stick" in the list without messages, 
            // we rely on the user sending a message or the system. 
            // For now, opening the window is the "connection" action requested.)
        }
    } catch (e) {
        console.error("שגיאה בסנכרון ענן, אך נשמר מקומית:", e);
    }
} async function joinCycle(cycleType) {
    const cycles = { 'daf-yomi': ["דף היומי", 2711], 'mishnah': ["משנה יומית", 4192], 'rambam': ["רמב\"ם יומי", 1000], 'halacha': ["הלכה יומית", 1000] };
    const [name, units] = cycles[cycleType];
    if (!requireAuth()) return;

    if (userGoals.some(g => g.bookName === name && g.status === 'active')) {
        await customAlert("אתה כבר רשום למסלול לימוד זה.");
        return;
    }
    await createGoal(name, units, null, "מחזור לימוד קבוע", "");
    showToast("הצטרפת בהצלחה!", "success");
}





async function addNewGoal() {
    if (!requireAuth()) return;
    // זיהוי האלמנטים במסך
    const bookSelectEl = document.getElementById('bookSelect');
    const customNameEl = document.getElementById('customNameInput');
    const customAmountEl = document.getElementById('customAmountInput');
    // const sefariaInput = document.getElementById('sefariaSearchInput'); // Removed

    const dateEl = document.getElementById('targetDateInput');
    const dedicationEl = document.getElementById('dedicationInput');
    const quickTypeEl = document.getElementById('quickType'); // למקרה של הוספה מהירה
    const quickAmountEl = document.getElementById('quickAmount');

    let bookName = "";
    let totalUnits = 0;
    let targetDate = "";

    // בדיקה: האם זו הוספה מהירה (מהכרטיס העליון) או רגילה?
    if (quickAmountEl && quickAmountEl.value) {
        bookName = quickTypeEl.value;
        totalUnits = parseInt(quickAmountEl.value);
        if (document.getElementById('quickDedication').value) {
            // טיפול בהקדשה מהירה אם צריך
        }
    } else {
        // הוספה רגילה מהטופס הגדול

        if (bookSelectEl && bookSelectEl.value) {
            // בחירה מרשימה קיימת (צריך לפענח את ה-JSON)
            try {
                const bookData = JSON.parse(bookSelectEl.value);
                bookName = bookData.name;
                totalUnits = bookData.units;
            } catch (e) {
                console.error("Error parsing book data", e);
                bookName = bookSelectEl.value;
                // אם אין יחידות, ננסה לחפש שדה אחר או נבקש מהמשתמש (כאן נניח 0 כברירת מחדל אם נכשל)
                totalUnits = 50;
            }
        } else if (customNameEl && customNameEl.value) {
            bookName = customNameEl.value;
            totalUnits = parseInt(customAmountEl.value) || 50;
        }

        if (document.getElementById('paceType').value === 'date') {
            targetDate = dateEl.value;
        }
    }

    if (userGoals.some(g => g.bookName === bookName && g.status === 'active')) {
        await customAlert("אתה כבר רשום למסלול לימוד זה.");
        return;
    }

    // בדיקות תקינות
    if (!bookName || !totalUnits || totalUnits <= 0) {
        await customAlert("נא לוודא שנבחר ספר/הוזן שם וכמות יחידות תקינה");
        return;
    }

    // יצירת האובייקט
    const newGoal = {
        id: Date.now().toString(),
        bookName: bookName,
        totalUnits: totalUnits,
        currentUnit: 0,
        status: 'active',
        startDate: new Date().toISOString(),
        targetDate: targetDate, // הוספנו תאריך יעד
        dedication: dedicationEl ? dedicationEl.value : ""
    };

    // שמירה ועדכון
    userGoals.unshift(newGoal); // הוספה לראש הרשימה
    localStorage.setItem('torahApp_goals', JSON.stringify(userGoals)); // או השם שאתה משתמש בו לשמירה
    saveGoals(); // פונקציית העזר שלך לשמירה

    // סימון להבהוב (לפני הרינדור)
    window.newGoalId = newGoal.id;
    window.isNewGoalAnimation = true; // דגל לאנימציה מיוחדת

    renderGoals(); // רענון המסך

    // איפוס שדות
    if (customNameEl) customNameEl.value = '';
    if (customAmountEl) customAmountEl.value = '';

    if (quickAmountEl) quickAmountEl.value = '';
    showToast("הלימוד נוסף בהצלחה!", "success");

    // מעבר ללוח הבקרה
    switchScreen('dashboard', document.querySelectorAll('.nav-item')[0]); // מעבר לבית (אינדקס 0)

    // שמירה בענן (Supabase)
    try {
        if (typeof supabaseClient !== 'undefined' && currentUser && currentUser.email) {
            await supabaseClient.from('user_goals').insert([{
                id: newGoal.id,
                user_email: currentUser.email,
                book_name: bookName,
                total_units: totalUnits,
                current_unit: 0,
                status: 'active',
                target_date: targetDate || null
            }]);
            // Connect to public chat
            openChat('book:' + bookName, bookName);
        }
    } catch (e) {
        console.log("נשמר מקומית בלבד");
        console.error("שגיאת שמירה בענן:", e); // הדפסת השגיאה לניפוי באגים
    }
}

async function loadGoals() {
    // 1. טעינה מיידית מ-LocalStorage (ללא המתנה לרשת)
    const localGoals = localStorage.getItem('torahApp_goals');
    if (localGoals) {
        userGoals = JSON.parse(localGoals);
        renderGoals(); // רינדור מיידי למסך
    }

    try {
        // ניסיון לטעון מהענן
        const { data: cloudGoals, error } = await supabaseClient
            .from('user_goals')
            .select('*')
            .eq('user_email', currentUser.email);


        // אם יש נתונים מהענן, נעדכן את המידע המקומי ונרנדר מחדש
        if (cloudGoals && !error) {
            // המיזוג והעדכון המורכב יותר מתבצע ב-syncGlobalData
            // כאן רק נדאג שהנתונים המעודכנים ביותר מהענן יהיו זמינים
            // ונרנדר מחדש כדי לשקף אותם
            await syncGlobalData(); // מפעיל את הלוגיקה המלאה של הסנכרון
        }
    } catch (e) {
        console.error("שגיאה בטעינת לימודים:", e);
    }
}

function saveGoals() {
    // שמירה מקומית
    localStorage.setItem('torahApp_goals', JSON.stringify(userGoals));
}

async function deleteGoal(goalId) {
    if (!requireAuth()) return;
    if (!(await customConfirm("האם אתה בטוח שברצונך למחוק את הלימוד הזה?"))) return;

    // 1. מציאת הלימוד כדי לדעת מה למחוק מהענן אחר כך
    const goalToDelete = userGoals.find(g => g.id == goalId);

    // 2. עדכון הרשימה המקומית (סינון החוצה של האידי שנמחק)
    userGoals = userGoals.filter(g => g.id != goalId);

    // 3. שמירה ורענון מסך
    saveGoals();
    renderGoals();

    // 4. מחיקה מהענן (Supabase)
    try {
        if (typeof supabaseClient !== 'undefined' && currentUser && goalToDelete) {
            await supabaseClient
                .from('user_goals')
                .delete()
                .eq('user_email', currentUser.email)
                .eq('book_name', goalToDelete.bookName);

            // מחיקת חברותות קשורות
            await supabaseClient.from('chavruta_requests')
                .delete()
                .or(`sender_email.eq.${currentUser.email},receiver_email.eq.${currentUser.email}`)
                .eq('book_name', goalToDelete.bookName)
                .eq('status', 'approved');
        }
    } catch (e) {
        console.error("נמחק מקומית, שגיאה במחיקה מהענן:", e);
    }
}

function handleScopeChange() {
    const scope = document.getElementById('bookScopeSelect').value;
    const chapterDiv = document.getElementById('chapterSelectDiv');
    const chapterSelect = document.getElementById('chapterSelect');

    if (scope === 'chapter') {
        chapterDiv.style.display = 'block';
        chapterSelect.innerHTML = '';

        if (selectedBookStructure && selectedBookStructure.schema) {
            // ניסיון לזהות מבנה פרקים
            // בדרך כלל nodeType 'JaggedArrayNode'
            // אנו נניח מבנה שטוח של פרקים לצורך הפשטות
            // או ניצור רשימה גנרית של 1-100 אם אין מידע מדויק

            // בדיקה אם יש שמות לפרקים (כמו במסכתות אבות)
            let chaptersCount = 20; // ברירת מחדל
            // אם יש לנו shape ב-API (לא תמיד זמין ב-raw/index), נשתמש בו.
            // כאן נשתמש בלוגיקה גנרית:
            for (let i = 1; i <= 50; i++) {
                const opt = document.createElement('option');
                opt.value = i;
                opt.innerText = `פרק ${i}`;
                chapterSelect.appendChild(opt);
            }
        }
        updateCalculatedUnits();
    } else {
        chapterDiv.style.display = 'none';
        // שחזור כמות מלאה
        if (document.getElementById('newBookSearch').value) {
            // נסה למצוא שוב ב-DB המקומי
            const bookName = document.getElementById('newBookSearch').value;
            let units = 50;
            const found = BOOKS_DB.find(b => b.name === bookName);
            if (found) units = found.units;
            document.getElementById('calculatedUnits').value = units;
        }
    }
}

async function selectBookFromSearch(bookName) {
    document.getElementById('newBookSearch').value = bookName;
    document.getElementById('bookSearchResults').style.display = 'none';
    document.getElementById('bookDetailsArea').style.display = 'block';

    // טעינת מבנה הספר (פרקים)
    try {
        const res = await fetch(`https://www.sefaria.org.il/api/v2/raw/index/${bookName}`);
        const data = await res.json();
        selectedBookStructure = data;

        // איפוס בחירה
        document.getElementById('bookScopeSelect').value = 'full';
        handleScopeChange();

        // הערכת כמות דפים/יחידות (ברירת מחדל)
        // ננסה לקחת את ה-length מה-shape או להעריך
        let estimatedUnits = 50; // ברירת מחדל
        if (data.schema && data.schema.sectionNames) {
            // לוגיקה פשוטה להערכה, בפועל ספריא נותן shape ב-API אחר, אבל נשתמש בזה כבסיס
            // אם זה תלמוד, ננסה למצוא במסד הנתונים המקומי שלנו
            const found = BOOKS_DB.find(b => b.name === bookName);
            if (found) estimatedUnits = found.units;
        }
        document.getElementById('calculatedUnits').value = estimatedUnits;

    } catch (e) {
        console.error("Error fetching book structure", e);
        document.getElementById('calculatedUnits').value = 100; // Fallback
    }
}

async function handleBookSearch(query) {
    const list = document.getElementById('bookSearchResults');
    if (query.length < 2) {
        list.style.display = 'none';
        return;
    }

    clearTimeout(bookSearchDebounce);
    bookSearchDebounce = setTimeout(async () => {
        try {
            const res = await fetch(`https://www.sefaria.org.il/api/name/${query}?limit=10&lang=he`);
            const data = await res.json();
            list.innerHTML = '';
            if (data.completions && data.completions.length > 0) {
                list.style.display = 'block';
                data.completions.forEach(book => {
                    const li = document.createElement('li');
                    li.style.padding = '8px'; li.style.borderBottom = '1px solid #eee'; li.style.cursor = 'pointer';
                    li.innerText = book;
                    li.onclick = () => selectBookFromSearch(book);
                    list.appendChild(li);
                });
            }
        } catch (e) { console.error(e); }
    }, 300);
}

async function addQuickLog() {
    if (!requireAuth()) return;
    const bookName = document.getElementById('quickType').value;
    const amount = parseInt(document.getElementById('quickAmount').value);
    const dedication = document.getElementById('quickDedication').value;

    // נתונים חדשים לתכנון זמן
    const paceType = document.getElementById('quickPace').value;
    const dateInput = document.getElementById('quickDateInput').value;
    let targetDate = "";

    if (paceType === 'date' && dateInput) {
        targetDate = dateInput;
    }

    if (!bookName || !amount || amount <= 0) {
        await customAlert("נא להזין שם ספר וכמות דפים תקינה");
        return;
    }

    createGoal(bookName, amount, targetDate, dedication);

    // איפוס שדות
    document.getElementById('quickAmount').value = '';
    document.getElementById('quickDedication').value = '';
    document.getElementById('quickDateInput').value = '';
    document.getElementById('quickHebrewDate').innerText = '';
}

function renderGoals() {
    const list = document.getElementById('goalsList');
    const tasksList = document.getElementById('dailyTasksList');
    const archiveList = document.getElementById('archiveList');
    if (!list || !tasksList || !archiveList) return;

    list.innerHTML = ''; tasksList.innerHTML = ''; archiveList.innerHTML = '';
    let hasTasks = false, totalLearned = 0;

    userGoals.forEach(goal => {
        if (goal.status === 'active') {
            renderGoalCard(goal, list, true);
            totalLearned += goal.currentUnit;

            if (goal.targetDate) {
                hasTasks = true;
                const days = Math.max(1, Math.ceil((new Date(goal.targetDate) - new Date()) / 86400000));
                const totalLeft = goal.totalUnits - goal.currentUnit;
                const dailyTarget = (totalLeft / days).toFixed(1);

                const taskDiv = document.createElement('div');
                taskDiv.className = 'task-row';

                // בדיקה אם המשימה היומית הושלמה (לפי חישוב פשוט של התקדמות)
                if (totalLeft <= 0) {
                    taskDiv.innerHTML = `<div><strong>${goal.bookName}</strong></div><span class="task-highlight" style="background:#dcfce7; color:#16a34a;">סיימת את הספר!</span>`;
                } else {
                    taskDiv.innerHTML = `<div><strong>${goal.bookName}</strong></div><span class="task-highlight">יעד יומי: ${dailyTarget}</span>`;
                }
                tasksList.appendChild(taskDiv);
            }
        } else {
            renderGoalCard(goal, archiveList, false);
            totalLearned += goal.totalUnits;
        }
    });

    // updateRankProgressBar(totalLearned); // הוסר לבקשת המשתמש
    document.getElementById('dailyTasksContainer').style.display = hasTasks ? 'block' : 'none';
    document.getElementById('stat-books').innerText = userGoals.filter(g => g.status === 'active').length;
    document.getElementById('stat-pages').innerText = totalLearned;
    document.getElementById('stat-completed').innerText = userGoals.filter(g => g.status === 'completed').length;
    // Rating is updated via loadChatRating called in syncGlobalData
}

window.updateGoalNotes = async function (goalId, newNotes) {
    if (!requireAuth()) return;
    const goal = userGoals.find(g => g.id == goalId);
    if (goal) {
        goal.notes = newNotes;
        saveGoals();

        // שמירה לענן
        try {
            await supabaseClient.from('user_goals').update({ notes: newNotes }).eq('id', goalId);
        } catch (e) { console.error("Error saving notes to cloud", e); }
    }
};

async function updateRankProgressBar(score) {
    return; // פונקציונליות הוסרה לבקשת המשתמש
    let currentRank = getRankName(score);

    if (notificationsEnabled && currentUser && previousRank && currentRank !== previousRank) {
        const rankOrder = { "צורב צעיר": 0, "מתמיד": 1, "צורבא מרבנן": 2, "תלמיד חכם": 3 };
        if (rankOrder[currentRank] > rankOrder[previousRank]) {
            confetti({ particleCount: 400, spread: 120, origin: { y: 0.6 } });
            const msg = `👑 ברכות! עלית לדרגת ${currentRank}!`;
            addNotification(msg);
            showToast(msg, "success");
            // Add reward points
            await supabaseClient.rpc('increment_field', { table_name: 'users', field_name: 'reward_points', increment_value: 100, user_email: currentUser.email });
        }
    }
    previousRank = currentRank;

    let nextRank = "", nextThreshold = 0, prevThreshold = 0;
    if (score < 101) { nextRank = "מתמיד"; nextThreshold = 101; prevThreshold = 0; }
    else if (score < 501) { nextRank = "צורבא מרבנן"; nextThreshold = 501; prevThreshold = 101; }
    else if (score < 1001) { nextRank = "תלמיד חכם"; nextThreshold = 1001; prevThreshold = 501; }
    else { nextRank = "מאור הדור"; nextThreshold = score; prevThreshold = 0; }

    const rInfo = document.getElementById('rank-info');
    const rBar = document.getElementById('rank-progress-bar');
    const rFooter = document.getElementById('rank-footer');
    if (!rInfo || !rBar) return;

    if (score >= 1001) {
        rInfo.innerText = `דרגת שיא: ${currentRank}`;
        rBar.style.width = "100%";
        rFooter.innerText = "אשריכם! הגעתם לדרגה הגבוהה ביותר.";
    } else {
        const progress = ((score - prevThreshold) / (nextThreshold - prevThreshold)) * 100;
        rInfo.innerText = `דרגה נוכחית: ${currentRank}`;
        rBar.style.width = `${progress}%`;
        rFooter.innerText = `עוד ${nextThreshold - score} דפים לדרגת ${nextRank}`;
    }
}

