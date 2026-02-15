async function searchChats(query) {
    if (!currentUser) return [];
    const { data, error } = await supabaseClient
        .from('chat_messages')
        .select('*')
        // כאן הוספנו בדיקה אם ההודעה היא "כללית" (is_public) או "מזל טוב"
        .or(`sender_email.eq.${currentUser.email},receiver_email.eq.${currentUser.email},receiver_email.is.null,receiver_email.eq.global`)
        .ilike('message', `%${query}%`);

    if (error) {
        console.error("Chat search error:", error);
        return [];
    }
    return data;
}

// === מנגנון Polling (גיבוי לצ'אט) ===
let chatPollInterval = null;

function startChatPolling() {
    if (!chatPollInterval) {
        chatPollInterval = setInterval(pollChats, 3000);
    }
}

async function pollChats() {
    const windows = document.querySelectorAll('.chat-window');
    if (windows.length === 0) {
        clearInterval(chatPollInterval);
        chatPollInterval = null;
        return;
    }

    for (const win of windows) {
        const partnerEmail = win.id.replace('chat-window-', '');
        await checkNewMessagesFor(partnerEmail);
    }
}
async function checkNewMessagesFor(partnerEmail) {
    const container = document.getElementById(`msgs-${partnerEmail}`);
    if (!container) return;

    let lastTime = new Date(0).toISOString();
    const bubbles = container.querySelectorAll('.message-bubble');
    if (bubbles.length > 0) {
        const lastBubble = bubbles[bubbles.length - 1];
        if (lastBubble.dataset.timestamp) lastTime = lastBubble.dataset.timestamp;
    }

    try {
        let query = supabaseClient.from('chat_messages').select('*');

        if (partnerEmail.startsWith('book:')) {
            query = query.eq('receiver_email', partnerEmail);
        } else {
            query = query.or(`and(sender_email.eq.${partnerEmail},receiver_email.eq.${currentUser.email}),and(sender_email.eq.${currentUser.email},receiver_email.eq.${partnerEmail})`);
        }

        const { data } = await query
            .gt('created_at', lastTime)
            .order('created_at', { ascending: true });

        if (data && data.length > 0) {
            data.forEach(msg => {
                const type = msg.sender_email.toLowerCase() === currentUser.email.toLowerCase() ? 'me' : 'other';
                appendMessageToWindow(partnerEmail, msg.message, type, msg.id, msg.created_at, msg.is_read, msg.sender_email);
                if (type === 'other') {
                    const win = document.getElementById(`chat-window-${partnerEmail}`);
                    if (win && win.classList.contains('minimized')) win.classList.add('flashing');
                    else markAsRead(partnerEmail);
                }
            });
        }
    } catch (e) { console.error("Polling error", e); }
}

// === לוגיקת צ'אט ===
let activeChats = {}; // מעקב אחרי חלונות צ'אט פתוחים

function getCurrentChatEmail() {
    return isAdminMode ? 'admin@system' : currentUser.email;
}

function openBookChat(bookName) {
    openChat('book:' + bookName, 'צ\'אט: ' + bookName);
}

