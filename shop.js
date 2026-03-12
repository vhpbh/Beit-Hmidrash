// d:\בית המדרש\9.01.03\shop.js

let shopItems = [];
let userInventory = [];

async function renderShop() {
    const container = document.getElementById('screen-shop');
    if (!container) return;

    // כותרת ותצוגת נקודות
    let html = `
    <div class="max-w-7xl mx-auto px-4 py-8">
        <div class="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
            <div>
                <h2 class="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <i class="fas fa-store text-amber-500"></i> חנות הזכויות
                </h2>
                <p class="text-slate-500 dark:text-slate-400 mt-1">רכוש רקעים ואייקונים של גדולי הדור באמצעות הנקודות שצברת</p>
            </div>
            <div class="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-6 py-3 rounded-2xl font-bold text-xl flex items-center gap-3 shadow-sm border border-amber-100 dark:border-amber-800">
                <div class="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-md">
                    <i class="fas fa-coins text-amber-500"></i>
                </div>
                <div class="flex flex-col">
                    <span class="text-xs opacity-70 font-normal">היתרה שלך</span>
                    <span id="user-points-display" class="leading-none">${currentUser ? currentUser.reward_points.toLocaleString() : 0}</span>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = '<div class="text-center p-20"><i class="fas fa-circle-notch fa-spin text-4xl text-amber-500"></i><p class="mt-4 text-slate-500">טוען את החנות...</p></div>';

    try {
        // שליפת פריטים מהחנות
        const { data: items, error: itemsError } = await supabaseClient
            .from('shop_items')
            .select('*')
            .eq('is_active', true)
            .order('price', { ascending: true });

        if (itemsError) throw itemsError;
        shopItems = items;

        // שליפת המלאי של המשתמש
        if (currentUser) {
            const { data: inv, error: invError } = await supabaseClient
                .from('user_inventory')
                .select('*')
                .eq('user_email', currentUser.email);
            if (invError) throw invError;
            userInventory = inv;
        }

        // רינדור הגריד
        html += `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">`;

        if (shopItems.length === 0) {
            html += `<div class="col-span-full text-center text-slate-500 py-20 bg-white dark:bg-slate-800 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700">
                <i class="fas fa-store-slash text-4xl mb-4 opacity-50"></i>
                <p>החנות ריקה כרגע. חזור בקרוב!</p>
            </div>`;
        } else {
            shopItems.forEach(item => {
                const ownedItem = userInventory.find(i => i.item_id === item.id);
                const isOwned = !!ownedItem;
                const isEquipped = ownedItem && ownedItem.is_equipped;
                const canAfford = currentUser && currentUser.reward_points >= item.price;

                let btnHtml = '';
                if (isOwned) {
                    if (isEquipped) {
                        btnHtml = `<button class="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-default font-bold flex items-center justify-center gap-2"><i class="fas fa-check-circle"></i> בשימוש</button>`;
                    } else {
                        btnHtml = `<button class="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold hover:opacity-90 transition-all shadow-md" onclick="equipItem(${item.id}, '${item.item_type}')">הפעל רקע/אייקון</button>`;
                    }
                } else {
                    if (canAfford) {
                        btnHtml = `<button class="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold hover:shadow-lg hover:shadow-amber-500/30 transition-all transform active:scale-95" onclick="purchaseItem(${item.id}, ${item.price})">
                            רכוש ב-${item.price} <i class="fas fa-coins text-xs"></i>
                        </button>`;
                    } else {
                        btnHtml = `<button class="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed font-bold border border-slate-200 dark:border-slate-700">חסרים ${item.price - currentUser.reward_points} נק'</button>`;
                    }
                }

                // תצוגה מקדימה לפי סוג
                let previewHtml = '';
                if (item.image_url) {
                    if (item.item_type === 'icon') {
                        previewHtml = `<div class="w-24 h-24 rounded-full border-4 border-white dark:border-slate-800 shadow-lg overflow-hidden mx-auto"><img src="${item.image_url}" class="w-full h-full object-cover"></div>`;
                    } else {
                        previewHtml = `<img src="${item.image_url}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700">`;
                    }
                } else {
                    previewHtml = `<i class="fas fa-gift text-5xl text-slate-300"></i>`;
                }

                html += `
                <div class="bg-white dark:bg-slate-800 rounded-3xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col h-full hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
                    ${isOwned ? '<div class="absolute top-4 right-4 bg-green-500 text-white text-[10px] px-2 py-1 rounded-full font-bold z-10 shadow-sm flex items-center gap-1"><i class="fas fa-check"></i> נרכש</div>' : ''}
                    
                    <div class="h-48 rounded-2xl bg-slate-50 dark:bg-slate-900 mb-4 overflow-hidden relative flex items-center justify-center border border-slate-100 dark:border-slate-700/50">
                        ${previewHtml}
                        ${item.item_type === 'background' ? '<div class="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm">רקע</div>' : ''}
                        ${item.item_type === 'icon' ? '<div class="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm">אייקון</div>' : ''}
                    </div>
                    
                    <div class="flex-1 flex flex-col">
                        <h3 class="font-bold text-lg text-slate-900 dark:text-white mb-1 leading-tight">${item.name}</h3>
                        <p class="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">${item.description || 'ללא תיאור'}</p>
                        
                        <div class="mt-auto pt-4 border-t border-slate-100 dark:border-slate-700">
                            ${btnHtml}
                        </div>
                    </div>
                </div>
                `;
            });
        }
        html += `</div></div>`;
        container.innerHTML = html;

    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="text-center p-10 text-red-500">
            <i class="fas fa-exclamation-triangle text-4xl mb-2"></i>
            <p>שגיאה בטעינת החנות. נסה לרענן.</p>
        </div>`;
    }
}

async function purchaseItem(itemId, price) {
    if (!requireAuth()) return;
    if (!await customConfirm(`האם לרכוש פריט זה ב-${price} נקודות?`)) return;

    try {
        // 1. הפחתת נקודות
        const { error: updateError } = await supabaseClient.rpc('decrement_field', { 
            table_name: 'users', 
            field_name: 'reward_points', 
            decrement_value: price, 
            user_email: currentUser.email 
        });
        
        if (updateError) throw updateError;

        // 2. הוספה למלאי
        const { error: insertError } = await supabaseClient.from('user_inventory').insert([{
            user_email: currentUser.email,
            item_id: itemId
        }]);

        if (insertError) throw insertError;

        // עדכון מקומי
        currentUser.reward_points -= price;
        localStorage.setItem('torahApp_user', JSON.stringify(currentUser));
        
        showToast("תתחדש! הרכישה בוצעה בהצלחה.", "success");
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#f59e0b', '#fbbf24'] });
        renderShop();

    } catch (e) {
        console.error(e);
        await customAlert("שגיאה בביצוע הרכישה. בדוק את חיבור האינטרנט שלך.");
    }
}

async function equipItem(itemId, type) {
    if (!requireAuth()) return;
    try {
        // 1. איפוס בחירה קודמת מאותו סוג (למשל, ביטול רקע קודם)
        // נשלוף את כל הפריטים מהסוג הזה שיש למשתמש
        const itemsOfType = shopItems.filter(i => i.item_type === type).map(i => i.id);
        
        await supabaseClient.from('user_inventory')
            .update({ is_equipped: false })
            .eq('user_email', currentUser.email)
            .in('item_id', itemsOfType);

        // 2. הפעלת הפריט החדש
        await supabaseClient.from('user_inventory')
            .update({ is_equipped: true })
            .eq('user_email', currentUser.email)
            .eq('item_id', itemId);

        showToast("הפריט הופעל בהצלחה!", "success");
        
        // החלת השינויים מיד
        await applyUserCustomizations();
        renderShop();

    } catch (e) {
        console.error(e);
        await customAlert("שגיאה בהפעלת הפריט.");
    }
}

async function applyUserCustomizations() {
    if (!currentUser) return;
    
    // שליפת פריטים פעילים
    const { data: inventory, error } = await supabaseClient
        .from('user_inventory')
        .select('item_id, shop_items(*)')
        .eq('user_email', currentUser.email)
        .eq('is_equipped', true);

    if (error || !inventory) return;

    // איפוס ברירות מחדל
    document.body.style.backgroundImage = '';
    // כאן אפשר להוסיף איפוס לאייקון אם צריך

    inventory.forEach(record => {
        const item = record.shop_items;
        if (!item) return;

        if (item.item_type === 'background') {
            if (item.image_url) {
                document.body.style.backgroundImage = `url('${item.image_url}')`;
                document.body.style.backgroundSize = 'cover';
                document.body.style.backgroundAttachment = 'fixed';
                document.body.style.backgroundPosition = 'center';
            }
        }
        // כאן אפשר להוסיף לוגיקה לאייקון אישי (item_type === 'icon')
        // למשל לעדכן את ה-src של תמונת הפרופיל בהאדר
        if (item.item_type === 'icon' && item.image_url) {
            const profileBtn = document.getElementById('headerProfileBtn');
            if (profileBtn) {
                profileBtn.innerHTML = `<img src="${item.image_url}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
            }
        }
    });
}