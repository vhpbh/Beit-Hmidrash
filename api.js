const SUPABASE_URL = 'https://dsaxhbmyvjtdmcbxnnlj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TjOpGB31wmbuVN8FZXDH_Q_tLmC10_7';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
setInterval(syncGlobalData, 10000);
setInterval(sendHeartbeat, 60000); // עדכון סטטוס מחובר כל דקה
// שים לב לשינוי השם ל- supabaseClient
let globalUsersData = [];
let blockedUsers = JSON.parse(localStorage.getItem('torahApp_blocked') || "[]");
let unreadMessages = JSON.parse(localStorage.getItem('torahApp_unread') || "{}");
let isAdminMode = false;
let previousRank = null;
let realAdminUser = null; // לשמירת המשתמש האמיתי בזמן שימוש בבוט
let adminChartInstance = null;
let globalZIndex = 3000;
let activeReply = null; // משתנה גלובלי לניהול תשובה/ציטוט
let lastChatListHTML = '';
let lastChatListHash = ''; // משתנה למניעת הבהוב בצ'אט

async function syncGlobalData() {
    try {
        console.log("מתחיל סנכרון נתונים מהענן...");

        // שליפת משתמשים
        const { data: users, error: usersError } = await supabaseClient
            .from('users')
            .select('*');
        if (usersError) {
            console.error("Supabase Users Error:", usersError);
            if (usersError.code === "PGRST301" || usersError.code === "401") await customAlert("שגיאת הרשאה: בדוק את מפתח ה-Supabase שלך.");
            throw usersError;
        }

        // שליפת לימודים
        const { data: goals, error: goalsError } = await supabaseClient
            .from('user_goals')
            .select('*');
        if (goalsError) throw goalsError;

        // בדיקת RLS: האם קיבלנו נתונים של אחרים?
        if (currentUser && goals.length > 0) {
            const others = goals.filter(g => g.user_email && g.user_email.toLowerCase() !== currentUser.email.toLowerCase());
            if (others.length === 0 && users.length > 1) {
                console.warn("⚠️ שים לב: לא התקבלו לימודים של משתמשים אחרים. כנראה שצריך להגדיר ב-Supabase מדיניות RLS שתאפשר SELECT לכולם (public) על הטבלה user_goals.");
            }

            // עדכון הלימודים שלי מהענן כדי למנוע היעלמות (עם מיזוג למניעת דריסת נתונים חדשים מקומית)
            if (currentUser) {
                const myCloudGoals = goals.filter(g => g.user_email === currentUser.email);
                const localGoalsMap = new Map(userGoals.map(g => [g.id.toString(), g]));

                myCloudGoals.forEach(cloudG => {
                    const cloudGoal = {
                        id: cloudG.id.toString(),
                        bookName: cloudG.book_name,
                        totalUnits: cloudG.total_units,
                        currentUnit: cloudG.current_unit || 0,
                        status: cloudG.status || 'active',
                        targetDate: cloudG.target_date || '',
                        dedication: cloudG.dedication || '',
                        notes: cloudG.notes || [],
                        startDate: cloudG.created_at
                    };
                    const localGoal = localGoalsMap.get(cloudGoal.id);
                    if (!localGoal || cloudGoal.currentUnit > localGoal.currentUnit) {
                        localGoalsMap.set(cloudGoal.id, cloudGoal);
                    }
                });

                userGoals = Array.from(localGoalsMap.values());
                // מיון: פעילים קודם, ואז לפי תאריך
                userGoals.sort((a, b) => {
                    if (a.status === b.status) return new Date(b.startDate) - new Date(a.startDate);
                    return a.status === 'active' ? -1 : 1;
                });
    
                // עדכון תצוגה אם אנחנו במסך הראשי
                if (document.getElementById('screen-dashboard').classList.contains('active')) renderGoals();
            }
        }

        // --- החלק החדש: שליפת חברותות מאושרות ---
        if (currentUser) {
            const { data: requests, error: reqError } = await supabaseClient
                .from('chavruta_requests')
                .select('*')
                .or(`sender_email.eq.${currentUser.email},receiver_email.eq.${currentUser.email}`);

            approvedPartners.clear();
            chavrutaConnections = [];
            pendingSentRequests = [];
            if (requests) {
                requests.forEach(r => {
                    if (r.status === 'approved') {
                        const partnerEmail = r.sender_email === currentUser.email ? r.receiver_email : r.sender_email;
                        approvedPartners.add(partnerEmail);
                        // שמירת שם החברותא לשימוש מיידי בטעינה הבאה
                        let pName = partnerEmail;
                        if (users) {
                            const u = users.find(u => u.email === partnerEmail);
                            if (u) pName = u.display_name || u.email;
                        }
                        chavrutaConnections.push({ email: partnerEmail, book: r.book_name, name: pName });
                    } else if (r.status === 'pending' && r.sender_email === currentUser.email) {
                        pendingSentRequests.push({ receiver: r.receiver_email, book: r.book_name });
                    }
                });
                localStorage.setItem('torahApp_chavrutas', JSON.stringify(chavrutaConnections));
            }
        }
        // ----------------------------------------

        // --- בדיקת הודעות צ'אט שלא נקראו (כולל ממנהל) ---
        if (currentUser) {
            const { data: unreadChats, error: chatError } = await supabaseClient
                .from('chat_messages')
                .select('*')
                .eq('receiver_email', currentUser.email)
                .eq('is_read', false);

            if (unreadChats && unreadChats.length > 0) {
                unreadChats.forEach(msg => {
                    // אם אין חלון צ'אט פתוח עבור השולח הזה, נוסיף להתראות
                    if (!document.getElementById(`chat-window-${msg.sender_email.toLowerCase()}`)) {
                        // בדיקה אם זו הודעת מערכת לשידור
                        if (msg.sender_email === 'admin@system' && msg.message.includes('הודעת מערכת')) {
                            // הודעות מערכת מטופלות בנפרד ב-Realtime, אבל אם פספסנו:
                            // לא נעשה כלום כאן כדי לא להציף
                        }
                        if (msg.sender_email === 'admin@system' && msg.message.includes('הודעת מערכת')) return; // דילוג על הודעות מערכת כפולות
                        // פתיחת צ'אט ממוזער בצד שמאל במקום התראה רגילה
                        const senderUser = globalUsersData.find(u => u.email === msg.sender_email);
                        const senderName = senderUser ? senderUser.name : msg.sender_email;
                        openChat(msg.sender_email, senderName, true);
                    }
                });
            }
        }


        if (users && goals) {
            globalUsersData = users.map(user => {
                const uEmail = (user.email || "").trim().toLowerCase();
                // מציאת הלימודים הפעילים
                const userPersonalGoals = goals.filter(g => (g.user_email || "").trim().toLowerCase() === uEmail && (g.status === 'active' || !g.status));
                const userCompletedGoals = goals.filter(g => (g.user_email || "").trim().toLowerCase() === uEmail && g.status === 'completed');

                // חישוב ניקוד
                const totalScore = goals
                    .filter(g => (g.user_email || "").trim().toLowerCase() === uEmail)
                    .reduce((sum, g) => sum + (g.current_unit || 0), 0);

                return {
                    id: user.email,
                    name: user.is_anonymous ? "לומד אנונימי" : (user.display_name || "לומד"),
                    city: user.city || "",
                    phone: user.phone || "",
                    address: user.address || "",
                    age: user.age || null,
                    lastSeen: user.last_seen, // נמיר לתאריך עברי בתצוגה
                    email: user.email,
                    learned: totalScore, // ← זה חשוב!
                    books: userPersonalGoals.map(g => g.book_name), // ← וזה!
                    completedBooks: userCompletedGoals.map(g => g.book_name),
                    isAnonymous: user.is_anonymous,
                    subscription: user.subscription || { amount: 0, level: 0 }, // נתוני מנוי
                    security_questions: user.security_questions || [],
                    password: user.password || '***', // הוספת שדה סיסמה אם קיים
                    reward_points: user.reward_points || 0,
                    chat_rating: user.chat_rating || 0, // דירוג חברתי
                    isBot: user.is_bot || false
                };
            });

            // עדכון סטטוס מחובר בחלונות צ'אט פתוחים
            document.querySelectorAll('.chat-window').forEach(win => {
                const email = win.id.replace('chat-window-', '');
                const user = globalUsersData.find(u => u.email === email);
                const dot = document.getElementById(`online-${email}`);
                if (user && dot) {
                    const isOnline = user.lastSeen && (new Date() - new Date(user.lastSeen) < 5 * 60 * 1000);
                    if (isOnline) dot.classList.add('active');
                    else dot.classList.remove('active');
                }
            });

            console.log("סונכרנו בהצלחה: " + globalUsersData.length + " לומדים.");
            renderLeaderboard();
            if (document.getElementById('screen-chavrutas').classList.contains('active')) renderChavrutas();
            if (document.getElementById('screen-chats').classList.contains('active')) renderChatList(currentChatFilter, null, true);
            renderGoals();
        }

        // עדכון מונה מחוברים בזמן אמת עבור האדמין
        // עדכון מסך ניהול בזמן אמת אם הוא פתוח
        if (document.getElementById('screen-admin').classList.contains('active')) renderAdminPanel();
        if (document.getElementById('admin-sec-reports').classList.contains('active')) renderAdminReports();

        loadChatRating(); // Update rating in dashboard
        // רענון פתקים אם המודאל פתוח (תיקון סנכרון)
        if (document.getElementById('notesModal').style.display === 'flex' && currentNotesData.goalId) {
            // בדיקה אם המשתמש מקליד כרגע כדי לא לאפס לו את הפתק
            const activeTag = document.activeElement.tagName;
            if (activeTag !== 'TEXTAREA' && activeTag !== 'INPUT') {
                const goal = userGoals.find(g => g.id == currentNotesData.goalId);
                if (goal) {
                    const chavruta = chavrutaConnections.find(c => c.book === goal.bookName);
                    if (chavruta) refreshPartnerNotes(chavruta.email, goal.bookName);
                }
            }
        }
    } catch (e) {
        console.error("שגיאה בסנכרון נתונים:", e.message);
    }
    checkIncomingRequests()
    checkAdminMessagesForUser();
}
async function sendHeartbeat() {
    if (!currentUser) return;
    try {
        await supabaseClient.from('users').update({ last_seen: new Date() }).eq('email', currentUser.email);
    } catch (e) { console.error("Heartbeat error", e); }
}