function openChat(partnerEmail, partnerName, startMinimized = false, forceFloating = false) {
    // Don't lowercase book IDs as they might contain case sensitive parts or spaces we want to preserve visually, though ID must be safe.
    // For simplicity, we keep email lowercase, but book ID we handle carefully.
    const isBook = partnerEmail.startsWith('book:');
    if (!isBook) partnerEmail = partnerEmail.toLowerCase();

    if (partnerEmail === 'admin@system') {
        partnerName = 'הודעת מנהל';
    }
    if (partnerEmail === 'updates@system') {
        partnerName = 'עדכונים מהנעקבים';
    }

    // If we are in the Chats screen, open it there instead of floating
    if (!forceFloating && document.getElementById('screen-chats').classList.contains('active')) {
        loadChatIntoMainArea(partnerEmail, partnerName);
        return;
    }

    // בדיקה אם החלון כבר קיים
    if (document.getElementById(`chat-window-${partnerEmail}`)) {
        const win = document.getElementById(`chat-window-${partnerEmail}`);
        win.classList.remove('minimized');
        win.querySelector('input')?.focus();
        return;
    }

    // איפוס הודעות שלא נקראו
    if (unreadMessages[partnerEmail]) {
        unreadMessages[partnerEmail] = 0;
        localStorage.setItem('torahApp_unread', JSON.stringify(unreadMessages));
        if (document.getElementById('screen-chavrutas').classList.contains('active')) renderChavrutas();
    }

    const isBlocked = blockedUsers.includes(partnerEmail);
    const blockClass = isBlocked ? 'blocked' : '';
    const blockIconColor = isBlocked ? '#ef4444' : '#fff';
    const isSystem = partnerEmail === 'admin@system';
    const banStyle = (isSystem || isBook) ? 'display:none;' : `color:${blockIconColor};`;

    const chatHtml = `
        <div class="chat-window ${blockClass}" id="chat-window-${partnerEmail}">
            <div class="chat-header" onclick="toggleChatWindow('${partnerEmail}')">
                <div style="display:flex; align-items:center; gap:5px;">
                    ${isBook ? '<i class="fas fa-book"></i>' : `<span class="online-dot" id="online-${partnerEmail}"></span>`}
                    <span>${partnerName}</span>
                </div>
                <div style="font-size:1rem; display:flex; gap:12px; align-items:center;">
                    <i class="fas fa-ban" onclick="event.stopPropagation(); openReportModal('${partnerEmail}')" title="דיווח וחסימה" style="${banStyle}" id="block-btn-${partnerEmail}"></i>
                    <i class="fas fa-minus" onclick="event.stopPropagation(); toggleChatWindow('${partnerEmail}')" title="מזער"></i>
                    <i class="fas fa-times" onclick="event.stopPropagation(); closeChatWindow('${partnerEmail}')" style="margin-right:8px;"></i>
                </div>
            </div>
            <div class="chat-body">
                <div class="chat-messages-area" id="msgs-${partnerEmail}"></div>
                <div class="typing-indicator-box" id="typing-${partnerEmail}"></div>
                <div id="reply-preview-${partnerEmail}" style="display:none; background:#f1f5f9; padding:5px; border-left:3px solid var(--accent); font-size:0.8rem; display:flex; justify-content:space-between; align-items:center;"></div>
                <div class="chat-footer">
                    <input type="text" id="input-${partnerEmail}" placeholder="הודעה..." 
                        oninput="handleTyping('${partnerEmail}')" 
                        onkeyup="saveChatDraft('${partnerEmail}', this.value)"
                        onkeypress="if(event.key === 'Enter') sendMessage('${partnerEmail}')">
                    <button class="btn" style="width:auto; padding:0 10px;" onclick="sendMessage('${partnerEmail}')">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', chatHtml);
    bringToFront(document.getElementById(`chat-window-${partnerEmail}`)); // הבאה לקדמת המסך
    rearrangeMinimizedWindows();

    // בדיקת סטטוס מחובר
    if (!isBook) {
        const partner = globalUsersData.find(u => u.email === partnerEmail);
        if (partner && partner.lastSeen && (new Date() - new Date(partner.lastSeen) < 5 * 60 * 1000)) {
            document.getElementById(`online-${partnerEmail}`).classList.add('active');
        }
    }

    loadChatHistory(partnerEmail);

    const draft = localStorage.getItem('chat_draft_' + partnerEmail);
    if (draft) document.getElementById('input-' + partnerEmail).value = draft;

    if (startMinimized) {
        const win = document.getElementById(`chat-window-${partnerEmail}`);
        if (win && unreadMessages[partnerEmail] > 0) { // Only flash if there are unread messages
            win.classList.add('minimized');
            win.classList.add('flashing');
            rearrangeMinimizedWindows();
        }
    } else {
        markAsRead(partnerEmail); // סימון הודעות כנקראות רק אם נפתח מלא
    }
    startChatPolling();
}

let currentChatFilter = 'personal';

async function renderChatList(filter, tabEl, isBackgroundUpdate = false) {
    currentChatFilter = filter;
    if (tabEl) {
        document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
        tabEl.classList.add('active');
        lastChatListHTML = ''; // Reset cache on tab switch

    }

    const container = document.getElementById('chat-list-container');
    if (!isBackgroundUpdate) container.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8;">טוען...</div>';

    // Fetch all messages involving me to find unique partners
    const { data } = await supabaseClient.from('chat_messages')
        .select('sender_email, receiver_email, message, created_at, is_read')
        .or(`sender_email.eq.${currentUser.email},receiver_email.eq.${currentUser.email}`)
        .order('created_at', { ascending: false });

    if (!data) {
        if (!isBackgroundUpdate) container.innerHTML = '<div style="text-align:center; padding:20px;">אין צ\'אטים.</div>';
        return;
    }

    const partners = new Set();
    const chats = [];

    data.forEach(msg => {
        const isMe = msg.sender_email === currentUser.email;
        const partner = isMe ? msg.receiver_email : msg.sender_email;

        if (!partners.has(partner)) {
            partners.add(partner);

            let category = 'personal';
            if (partner.startsWith('book:')) category = 'public';
            else if (partner === 'admin@system' || partner === 'updates@system') category = 'other';

            if (category === filter) {
                // סינון צ'אטים אישיים: הצג רק אם הוא חברותא מאושרת
                if (category === 'personal' && !approvedPartners.has(partner)) {
                    // אם הצ'אט לא עם חברותא פעילה, דלג עליו
                    return;
                }

                chats.push({
                    email: partner,
                    lastMsg: msg.message,
                    time: msg.created_at,
                    unread: (!isMe && !msg.is_read)
                });
            }
        }
    });

    let newHTML = '';

    // Add Mazal Tov Board item if filter is 'other'
    if (filter === 'other') {
        newHTML += `
            <div class="chat-list-item" onclick="renderMazalTovInMainArea()">
                <div style="width:40px; height:40px; background:#fef3c7; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-left:10px;">
                    <i class="fas fa-glass-cheers" style="color:#d97706;"></i>
                </div>
                <div style="flex:1;">
                    <div style="font-weight:bold;">לוח סיומים (מזל טוב)</div>
                    <div style="font-size:0.85rem; color:#64748b;">חגיגות סיומי מסכת בקהילה</div>
                </div>
            </div>
        `;
    }

    if (chats.length === 0) {
        newHTML = '<div style="text-align:center; padding:20px; color:#94a3b8;">אין צ\'אטים בקטגוריה זו.</div>';
    } else {

        chats.forEach(chat => {
            const user = globalUsersData.find(u => u.email === chat.email);
            const name = user ? user.name : (chat.email.startsWith('book:') ? chat.email.replace('book:', '') : (chat.email === 'admin@system' ? 'הנהלה' : (chat.email === 'updates@system' ? 'עדכונים מהנעקבים' : chat.email.split('@')[0])));

            const isOnline = user && user.lastSeen && (new Date() - new Date(user.lastSeen) < 5 * 60 * 1000);
            const onlineHtml = isOnline ? `<span style="display:inline-block; width:8px; height:8px; background:#22c55e; border-radius:50%; margin-left:5px;" title="מחובר כעת"></span>` : '';

            const msgDate = new Date(chat.time);
            const now = new Date();
            const isToday = msgDate.toDateString() === now.toDateString();
            const timeDisplay = isToday ? msgDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : msgDate.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });

            newHTML += `
            <div class="chat-list-item ${chat.unread ? 'unread' : ''}" onclick="loadChatIntoMainArea('${chat.email}', '${name.replace(/'/g, "\\'")}', this)">
                <div class="chat-list-item-content">
                <div class="chat-list-item-header">
                    <span class="chat-list-item-name">${onlineHtml}${name}</span>
                    <span class="chat-list-item-time">${timeDisplay}</span>
                </div>
                <div class="chat-list-item-preview">${chat.lastMsg}</div>
            </div>
            ${chat.unread ? '<div class="chat-list-unread-dot"></div>' : ''}
            </div>
        `;
        });
    }

    // Update DOM only if changed
    if (newHTML !== lastChatListHTML) {
        container.innerHTML = newHTML;
        lastChatListHTML = newHTML;
    }
}
function loadChatIntoMainArea(email, name, el) {
    const main = document.getElementById('chat-main-area');
    main.innerHTML = ''; // Clear current

    // Highlight active chat in sidebar
    document.querySelectorAll('.chat-list-item').forEach(item => item.classList.remove('active'));
    if (el) {
        el.classList.add('active');
        el.classList.remove('unread'); // Mark as read visually
        const dot = el.querySelector('.chat-list-unread-dot');
        if(dot) dot.remove();
    }

    const isBlocked = blockedUsers.includes(email);
    const blockIconColor = isBlocked ? '#ef4444' : '#94a3b8';
    const isBook = email.startsWith('book:');
    const isSystem = email === 'admin@system' || email === 'updates@system';
    
    const partner = globalUsersData.find(u => u.email === email);
    const isOnline = partner && partner.lastSeen && (new Date() - new Date(partner.lastSeen) < 5 * 60 * 1000);
    const lastSeenText = partner?.lastSeen ? `נראה לאחרונה: ${formatHebrewDate(partner.lastSeen)}` : (isOnline ? 'מחובר כעת' : 'לא מחובר');
    const statusText = isOnline ? 'מחובר כעת' : 'לא מחובר';
    const avatarInitial = name.charAt(0);

    // Reuse the chat window HTML structure but adapted for full size
    const chatHtml = `
        <header class="chat-main-header">
            <div class="chat-partner-info">
                <div class="chat-partner-avatar">
                    <div class="avatar-img">${isBook ? '<i class="fas fa-book"></i>' : avatarInitial}</div>
                    ${isOnline && !isBook ? '<div class="online-indicator"></div>' : ''}
                </div>
                <div class="chat-partner-details">
                    <span class="chat-partner-name">${name}</span>
                    <span class="chat-partner-status">${isBook ? 'צ\'אט ציבורי' : statusText}</span>
                </div>
            </div>
            <div class="chat-header-actions">
                ${!isSystem && !isBook ? `<button class="btn-icon" onclick="openReportModal('${email}')" title="דיווח וחסימה"><i class="fas fa-ban" style="color:${blockIconColor}"></i></button>` : ''}
                <button class="btn-icon" onclick="minimizeMainChat('${email}', '${name.replace(/'/g, "\\'")}')" title="מזער לחלון צף"><i class="fas fa-compress-alt"></i></button>
                <button class="btn-icon" onclick="closeMainChat()" title="סגור"><i class="fas fa-times"></i></button>
            </div>
        </header>
        <div class="chat-messages-area" id="msgs-${email}"></div>
        <div id="reply-preview-${email}" style="display:none; background:#e2e8f0; padding:8px; border-right:4px solid var(--accent); font-size:0.85rem; justify-content:space-between; align-items:center; margin: 0 10px;"></div>
        <footer class="chat-main-footer">
            <div class="chat-input-container">
                <input type="text" id="input-${email}" placeholder="הודעה..." 
                    oninput="handleTyping('${email}')" 
                    onkeypress="if(event.key === 'Enter') sendMessage('${email}')">
                <button onclick="sendMessage('${email}')">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        </footer>
    `;
    main.innerHTML = chatHtml;

    // Load messages
    loadChatHistory(email);

    // Check online status for main header
    markAsRead(email);
}

function closeMainChat() {
    document.getElementById('chat-main-area').innerHTML = `
        <div style="margin: auto; color: #94a3b8; text-align: center;">
            <i class="fas fa-comments" style="font-size: 3rem; opacity: 0.3;"></i>
            <p>בחר צ'אט מהרשימה</p>
        </div>`;
}

function minimizeMainChat(email, name) {
    // Clear main area
    closeMainChat();
    // Open floating minimized
    openChat(email, name, true, true);
}

function rearrangeMinimizedWindows() {
    const minimized = document.querySelectorAll('.chat-window.minimized');
    minimized.forEach((win, index) => {
        win.style.bottom = (90 + index * 60) + 'px';
    });
}

function closeChatWindow(email) {
    const win = document.getElementById(`chat-window-${email}`);
    if (win) win.remove();
    rearrangeMinimizedWindows();
}

function toggleChatWindow(email) {
    const win = document.getElementById(`chat-window-${email}`);
    if (win) {
        win.classList.toggle('minimized');
        win.classList.remove('flashing'); // הפסקת הבהוב בעת פתיחה/מזעור

        if (!win.classList.contains('minimized')) {
            win.style.bottom = '';
            markAsRead(email);
        }
        rearrangeMinimizedWindows();
    }
}

async function loadChatHistory(partnerEmail) {
    const myEmail = getCurrentChatEmail();
    const isBook = partnerEmail.startsWith('book:');

    let query = supabaseClient.from('chat_messages').select('*');

    // איפוס צ'אט יומי (דף היומי וכו') ב-2:00 בלילה
    const dailyBooks = ['book:דף היומי', 'book:משנה יומית', 'book:רמב"ם יומי', 'book:הלכה יומית'];
    if (dailyBooks.includes(partnerEmail)) {
        const now = new Date();
        let cutoff = new Date();
        cutoff.setHours(2, 0, 0, 0);
        if (now < cutoff) {
            cutoff.setDate(cutoff.getDate() - 1);
        }
        query = query.gt('created_at', cutoff.toISOString());
    }

    if (isBook) {
        query = query.eq('receiver_email', partnerEmail); // For books, receiver is the book ID
    } else {
        query = query.or(`sender_email.ilike."${myEmail}",receiver_email.ilike."${myEmail}"`)
            .or(`sender_email.ilike."${partnerEmail}",receiver_email.ilike."${partnerEmail}"`);
    }

    const { data, error } = await query.order('created_at', { ascending: true });

    if (error) console.error("שגיאה בטעינת צ'אט:", error);

    const container = document.getElementById(`msgs-${partnerEmail}`);
    if (!container) return;

    if (data) {
        container.innerHTML = '';
        data.forEach(msg => {
            // בדיקה אם להודעה זו יש תגובות (שרשור)
            // אנו בודקים אם קיימת הודעה אחרת ב-data שמכילה ref ל-ID הזה
            // זה עובד רק אם התגובה נטענה בהיסטוריה הנוכחית. לפתרון מלא צריך שאילתה נפרדת או שדה ב-DB.
            // כפתרון ביניים יעיל:
            const hasReplies = data.some(m => m.message.includes(`ref:${msg.id}`));

            const type = (msg.sender_email.toLowerCase() === myEmail.toLowerCase()) ? 'me' : 'other';
            const el = appendMessageToWindow(partnerEmail, msg.message, type, msg.id, msg.created_at, msg.is_read, msg.sender_email);

            if (hasReplies && el) {
                const indicator = document.createElement('span');
                indicator.className = 'thread-active-indicator';
                indicator.title = "יש תגובות בשרשור";
                // הוספה לבועה
                const bubble = el.querySelector('.message-bubble') || el;
                bubble.appendChild(indicator);
            }
        });

        // טעינת ריאקציות (לייקים) שביצעתי
        if (isBook && data.length > 0) {
            const msgIds = data.map(m => m.id);
            const { data: reactions } = await supabaseClient
                .from('message_reactions')
                .select('message_id, reaction_type')
                .in('message_id', msgIds)
                .eq('user_email', currentUser.email);

            if (reactions) {
                reactions.forEach(r => {
                    const btnIcon = document.querySelector(`#msg-${r.message_id} .reaction-btn i.fa-thumbs-${r.reaction_type === 'like' ? 'up' : 'down'}`);
                    if (btnIcon && btnIcon.parentElement) {
                        const btn = btnIcon.parentElement;
                        btn.classList.add('active');
                        btn.style.color = r.reaction_type === 'like' ? '#22c55e' : '#ef4444';
                        // btn.disabled = true; // הסרנו את ה-disabled כדי לאפשר ביטול
                        // הוספת מידע על סוג הריאקציה לכפתור כדי שנוכל לזהות בלחיצה הבאה
                        btn.dataset.reaction = r.reaction_type;
                    }
                });
            }
        }

        // גלילה למטה לאחר טעינת ההיסטוריה
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 100);
    }
}

