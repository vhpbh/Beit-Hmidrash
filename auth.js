async function handleSignup(e) {
    e.preventDefault();
    const email = document.getElementById('regEmail').value.trim().toLowerCase();
    const pass = document.getElementById('regPass').value;
    const name = document.getElementById('regName').value;
    const phone = document.getElementById('regPhone').value;
    const city = document.getElementById('regCity').value;
    const age = document.getElementById('regAge').value;
    const address = document.getElementById('regAddress').value;
    const q1 = document.getElementById('regSecQ1').value;
    const a1 = document.getElementById('regSecA1').value;
    const marketing = document.getElementById('regMarketing').checked;
const AUTH_JOKES = [
    "רגע, רגע... המלאכים בודקים אם שמך רשום בספר החיים (של האתר). אנא התחבר.",
    "כדי לשמור את הלימוד שלך, צריך קודם לשמור אותך במערכת. בוא נרשם!",
    "נראה שאתה לומד בעילום שם. כדי שנוכל לעקוב אחריך, אנא התחבר.",
    "הפעולה שביקשת דורשת ייחוס. אנא התחבר כדי שנדע מי אתה.",
    "עצור! רק רשומים יכולים לצבור זכויות. הירשם עכשיו!"
];

    if (!email || !pass || !name || !q1 || !a1) {
        await customAlert("נא למלא את כל שדות החובה");
        return;
    }

    if (!validateInput(email, 'email')) return customAlert("כתובת האימייל אינה תקינה.");
    if (!validateInput(pass, 'password')) return customAlert("הסיסמה חייבת להכיל לפחות 6 תווים, כולל אותיות ומספרים.");
    if (!validateInput(name, 'name')) return customAlert("השם אינו תקין.");
    if (phone && !validateInput(phone, 'phone')) return customAlert("מספר הטלפון אינו תקין.");

    if (!email || !pass || !name || !q1 || !a1) {
        await customAlert("נא למלא את כל שדות החובה");
        return;
    }

    try {
        // בדיקה אם קיים
        const { data: existing } = await supabaseClient.from('users').select('email').eq('email', email).single();
        if (existing) {
            await customAlert("כתובת האימייל כבר רשומה במערכת.");
            return;
        }

        const securityQuestions = [{ q: q1, a: a1 }];

        const newUser = {
            email: email,
            password: pass,
            display_name: name,
            phone: phone,
            city: city,
            age: age ? parseInt(age) : null,
            address: address,
            security_questions: securityQuestions,
            last_seen: new Date(),
            subscription: { amount: 0, level: 0, name: '' },
            marketing_consent: marketing

        };

        const { error } = await supabaseClient.from('users').insert([newUser]);

        if (error) throw error;

        // התחברות אוטומטית לאחר הרשמה
        currentUser = mapUserFromDB({
            email: email,
            display_name: name,
            phone: phone,
            city: city,
            age: age ? parseInt(age) : null,
            address: address,
            security_questions: securityQuestions,
            subscription: { amount: 0, level: 0, name: '' },
            reward_points: 0,
            marketing_consent: marketing
        });

        localStorage.setItem('torahApp_user', JSON.stringify(currentUser));
        document.getElementById('auth-overlay').style.display = 'none';
        updateHeader();
        await init(); // אתחול המערכת עם המשתמש החדש
        switchScreen('dashboard', document.querySelector('.nav-item'));
        showToast("החשבון נוצר בהצלחה! ברוך הבא.", "success");

    } catch (e) {
        console.error(e);
        await customAlert("שגיאה ביצירת חשבון: " + e.message);
    }
}


