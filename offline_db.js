// קובץ נתונים למצב אופליין - ניתן לערוך את הנתונים כאן כטקסט
const OFFLINE_DB_SOURCE = {
    users: [
        { 
            email: "user1@local.app", 
            password: "123", 
            display_name: "משה כהן", 
            city: "ירושלים", 
            phone: "0501234567", 
            age: 25, 
            subscription: { level: 1, name: "תומך כשר" }, 
            is_banned: false 
        },
        { 
            email: "user2@local.app", 
            password: "123", 
            display_name: "דוד לוי", 
            city: "בני ברק", 
            phone: "0507654321", 
            age: 30, 
            subscription: { level: 0 }, 
            is_banned: false 
        },
        { 
            email: "admin@system", 
            password: "admin", 
            display_name: "הנהלה", 
            city: "", 
            phone: "", 
            age: 0, 
            subscription: { level: 7, name: "מנהל" }, 
            is_banned: false 
        }
    ],
    chat_messages: [
        {
            id: 1,
            sender_email: "user1@local.app",
            receiver_email: "user2@local.app",
            message: "שלום דוד, רוצה ללמוד בחברותא?",
            created_at: new Date().toISOString(),
            is_read: false
        }
    ],
    user_goals: [],
    chavruta_requests: [],
    user_followers: [],
    schedules: [],
    user_reports: [],
    system_announcements: [],
    suggestions: [],
    site_visits: [],
    ad_stats: [],
    message_reactions: [],
    siyum_board: [],
    siyum_reactions: [],
    settings: [{ key: 'ads_content', value: '<h3>מצב אופליין פעיל</h3><p>הנתונים נטענים מקובץ offline_db.js</p>' }]
};