async function loadChatRating() {
    const display = document.getElementById('chatRatingDisplay');
    if (!currentUser) return;

    // חישוב פשוט: שליפת כל ההודעות שלי וספירת לייקים
    const { data: messages } = await supabaseClient.from('chat_messages').select('id').eq('sender_email', currentUser.email);
    if (messages && messages.length > 0) {
        const ids = messages.map(m => m.id);
        const { count } = await supabaseClient.from('message_reactions').select('*', { count: 'exact', head: true }).in('message_id', ids).eq('reaction_type', 'like');
        
        const rating = count || 0;
        if (display) display.innerText = rating;

        // Update Dashboard Rating
        const dashStat = document.getElementById('stat-rating');
        if (dashStat) dashStat.innerText = rating;
        
        // Cache rating for immediate load next time
        localStorage.setItem('torahApp_rating', rating);
    } else {
        if (display) display.innerText = 0;
        const dashStat = document.getElementById('stat-rating');
        if (dashStat) dashStat.innerText = 0;
        localStorage.setItem('torahApp_rating', 0);
    }
}

async function sendMessage(partnerEmail) {
    const isBook = partnerEmail.startsWith('book:');
    if (!isBook && blockedUsers.includes(partnerEmail)) return await customAlert("משתמש זה חסום.");

    const input = document.getElementById(`input-${partnerEmail}`);
    const msg = input.value.trim();
    if (!msg) return;
    if (msg.includes('ref:')) return; // Prevent manual ref injection

    let finalMsg = msg;
    let isHtml = false;

    if (activeReply && activeReply.chatId === partnerEmail) {
        finalMsg = `<div class="chat-quote"><strong>${activeReply.sender}:</strong> ${activeReply.text}</div>${msg}`;
        isHtml = true;
        // אם אנחנו בתוך שרשור, הציטוט צריך להיות בתוך השרשור
        if (activeThreadId) {
            // הטיפול בשרשור נעשה ב-sendThreadMessage, אבל אם המשתמש בחר לצטט בתוך שרשור:
            // activeReply נשמר גלובלית. sendThreadMessage צריך להשתמש בו.
        }
        cancelReply(partnerEmail); // איפוס הציטוט
    }

    // Visualize before sending
    visualizeNetworkActivity('request', {
        action: 'sendMessage',
        from: currentUser.email,
        to: partnerEmail,
        isBoring: false
    });

    // ניקוי שדה הקלט
    input.value = '';
    localStorage.removeItem('chat_draft_' + partnerEmail);

    const sender = getCurrentChatEmail();
    // שמירה ב-Supabase
    try {
        // --- תיקון: שימוש ב-partnerEmail במקום currentChatPartner ---
        const { data, error } = await supabaseClient.from('chat_messages').insert([{
            sender_email: sender,
            receiver_email: partnerEmail, // For books, this is 'book:Name'
            message: finalMsg,
            is_html: isHtml
        }]).select();


        if (error) {
            console.error("Supabase Error:", error);
            await customAlert("שגיאה בשליחה: " + error.message);
        } else if (data && data[0]) {
            // שדר את ההודעה לכל הלקוחות המאזינים
            if (chatChannel) {
                chatChannel.send({
                    type: 'broadcast',
                    event: 'private_message',
                    payload: { message: data[0] }
                });
            }
            appendMessageToWindow(partnerEmail, finalMsg, 'me', data[0].id, data[0].created_at, false, sender);
        }
    } catch (e) {
        console.error("שגיאה בשליחת הודעה:", e);
    }
}