async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('emailInput').value.trim().toLowerCase();
    const pass = document.getElementById('passInput').value;

    if (!email || !pass) {
        await customAlert("נא להזין אימייל וסיסמה");
        return;
    }

    try {
        // בדיקה מול השרת
        const { data: user, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (error && error.code !== 'PGRST116') { // שגיאה שאינה "לא נמצא"
            await customAlert("שגיאת תקשורת: " + error.message);
            return;
        }

        if (user) {
            // בדיקת חסימה
            if (user.is_banned) {
                document.getElementById('auth-overlay').style.display = 'none';
                document.getElementById('banned-overlay').style.display = 'flex';
                localStorage.setItem('device_banned', 'true'); // חסימת מכשיר
                sessionStorage.setItem('banned_email', email); // שמירת אימייל לערעור
                return;
            }

            // משתמש קיים - בדיקת סיסמה
            if (user.password !== pass) {
                const randomJoke = JOKES[Math.floor(Math.random() * JOKES.length)];
                await customAlert(randomJoke);
                return;
            }

            // הגדרת המשתמש הנוכחי
            currentUser = mapUserFromDB(user);

        } else {
            await customAlert("משתמש לא קיים. אנא הירשם.");
            toggleAuthMode('signup');
            return;
        }

        // המשך תהליך ההתחברות הרגיל
        localStorage.setItem('torahApp_user', JSON.stringify(currentUser));
        document.getElementById('auth-overlay').style.display = 'none';
        switchScreen('dashboard', document.querySelector('.nav-item'));

        if ("Notification" in window && Notification.permission !== "granted") {
            Notification.requestPermission();
        }
        setTimeout(checkDailyReminders, 5000);
        setInterval(checkChavrutaReminders, 60000);

        updateHeader();

        // טעינה אסינכרונית
        await loadUserProfile();
        await loadGoals();
        await loadSchedules();
        await syncGlobalData();
        notificationsEnabled = true;
        loadAds();
        sendHeartbeat();
        setupRealtime();
        logVisit(); // Log visitor

        addNotification("ברוך הבא לבית המדרש! בהצלחה בלימוד.");

    } catch (e) {
        console.error("Login Error:", e);
        await customAlert("אירעה שגיאה בהתחברות.");
    }
}

async function handleForgotPassword() {
    const email = await customPrompt("הזן את כתובת האימייל שלך לשחזור:");
    if (!email) return;

    try {
        const { data: user, error } = await supabaseClient.from('users').select('*').eq('email', email.toLowerCase()).single();

        if (error || !user) {
            await customAlert("משתמש לא נמצא.");
            return;
        }

        if (!user.security_questions || user.security_questions.length === 0) {
            await customAlert("לא הוגדרו שאלות אבטחה לחשבון זה. פנה למנהל.");
            return;
        }

        const q = user.security_questions[0];
        const ans = await customPrompt(`שאלת אבטחה: ${q.q}`);

        if (ans === q.a) {
            const newPass = await customPrompt("הזן סיסמה חדשה:");
            if (newPass) {
                await supabaseClient.from('users').update({ password: newPass }).eq('email', email);
                await customAlert("הסיסמה שונתה בהצלחה!");
            }
        } else {
            await customAlert("תשובה שגויה.");
        }
    } catch (e) {
        console.error(e);
        await customAlert("שגיאה בתהליך השחזור.");
    }
}