function saveChatDraft(email, val) {
    localStorage.setItem('chat_draft_' + email, val);
}

function appendMessageToWindow(partnerEmail, text, type, id, timestamp, isRead = false, senderEmail = null) {
    // Filter out thread replies from main view if they have a ref tag (hidden)
    // But since we use is_html for threads, we might want to show them or hide them.
    // הסתרת הודעות שרשור מהצ'אט הראשי
    if (text.includes('ref:')) return null;

    const container = document.getElementById(`msgs-${partnerEmail}`);
    if (!container) return;

    // מניעת כפילויות (חשוב למנגנון ה-Polling)
    if (id && document.getElementById(`msg-${id}`)) return;

    const div = document.createElement('div');
    div.className = `message-bubble msg-${type}`;
    if (id) div.id = `msg-${id}`;
    if (timestamp) div.dataset.timestamp = timestamp;
    div.style.cursor = 'pointer';

    let contentDiv = div;

    // For book chats, show sender name and avatar for EVERYONE (me and others)
    if (partnerEmail.startsWith('book:') && senderEmail) {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'flex-end';
        wrapper.style.gap = '8px';
        wrapper.style.marginBottom = '8px';
        wrapper.style.justifyContent = 'flex-end'; // יישור לצד הנגדי של כיוון השורה (ימין ב-Me, שמאל ב-Other)

        const senderUser = globalUsersData.find(u => u.email === senderEmail);
        const isSubscribed = senderUser && senderUser.subscription && senderUser.subscription.level > 0;
        const subClass = isSubscribed ? `aura-lvl-${senderUser.subscription.level}` : '';
        const subTitle = isSubscribed ? `מנוי: ${senderUser.subscription.name}` : '';

        const avatar = document.createElement('div');
        // צבע שונה לי ולאחרים
        const avatarColor = type === 'me' ? '#3b82f6' : '#cbd5e1';
        avatar.innerHTML = `<i class="fas fa-user-circle ${subClass}" style="font-size: 28px; color: ${avatarColor}; cursor: pointer; border-radius:50%;" title="${subTitle}"></i>`;
        avatar.onclick = (e) => { e.stopPropagation(); showUserDetails(senderEmail); };

        if (type === 'me') {
            wrapper.style.flexDirection = 'row-reverse'; // אני בצד שמאל (או ימין ב-RTL, תלוי בכיוון) - כאן נניח RTL אז אני בשמאל
            // ב-RTL row-reverse שם את האלמנט הראשון (avatar) בצד שמאל.
        }

        wrapper.appendChild(avatar); // Avatar first in DOM
        wrapper.appendChild(div);
        container.appendChild(wrapper);

        // Add name inside bubble too
        const senderName = senderUser ? senderUser.name : senderEmail.split('@')[0];
        const nameSpan = document.createElement('span');
        nameSpan.className = 'msg-sender-name';
        nameSpan.innerText = senderName;
        div.appendChild(nameSpan);
    } else {
        container.appendChild(div);
    }

    // Check if the message is HTML
    if (text.includes('<button') || text.includes('chat-quote')) {
        div.innerHTML = text;
    } else {
        div.textContent = text;
    }

    if (type === 'me') {
        if ((partnerEmail !== 'admin@system' && !partnerEmail.startsWith('book:')) || isAdminMode) {
            const check = document.createElement('span');
            check.className = 'msg-check';
            check.id = `check-${id}`;
            check.innerText = isRead ? '✓✓' : '✓';
            check.style.color = isRead ? '#4ade80' : '#cbd5e1';
            div.appendChild(check);
        }
    }

    const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    const timeDiv = document.createElement('div');
    timeDiv.className = 'msg-timestamp';
    timeDiv.innerText = timeStr;
    div.appendChild(timeDiv);

    div.onclick = function (e) {
        if (e.target.closest('.msg-delete-btn')) return;
        const ts = this.querySelector('.msg-timestamp');
        if (ts) ts.style.display = ts.style.display === 'block' ? 'none' : 'block';
    };

    if (type === 'me' && id) {
        const delBtn = document.createElement('button');
        delBtn.className = 'msg-delete-btn';
        delBtn.innerHTML = '<i class="fas fa-trash"></i>';
        delBtn.onclick = (e) => { e.stopPropagation(); deleteMessage(id, div); };
        div.appendChild(delBtn);
    }

    // Add Reactions/Menu for ALL chats (Personal + Book)
    if (id) {
        // Extract plain text for quoting - CLEANER VERSION
        const clone = div.cloneNode(true);
        // הסרת אלמנטים מיותרים לפני לקיחת הטקסט
        const toRemove = clone.querySelectorAll('.msg-timestamp, .msg-sender-name, .msg-delete-btn, .msg-check, .msg-reactions');
        toRemove.forEach(el => el.remove());

        const isBook = partnerEmail.startsWith('book:');
        const plainText = clone.innerText.replace('הצג טלפון ליצירת קשר', '').trim();
        const senderName = senderEmail ? (globalUsersData.find(u => u.email === senderEmail)?.name || senderEmail.split('@')[0]) : 'משתמש';
        const fullTextSafe = plainText.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeSenderName = senderName.replace(/'/g, "\\'");

        const isMe = senderEmail === currentUser.email;

        const reactionsDiv = document.createElement('div');
        reactionsDiv.className = 'msg-reactions';

        // הוספת הוי (Check) בתוך שורת הריאקציות
        if (type === 'me') {
            if ((partnerEmail !== 'admin@system' && !partnerEmail.startsWith('book:')) || isAdminMode) {
                const check = document.createElement('span');
                check.className = 'msg-check';
                check.id = `check-${id}`;
                check.innerText = isRead ? '✓✓' : '✓';
                check.style.color = isRead ? '#4ade80' : '#cbd5e1';
                reactionsDiv.appendChild(check);
            }
        }

        let innerHTML = '';
        if (isBook) {
            const likeDisabled = isMe ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : '';
            innerHTML += `
                <button class="reaction-btn" ${likeDisabled} onclick="event.stopPropagation(); toggleReaction('${id}', 'like', this)"><i class="fas fa-thumbs-up"></i></button>
                <button class="reaction-btn" ${likeDisabled} onclick="event.stopPropagation(); toggleReaction('${id}', 'dislike', this)"><i class="fas fa-thumbs-down"></i></button>
            `;
        }

        innerHTML += `
            <div class="msg-actions-menu" style="position:relative; display:inline-block;">
                <button class="reaction-btn" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('active')"><i class="fas fa-ellipsis-v"></i></button>
                <div class="msg-menu-dropdown">
                    <div class="msg-menu-item" onclick="event.stopPropagation(); replyToMessage('${partnerEmail}', '${safeSenderName}', '${fullTextSafe}'); this.parentElement.classList.remove('active');"><i class="fas fa-reply"></i> ציטוט</div>
                    ${isBook ? `<div class="msg-menu-item" onclick="event.stopPropagation(); openThread('${id}', '${fullTextSafe}', '${partnerEmail}'); this.parentElement.classList.remove('active');"><i class="fas fa-comments"></i> שרשור</div>` : ''}
                    ${!isMe ? `<div class="msg-menu-item" style="color:var(--danger);" onclick="event.stopPropagation(); openReportModal('${senderEmail}'); this.parentElement.classList.remove('active');"><i class="fas fa-flag"></i> דיווח</div>` : ''}
                </div>
            </div>
        `;
        reactionsDiv.innerHTML = innerHTML;
        div.appendChild(reactionsDiv);
    }

    container.scrollTop = container.scrollHeight;
    return div; // החזרת האלמנט לשימוש חיצוני
}

function replyToMessage(chatId, senderName, text) {
    activeReply = { chatId, sender: senderName, text };
    const preview = document.getElementById(`reply-preview-${chatId}`);
    if (preview) {
        preview.style.display = 'flex';
        preview.innerHTML = `<span><strong>משיב ל-${senderName}:</strong> ${text}</span> <i class="fas fa-times" style="cursor:pointer;" onclick="cancelReply('${chatId}')"></i>`;
        document.getElementById(`input-${chatId}`).focus();
    }
}

function cancelReply(chatId) {
    activeReply = null;
    const preview = document.getElementById(`reply-preview-${chatId}`);
    if (preview) preview.style.display = 'none';
}


async function deleteMessage(id, element) {
    if (!(await customConfirm('למחוק הודעה זו?'))) return;

    try {
        const { error } = await supabaseClient.from('chat_messages').delete().eq('id', id);
        if (error) throw error;
        element.remove();
    } catch (e) {
        console.error("Error deleting message:", e);
        await customAlert("שגיאה במחיקת ההודעה");
    }
}

async function toggleReaction(msgId, type, btn) {
    // לוגיקה חדשה: ביטול והחלפה
    const isActive = btn.classList.contains('active');
    const container = btn.parentElement;
    const otherType = type === 'like' ? 'dislike' : 'like';
    const otherBtn = container.querySelector(`.reaction-btn i.fa-thumbs-${type === 'like' ? 'down' : 'up'}`).parentElement;

    try {
        if (isActive) {
            // ביטול סימון קיים (מחיקה)
            await supabaseClient.from('message_reactions').delete()
                .eq('message_id', msgId)
                .eq('user_email', currentUser.email);

            btn.classList.remove('active');
            btn.style.color = '';
            delete btn.dataset.reaction;
        } else {
            // סימון חדש או החלפה
            await supabaseClient.from('message_reactions').upsert({
                message_id: msgId,
                user_email: currentUser.email,
                reaction_type: type
            }, { onConflict: 'message_id,user_email' });

            // הפעלת הכפתור הנוכחי
            btn.classList.add('active');
            btn.style.color = type === 'like' ? '#22c55e' : '#ef4444';
            btn.dataset.reaction = type;

            // כיבוי הכפתור השני אם היה פעיל
            if (otherBtn.classList.contains('active')) {
                otherBtn.classList.remove('active');
                otherBtn.style.color = '';
                delete otherBtn.dataset.reaction;
            }
        }
    } catch (e) {
        console.error("Reaction error", e);
        showToast("שגיאה בעדכון תגובה", "error");
    }
}

let typingTimeout = null;
let lastTypingTime = 0;

function handleTyping(partnerEmail) {
    const now = Date.now();
    if (now - lastTypingTime > 2000 && chatChannel) {
        lastTypingTime = now;
        chatChannel.send({ type: 'broadcast', event: 'typing', payload: { from: currentUser.email, to: partnerEmail } });
    }
}

function showTyping(partnerEmail, text) {
    const el = document.getElementById(`typing-${partnerEmail}`);
    if (el) {
        el.innerText = text;
        el.classList.add('active');
        if (typingTimers[partnerEmail]) clearTimeout(typingTimers[partnerEmail]);
        typingTimers[partnerEmail] = setTimeout(() => { el.classList.remove('active'); }, 3000);
    }
}

async function markAsRead(senderEmail) {
    try {
        await supabaseClient.from('chat_messages')
            .update({ is_read: true })
            .eq('sender_email', senderEmail)
            .eq('receiver_email', getCurrentChatEmail())
            .eq('is_read', false);
    } catch (e) { console.error("Error marking as read:", e); }
}