async function loadUserProfile() {
    try {
        const { data: userData, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('email', currentUser.email)
            .single();

        if (userData && !error) {
            // עדכון הפרופיל המקומי עם נתונים מהענן
            currentUser.displayName = userData.display_name || currentUser.displayName;
            currentUser.phone = userData.phone || '';
            currentUser.city = userData.city || '';
            currentUser.address = userData.address || '';
            currentUser.age = userData.age || null;
            currentUser.isAnonymous = userData.is_anonymous || false;
            currentUser.subscription = userData.subscription || { amount: 0, level: 0, name: '' }; // טעינת מנוי
            currentUser.security_questions = userData.security_questions || [];
            currentUser.password = userData.password || ''; // שמירה מקומית של הסיסמה (לא מומלץ בדרך כלל, אך נדרש לניהול פשוט כאן)
            currentUser.reward_points = userData.reward_points || 0;
            currentUser.marketing_consent = userData.marketing_consent || false;

            // שמירה מקומית
            localStorage.setItem('torahApp_user', JSON.stringify(currentUser));

            // עדכון UI של הפרופיל
            updateProfileUI();
        }
    } catch (e) {
        console.error("שגיאה בטעינת פרופיל:", e);
    }
}

function updateProfileUI() {
    const nameInput = document.getElementById('profileName');
    const phoneInput = document.getElementById('profilePhone');
    const cityInput = document.getElementById('profileCity');
    const addressInput = document.getElementById('profileAddress');
    const ageInput = document.getElementById('profileAge');
    const anonSwitch = document.getElementById('anonSwitch');
    const secQInput = document.getElementById('profileSecQ');
    const secAInput = document.getElementById('profileSecA');

    if (nameInput) nameInput.value = currentUser.displayName || '';
    if (phoneInput) phoneInput.value = currentUser.phone || '';
    if (ageInput) ageInput.value = currentUser.age || '';
    if (cityInput) cityInput.value = currentUser.city || '';
    if (addressInput) addressInput.value = currentUser.address || '';
    if (anonSwitch) anonSwitch.checked = currentUser.isAnonymous || false;

    if (currentUser.security_questions && currentUser.security_questions.length > 0) {
        if (secQInput) secQInput.value = currentUser.security_questions[0].q || '';
        if (secAInput) secAInput.value = currentUser.security_questions[0].a || '';
    }
}

function toggleAuthMode(mode) {
    document.getElementById('btn-login-mode').className = `auth-toggle-btn ${mode === 'login' ? 'active' : ''}`;
    document.getElementById('btn-signup-mode').className = `auth-toggle-btn ${mode === 'signup' ? 'active' : ''}`;

    document.getElementById('login-form').style.display = mode === 'login' ? 'block' : 'none';
    document.getElementById('signup-form').style.display = mode === 'signup' ? 'block' : 'none';
}

function mapUserFromDB(user) {
    return {
        email: user.email,
        displayName: user.display_name || user.email.split('@')[0],
        isAnonymous: user.is_anonymous,
        phone: user.phone || '',
        city: user.city || '',
        address: user.address || '',
        age: user.age || null,
        subscription: user.subscription || { amount: 0, level: 0, name: '' },
        security_questions: user.security_questions || [],
        password: user.password,
        reward_points: user.reward_points || 0,
        marketing_consent: user.marketing_consent || false
    };
}

function updateHeader() {
    document.getElementById('headerUserEmail').innerText = currentUser.displayName || currentUser.email;

    // עדכון הילת הפרופיל בהאדר
    const btn = document.getElementById('headerProfileBtn');
    // הסרת כל מחלקות ההילה הקודמות
    for (let i = 1; i <= 7; i++) btn.classList.remove(`aura-lvl-${i}`);

    if (currentUser.subscription && currentUser.subscription.level > 0) {
        btn.classList.add(`aura-lvl-${currentUser.subscription.level}`);
        // הוספת טייטל
        btn.title = `מנוי: ${currentUser.subscription.name}`;
    }
}

function logout() { localStorage.removeItem('torahApp_user'); location.reload(); }

function checkBanStatus() {
    if (localStorage.getItem('device_banned') === 'true') {
        document.getElementById('auth-overlay').style.display = 'none';
        document.getElementById('banned-overlay').style.display = 'flex';
    }
}

function requireAuth() {
    if (currentUser) {
        return true;
    }

    const randomJoke = AUTH_JOKES[Math.floor(Math.random() * AUTH_JOKES.length)];
    customAlert(randomJoke).then(() => {
        showAuthOverlay();
    });

    return false;
}

function setupGuestHeader() {
    const headerEmail = document.getElementById('headerUserEmail');
    headerEmail.innerHTML = `<a href="#" onclick="event.preventDefault(); showAuthOverlay();" style="text-decoration: underline; color: var(--accent);">התחבר או הירשם</a>`;
    headerEmail.style.cursor = 'pointer';

    // Hide elements that are for logged-in users
    const notifContainer = document.getElementById('notif-container');
    const profileContainer = document.querySelector('.profile-container');
    const donateButton = document.querySelector('.btn-donate-header');
    
    if(notifContainer) notifContainer.style.display = 'none';
    if(profileContainer) profileContainer.style.display = 'none';
    if(donateButton) donateButton.style.display = 'none';
}

function showAuthOverlay() {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        toggleAuthMode('login'); // Default to login view
    }
}

function logoutBot() {
    if (realAdminUser) {
        currentUser = realAdminUser;
        realAdminUser = null;
        localStorage.setItem('torahApp_user', JSON.stringify(currentUser));

        // רענון מלא של הנתונים כדי להחזיר את המצב לקדמותו
        userGoals = [];
        chavrutaConnections = [];

        location.reload();
    }
}

function validateInput(value, type) {
    if (!value) return true; // Don't validate empty optional fields, the required attribute handles mandatory fields
    value = value.trim();
    if (value === '') return true;

    switch (type) {
        case 'email':
            return /\S+@\S+\.\S+/.test(value);
        case 'phone':
            // Allows 05x-xxxxxxx, 0x-xxxxxxx, 0xx-xxxxxxx after stripping hyphens
            return /^0\d{8,9}$/.test(value.replace(/-/g, ''));
        case 'password':
            // At least 6 chars, one letter, one number
            return /(?=.*\d)(?=.*[a-zA-Z\u0590-\u05FF]).{6,}/.test(value);
        case 'name':
            // At least two letters, allows Hebrew, English and spaces, not just numbers
            return /^[a-zA-Z\u0590-\u05FF\s]{2,}[a-zA-Z\u0590-\u05FF\s]*$/.test(value) && !/^\d+$/.test(value);
        default:
            return true;
    }
}

